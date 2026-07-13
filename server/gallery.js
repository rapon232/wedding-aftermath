import express from 'express';
import fs from 'fs';
import path from 'path';
import { db } from './db.js';
import { dirs } from './config.js';
import { requireApi } from './auth.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const CONTENT_TYPE = {
  mp4: 'video/mp4', mov: 'video/quicktime', m4v: 'video/x-m4v',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  webp: 'image/webp', gif: 'image/gif', heic: 'image/heic', heif: 'image/heif',
};
const PAGE_DEFAULT = 60;
const PAGE_MAX = 100;

export const galleryRouter = express.Router();

// --- Listing: keyset-paginated, sortable, filterable ---

galleryRouter.get('/api/media', requireApi, (req, res) => {
  const loved = req.query.sort === 'loved';
  const sortCol = req.query.sort === 'uploaded' ? 'uploaded_at' : 'taken_at';
  const dir = req.query.dir === 'asc' ? 'ASC' : 'DESC';
  const limit = Math.min(Number(req.query.limit) || PAGE_DEFAULT, PAGE_MAX);
  const gid = req.guest.id;

  // Base filters (status + type/uploader) apply to the paginated list, the pinned
  // set, and the totals alike.
  const base = ["m.status = 'ready'"];
  const baseParams = [];
  if (req.query.uploader) {
    base.push('m.uploader_id = ?');
    baseParams.push(Number(req.query.uploader));
  }
  if (req.query.type === 'photo' || req.query.type === 'video') {
    base.push('m.type = ?');
    baseParams.push(req.query.type);
  }

  // NB: fav_count/faved subqueries introduce a leading `?` (the current guest id),
  // so guest id is always the first bound parameter.
  const cols = `m.id, m.type, m.ext, m.filename, m.size, m.taken_at, m.uploaded_at,
                m.width, m.height, m.duration_s, m.pinned_at, m.uploader_id, g.name AS uploader_name,
                (SELECT COUNT(*) FROM media_reactions r WHERE r.media_id = m.id) AS fav_count,
                EXISTS(SELECT 1 FROM media_reactions r WHERE r.media_id = m.id AND r.guest_id = ?) AS faved`;

  // Pinned items are shown separately at the top, so exclude them from the paged list.
  const listFilters = [...base, 'm.pinned_at IS NULL'];
  const listParams = [...baseParams];
  let nextCursor = null;
  let rows;

  if (loved) {
    // "Most loved" is a highlight view: top items by favorite count, no infinite scroll.
    rows = db
      .prepare(
        `SELECT ${cols} FROM media m JOIN guests g ON g.id = m.uploader_id
         WHERE ${listFilters.join(' AND ')}
         ORDER BY fav_count DESC, m.taken_at DESC, m.id DESC
         LIMIT ?`
      )
      .all(gid, ...listParams, PAGE_MAX);
    rows = rows.filter((r) => r.fav_count > 0); // nothing loved yet → empty, not a random dump
  } else {
    // Keyset cursor: stable under concurrent inserts, no OFFSET scans
    if (req.query.cursor) {
      try {
        const { v, id } = JSON.parse(Buffer.from(String(req.query.cursor), 'base64url').toString());
        if (typeof v !== 'string' || typeof id !== 'string') throw new Error();
        listFilters.push(
          dir === 'DESC'
            ? `(m.${sortCol} < ? OR (m.${sortCol} = ? AND m.id < ?))`
            : `(m.${sortCol} > ? OR (m.${sortCol} = ? AND m.id > ?))`
        );
        listParams.push(v, v, id);
      } catch {
        return res.status(400).json({ error: 'bad cursor' });
      }
    }
    rows = db
      .prepare(
        `SELECT ${cols} FROM media m JOIN guests g ON g.id = m.uploader_id
         WHERE ${listFilters.join(' AND ')}
         ORDER BY m.${sortCol} ${dir}, m.id ${dir}
         LIMIT ?`
      )
      .all(gid, ...listParams, limit + 1);
    if (rows.length > limit) {
      rows.length = limit;
      const last = rows[rows.length - 1];
      nextCursor = Buffer.from(JSON.stringify({ v: last[sortCol], id: last.id })).toString('base64url');
    }
  }

  const body = { items: rows, nextCursor };
  if (!req.query.cursor) {
    // First page also carries the pinned set (oldest-pinned first) and the type totals.
    body.pinned = db
      .prepare(
        `SELECT ${cols} FROM media m JOIN guests g ON g.id = m.uploader_id
         WHERE ${base.join(' AND ')} AND m.pinned_at IS NOT NULL
         ORDER BY m.pinned_at ASC, m.id ASC`
      )
      .all(gid, ...baseParams);
    const totals = db
      .prepare(`SELECT m.type, COUNT(*) AS n FROM media m WHERE ${base.join(' AND ')} GROUP BY m.type`)
      .all(...baseParams)
      .reduce((acc, r) => ({ ...acc, [r.type]: r.n }), {});
    body.totals = { photo: totals.photo || 0, video: totals.video || 0 };

    // "New since your last visit": count ready media uploaded after last-seen,
    // excluding the guest's own uploads (their own aren't "new" to them).
    const seen = db.prepare('SELECT last_seen_at FROM guests WHERE id = ?').get(gid).last_seen_at;
    body.newCount = seen
      ? db
          .prepare(
            `SELECT COUNT(*) AS n FROM media
             WHERE status = 'ready' AND uploaded_at > ? AND uploader_id != ?`
          )
          .get(seen, gid).n
      : 0;
  }
  res.json(body);
});

