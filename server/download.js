import express from 'express';
import archiver from 'archiver';
import fs from 'fs';
import path from 'path';
import { db } from './db.js';
import { dirs } from './config.js';
import { requireApi } from './auth.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const downloadRouter = express.Router();

// Bulk zip. urlencoded body (submitted via a plain form so the browser natively
// streams the response to disk): either ids=<comma-separated>, or all=1 with
// optional type/uploader filters mirroring the gallery view.
downloadRouter.post(
  '/api/download',
  requireApi,
  express.urlencoded({ extended: false, limit: '1mb' }),
  (req, res) => {
    let rows;
    if (req.body.all) {
      const filters = ["status = 'ready'"];
      const params = [];
      if (req.body.type === 'photo' || req.body.type === 'video') {
        filters.push('type = ?');
        params.push(req.body.type);
      }
      if (req.body.uploader) {
        filters.push('uploader_id = ?');
        params.push(Number(req.body.uploader));
      }
      rows = db.prepare(`SELECT id, ext, filename FROM media WHERE ${filters.join(' AND ')}`).all(...params);
    } else {
      const ids = String(req.body.ids || '')
        .split(',')
        .filter((id) => UUID_RE.test(id));
      if (!ids.length) return res.status(400).json({ error: 'nothing selected' });
      const placeholders = ids.map(() => '?').join(',');
      rows = db.prepare(`SELECT id, ext, filename FROM media WHERE id IN (${placeholders})`).all(...ids);
    }
    if (!rows.length) return res.status(404).json({ error: 'no media found' });

    res.set('Content-Type', 'application/zip');
    res.set('Content-Disposition', `attachment; filename="aftermath-${rows.length}-items.zip"`);

    // store (no compression): media is already compressed; keeps CPU flat and stream fast
    const zip = archiver('zip', { store: true });
    zip.on('error', (err) => {
      console.error('zip stream error:', err.message);
      res.destroy();
    });
    res.on('close', () => zip.destroy());
    zip.pipe(res);

    const used = new Set();
    for (const m of rows) {
      const p = path.join(dirs.originals, `${m.id}.${m.ext}`);
      if (!fs.existsSync(p)) continue;
      // De-duplicate filenames inside the archive ("IMG_1.jpg (2)" style)
      let name = m.filename;
      for (let i = 2; used.has(name); i++) {
        const dot = m.filename.lastIndexOf('.');
        name = dot > 0 ? `${m.filename.slice(0, dot)} (${i})${m.filename.slice(dot)}` : `${m.filename} (${i})`;
      }
      used.add(name);
      zip.file(p, { name });
    }
    zip.finalize();
  }
);
