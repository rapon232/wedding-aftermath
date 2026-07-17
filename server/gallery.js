import express from 'express';
import fs from 'fs';
import path from 'path';
import { db } from './db.js';
import { dirs } from './config.js';
import { requireApi } from './auth.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const CONTENT_TYPE = {
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  m4v: 'video/x-m4v',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  heic: 'image/heic',
  heif: 'image/heif',
};
const PAGE_DEFAULT = 60;
const PAGE_MAX = 100;

export const galleryRouter = express.Router();

// Latest ≤3 comments per item, attached to a page of rows in one batched query —
// the lightbox overlay renders from this, so swiping never fetches comments.
const PREVIEW_MAX = 3;
const PREVIEW_BODY_MAX = 140;
function attachCommentPreviews(rows) {
  for (const r of rows) r.comments_preview = [];
  if (!rows.length) return;
  const byId = new Map(rows.map((r) => [r.id, r]));
  const ph = [...byId.keys()].map(() => '?').join(',');
  const all = db
    .prepare(
      `SELECT c.media_id, c.body, g.name AS guest_name
       FROM media_comments c JOIN guests g ON g.id = c.guest_id
       WHERE c.media_id IN (${ph})
       ORDER BY c.created_at DESC, c.id DESC`,
    )
    .all(...byId.keys());
  for (const c of all) {
    const list = byId.get(c.media_id).comments_preview;
    if (list.length < PREVIEW_MAX) {
      list.push({ guest_name: c.guest_name, body: c.body.slice(0, PREVIEW_BODY_MAX) });
    }
  }
  for (const r of rows) r.comments_preview.reverse(); // oldest → newest, chat order
}

// --- Listing: keyset-paginated, sortable, filterable ---