galleryRouter.get('/api/uploaders', requireApi, (_req, res) => {
  res.json(
    db
      .prepare(
        `SELECT g.id, g.name, COUNT(*) AS count
         FROM media m JOIN guests g ON g.id = m.uploader_id
         WHERE m.status = 'ready'
         GROUP BY g.id ORDER BY g.name COLLATE NOCASE`
      )
      .all()
  );
});

// --- Media files: session-protected, immutable-cached ---

function sendDerived(res, dir, id, ext) {
  if (!UUID_RE.test(id)) return res.status(400).end();
  const p = path.join(dir, `${id}.${ext}`);
  if (!fs.existsSync(p)) return res.status(404).end();
  res.set('Cache-Control', 'private, max-age=31536000, immutable');
  res.sendFile(p);
}

galleryRouter.get('/media/thumb/:id', requireApi, (req, res) => sendDerived(res, dirs.thumbs, req.params.id, 'webp'));
galleryRouter.get('/media/preview/:id', requireApi, (req, res) => sendDerived(res, dirs.previews, req.params.id, 'webp'));
galleryRouter.get('/media/poster/:id', requireApi, (req, res) => sendDerived(res, dirs.posters, req.params.id, 'jpg'));

// Originals: inline for playback/lightbox, attachment with ?download=1.
// res.sendFile handles HTTP Range requests (video seeking) natively.
galleryRouter.get('/media/file/:id', requireApi, (req, res) => {
  if (!UUID_RE.test(req.params.id)) return res.status(400).end();
  const m = db.prepare('SELECT id, ext, filename FROM media WHERE id = ?').get(req.params.id);
  if (!m) return res.status(404).end();
  const p = path.join(dirs.originals, `${m.id}.${m.ext}`);
  if (!fs.existsSync(p)) return res.status(404).end();
  res.set('Cache-Control', 'private, max-age=31536000, immutable');
  const disposition = req.query.download ? 'attachment' : 'inline';
  res.set('Content-Disposition', `${disposition}; filename*=UTF-8''${encodeURIComponent(m.filename)}`);
  // Explicit content types so mobile browsers (esp. Android) handle video correctly.
  const ct = CONTENT_TYPE[m.ext];
  if (ct) res.type(ct);
  res.sendFile(p);
});
