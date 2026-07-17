// Comments on media + a shared guestbook of notes to the couple.
import express from 'express';
import { db } from './db.js';
import { requireApi, requireAdmin } from './auth.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MAX_LEN = 1000;

// Control-char strip + length cap. Bodies are rendered via textContent client-side,
// so no HTML escaping is needed here.
function cleanBody(raw) {
  // Strip control chars but keep newlines/tabs so multi-line notes survive.
  return String(raw || '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
    .trim()
    .slice(0, MAX_LEN);
}

// Simple per-guest write throttle shared by comments + notes.
const writes = new Map();
function writeGuard(req, res, next) {
  const now = Date.now();
  const times = (writes.get(req.guest.id) || []).filter((t) => t > now - 60_000);
  if (times.length >= 30) return res.status(429).json({ error: 'Slow down a moment 🙂' });
  times.push(now);
  writes.set(req.guest.id, times);
  next();
}

export const socialRouter = express.Router();

// --- Seen tracking (per-guest NEW badges) ---
// The lightbox reports each item it shows; idempotent, so re-views are free.
socialRouter.post('/api/media/:id/seen', requireApi, (req, res) => {
  if (!UUID_RE.test(req.params.id)) return res.status(400).json({ error: 'bad id' });
  const exists = db.prepare('SELECT 1 FROM media WHERE id = ?').get(req.params.id);
  if (!exists) return res.status(404).json({ error: 'not found' });
  db.prepare('INSERT OR IGNORE INTO media_seen (media_id, guest_id) VALUES (?, ?)').run(
    req.params.id,
    req.guest.id,
  );
  res.status(204).end();
});

// --- Comments on a media item ---

socialRouter.get('/api/media/:id/comments', requireApi, (req, res) => {
  if (!UUID_RE.test(req.params.id)) return res.status(400).json({ error: 'bad id' });
  const rows = db
    .prepare(
      `SELECT c.id, c.body, c.created_at, c.guest_id, g.name AS guest_name
       FROM media_comments c JOIN guests g ON g.id = c.guest_id
       WHERE c.media_id = ? ORDER BY c.created_at ASC`,
    )
    .all(req.params.id);
  res.json(rows);
});

socialRouter.post('/api/media/:id/comments', requireApi, writeGuard, (req, res) => {
  if (!UUID_RE.test(req.params.id)) return res.status(400).json({ error: 'bad id' });
  if (!db.prepare('SELECT 1 FROM media WHERE id = ?').get(req.params.id)) {
    return res.status(404).json({ error: 'not found' });
  }
  const body = cleanBody(req.body?.body);
  if (!body) return res.status(400).json({ error: 'empty comment' });
  const info = db
    .prepare('INSERT INTO media_comments (media_id, guest_id, body) VALUES (?, ?, ?)')
    .run(req.params.id, req.guest.id, body);
  const row = db
    .prepare(
      `SELECT c.id, c.body, c.created_at, c.guest_id, g.name AS guest_name
       FROM media_comments c JOIN guests g ON g.id = c.guest_id WHERE c.id = ?`,
    )
    .get(info.lastInsertRowid);
  res.status(201).json(row);
});

socialRouter.delete('/api/comments/:id', requireApi, (req, res) => {
  const c = db.prepare('SELECT id, guest_id FROM media_comments WHERE id = ?').get(Number(req.params.id));
  if (!c) return res.status(404).json({ error: 'not found' });
  if (c.guest_id !== req.guest.id && !req.guest.is_admin) return res.status(403).json({ error: 'forbidden' });
  db.prepare('DELETE FROM media_comments WHERE id = ?').run(c.id);
  res.json({ ok: true });
});

// --- Private notes to the couple: anyone can leave one, only admins can read ---

socialRouter.get('/api/notes', requireAdmin, (_req, res) => {
  res.json(
    db
      .prepare(
        `SELECT n.id, n.body, n.created_at, n.guest_id, g.name AS guest_name
         FROM notes n JOIN guests g ON g.id = n.guest_id ORDER BY n.created_at DESC`,
      )
      .all(),
  );
});

socialRouter.post('/api/notes', requireApi, writeGuard, (req, res) => {
  const body = cleanBody(req.body?.body);
  if (!body) return res.status(400).json({ error: 'empty note' });
  const info = db.prepare('INSERT INTO notes (guest_id, body) VALUES (?, ?)').run(req.guest.id, body);
  const row = db
    .prepare(
      `SELECT n.id, n.body, n.created_at, n.guest_id, g.name AS guest_name
       FROM notes n JOIN guests g ON g.id = n.guest_id WHERE n.id = ?`,
    )
    .get(info.lastInsertRowid);
  res.status(201).json(row);
});

socialRouter.delete('/api/notes/:id', requireApi, (req, res) => {
  const n = db.prepare('SELECT id, guest_id FROM notes WHERE id = ?').get(Number(req.params.id));
  if (!n) return res.status(404).json({ error: 'not found' });
  if (n.guest_id !== req.guest.id && !req.guest.is_admin) return res.status(403).json({ error: 'forbidden' });
  db.prepare('DELETE FROM notes WHERE id = ?').run(n.id);
  res.json({ ok: true });
});