galleryRouter.get('/api/media', requireApi, (req, res) => {
  const loved = req.query.sort === 'loved';
  const commented = req.query.sort === 'commented';
  const sortCol = req.query.sort === 'uploaded' ? 'uploaded_at' : 'taken_at';
  const dir = req.query.dir === 'asc' ? 'ASC' : 'DESC';
  // Clamp to a sane integer: guards against ?limit=-5 (SQLite LIMIT -1 = all rows)
  // and ?limit=2.5 (datatype mismatch).
  const limit = Math.min(Math.max(1, Math.trunc(Number(req.query.limit)) || PAGE_DEFAULT), PAGE_MAX);
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

  // NB: the faved and seen subqueries each introduce a leading `?` (the current
  // guest id), so guest id is always the first two bound parameters.
  const cols = `m.id, m.type, m.ext, m.filename, m.size, m.taken_at, m.uploaded_at,
                m.width, m.height, m.duration_s, m.pinned_at, m.uploader_id, g.name AS uploader_name,
                (SELECT COUNT(*) FROM media_reactions r WHERE r.media_id = m.id) AS fav_count,
                (SELECT COUNT(*) FROM media_comments c WHERE c.media_id = m.id) AS comment_count,
                EXISTS(SELECT 1 FROM media_reactions r WHERE r.media_id = m.id AND r.guest_id = ?) AS faved,
                EXISTS(SELECT 1 FROM media_seen s WHERE s.media_id = m.id AND s.guest_id = ?) AS seen`;

  // Pinned items also appear as copies in their own section at the top, but the
  // originals keep their place in the paged stream (chronology is preserved).
  const listFilters = [...base];
  const listParams = [...baseParams];
  let nextCursor = null;
  let rows;

  if (loved || commented) {
    // Highlight views: top items by favorite / comment count, no infinite scroll.
    const metric = loved ? 'fav_count' : 'comment_count';
    rows = db
      .prepare(
        `SELECT ${cols} FROM media m JOIN guests g ON g.id = m.uploader_id
         WHERE ${listFilters.join(' AND ')}
         ORDER BY ${metric} DESC, m.taken_at DESC, m.id DESC
         LIMIT ?`,
      )
      .all(gid, gid, ...listParams, PAGE_MAX);
    rows = rows.filter((r) => r[metric] > 0); // nothing yet → empty, not a random dump
  } else {
    // Keyset cursor: stable under concurrent inserts, no OFFSET scans
    if (req.query.cursor) {
      try {
        const { v, id } = JSON.parse(Buffer.from(String(req.query.cursor), 'base64url').toString());
        if (typeof v !== 'string' || typeof id !== 'string') throw new Error();
        listFilters.push(
          dir === 'DESC'
            ? `(m.${sortCol} < ? OR (m.${sortCol} = ? AND m.id < ?))`
            : `(m.${sortCol} > ? OR (m.${sortCol} = ? AND m.id > ?))`,
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
         LIMIT ?`,
      )
      .all(gid, gid, ...listParams, limit + 1);
    if (rows.length > limit) {
      rows.length = limit;
      const last = rows[rows.length - 1];
      nextCursor = Buffer.from(JSON.stringify({ v: last[sortCol], id: last.id })).toString('base64url');
    }
  }

  attachCommentPreviews(rows);
  const body = { items: rows, nextCursor };
  if (!req.query.cursor) {
    // First page also carries the pinned set (oldest-pinned first) and the type totals.
    body.pinned = db
      .prepare(
        `SELECT ${cols} FROM media m JOIN guests g ON g.id = m.uploader_id
         WHERE ${base.join(' AND ')} AND m.pinned_at IS NOT NULL
         ORDER BY m.pinned_at ASC, m.id ASC`,
      )
      .all(gid, gid, ...baseParams);
    attachCommentPreviews(body.pinned);
    const totals = db
      .prepare(`SELECT m.type, COUNT(*) AS n FROM media m WHERE ${base.join(' AND ')} GROUP BY m.type`)
      .all(...baseParams)
      .reduce((acc, r) => ({ ...acc, [r.type]: r.n }), {});
    body.totals = { photo: totals.photo || 0, video: totals.video || 0 };

    // "New for you": ready items the guest hasn't opened in the lightbox yet,
    // excluding their own uploads (those aren't "new" to them).
    body.newCount = db
      .prepare(
        `SELECT COUNT(*) AS n FROM media m
         WHERE m.status = 'ready' AND m.uploader_id != ?
           AND NOT EXISTS(SELECT 1 FROM media_seen s WHERE s.media_id = m.id AND s.guest_id = ?)`,
      )
      .get(gid, gid).n;
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
         GROUP BY g.id ORDER BY g.name COLLATE NOCASE`,
      )
      .all(),
  );
});

// --- Media files: session-protected, immutable-cached ---

function sendDerived(res, dir, id, ext) {
  if (!UUID_RE.test(id)) return res.status(400).end();
  const p = path.join(dir, `${id}.${ext}`);
  if (!fs.existsSync(p)) return res.status(404).end();
  res.set('Cache-Control', 'private, max-age=31536000, immutable');
  res.set('X-Content-Type-Options', 'nosniff');
  res.sendFile(p);
}

galleryRouter.get('/media/thumb/:id', requireApi, (req, res) =>
  sendDerived(res, dirs.thumbs, req.params.id, 'webp'),
);
galleryRouter.get('/media/preview/:id', requireApi, (req, res) =>
  sendDerived(res, dirs.previews, req.params.id, 'webp'),
);
galleryRouter.get('/media/poster/:id', requireApi, (req, res) =>
  sendDerived(res, dirs.posters, req.params.id, 'jpg'),
);

// Originals: inline for playback/lightbox, attachment with ?download=1.
// res.sendFile handles HTTP Range requests (video seeking) natively.
galleryRouter.get('/media/file/:id', requireApi, (req, res) => {
  if (!UUID_RE.test(req.params.id)) return res.status(400).end();
  const m = db.prepare('SELECT id, ext, filename FROM media WHERE id = ?').get(req.params.id);
  if (!m) return res.status(404).end();
  const p = path.join(dirs.originals, `${m.id}.${m.ext}`);
  if (!fs.existsSync(p)) return res.status(404).end();
  res.set('Cache-Control', 'private, max-age=31536000, immutable');
  res.set('X-Content-Type-Options', 'nosniff');
  const disposition = req.query.download ? 'attachment' : 'inline';
  res.set('Content-Disposition', `${disposition}; filename*=UTF-8''${encodeURIComponent(m.filename)}`);
  // Explicit content types so mobile browsers (esp. Android) handle video correctly.
  const ct = CONTENT_TYPE[m.ext];
  if (ct) res.type(ct);
  res.sendFile(p);
});
