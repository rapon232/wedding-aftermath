import express from 'express';
import { db, generateCode } from './db.js';
import { config } from './config.js';

const COOKIE = 'lw_session';

export function setSession(res, guestId) {
  res.cookie(COOKIE, String(guestId), {
    signed: true,
    httpOnly: true,
    sameSite: 'lax',
    secure: config.prod,
    maxAge: config.sessionMaxAgeMs,
  });
}

/** Attach req.guest if a valid, non-revoked session cookie is present. */
export function loadGuest(req, _res, next) {
  const id = Number(req.signedCookies[COOKIE]);
  if (Number.isInteger(id) && id > 0) {
    const g = db
      .prepare('SELECT id, name, is_admin, revoked_at FROM guests WHERE id = ?')
      .get(id);
    if (g && !g.revoked_at) req.guest = g;
  }
  next();
}

export function requireApi(req, res, next) {
  if (!req.guest) return res.status(401).json({ error: 'unauthorized' });
  next();
}

export function requireAdmin(req, res, next) {
  if (!req.guest) return res.status(401).json({ error: 'unauthorized' });
  if (!req.guest.is_admin) return res.status(403).json({ error: 'forbidden' });
  next();
}

/** Codes are compared dash/case/space-insensitively so guests can't mistype the format. */
function normalizeCode(input) {
  return String(input || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// Minimal brute-force hygiene: 10 login attempts per IP per minute.
const attempts = new Map();
function throttleLogin(req, res, next) {
  const now = Date.now();
  const rec = attempts.get(req.ip);
  if (rec && now < rec.resetAt && rec.count >= 10) {
    return res.status(429).json({ error: 'too many attempts, wait a minute' });
  }
  if (!rec || now >= rec.resetAt) attempts.set(req.ip, { count: 1, resetAt: now + 60_000 });
  else rec.count++;
  next();
}

export const authRouter = express.Router();

authRouter.post('/api/login', throttleLogin, (req, res) => {
  const code = normalizeCode(req.body?.code);
  if (!code) return res.status(400).json({ error: 'code required' });
  const guest = db
    .prepare("SELECT id, name, is_admin, revoked_at FROM guests WHERE replace(code, '-', '') = ?")
    .get(code);
  if (!guest || guest.revoked_at) return res.status(401).json({ error: 'invalid code' });
  setSession(res, guest.id);
  res.json({ id: guest.id, name: guest.name, isAdmin: !!guest.is_admin });
});

authRouter.post('/api/logout', (_req, res) => {
  res.clearCookie(COOKIE);
  res.json({ ok: true });
});

authRouter.get('/api/me', requireApi, (req, res) => {
  // Return the *previous* last-seen so the gallery can compute "new since your
  // last visit"; the client stamps a fresh timestamp via POST /api/seen after load.
  const g = db.prepare('SELECT last_seen_at FROM guests WHERE id = ?').get(req.guest.id);
  res.json({
    id: req.guest.id,
    name: req.guest.name,
    isAdmin: !!req.guest.is_admin,
    eventTz: config.eventTz,
    lastSeen: g.last_seen_at || null,
  });
});

authRouter.post('/api/seen', requireApi, (req, res) => {
  db.prepare("UPDATE guests SET last_seen_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?").run(req.guest.id);
  res.json({ ok: true });
});

// --- Admin: guest code management ---

authRouter.get('/api/admin/guests', requireAdmin, (_req, res) => {
  const guests = db
    .prepare(`
      SELECT g.id, g.code, g.name, g.is_admin, g.revoked_at, g.created_at,
             COUNT(m.id) AS media_count
      FROM guests g LEFT JOIN media m ON m.uploader_id = g.id
      GROUP BY g.id ORDER BY g.name COLLATE NOCASE
    `)
    .all();
  res.json(guests);
});

authRouter.post('/api/admin/guests', requireAdmin, (req, res) => {
  const names = Array.isArray(req.body?.names) ? req.body.names : [req.body?.name];
  const clean = names
    .map((n) => String(n || '').trim().slice(0, 100))
    .filter(Boolean);
  if (!clean.length) return res.status(400).json({ error: 'name(s) required' });
  const insert = db.prepare('INSERT INTO guests (code, name) VALUES (?, ?)');
  const created = db.transaction(() =>
    clean.map((name) => {
      const code = generateCode();
      const { lastInsertRowid } = insert.run(code, name);
      return { id: Number(lastInsertRowid), name, code };
    })
  )();
  res.status(201).json(created);
});

authRouter.post('/api/admin/guests/:id/revoke', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (id === req.guest.id) return res.status(400).json({ error: 'cannot revoke yourself' });
  const info = db
    .prepare("UPDATE guests SET revoked_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND revoked_at IS NULL")
    .run(id);
  if (!info.changes) return res.status(404).json({ error: 'not found or already revoked' });
  res.json({ ok: true });
});

authRouter.post('/api/admin/guests/:id/restore', requireAdmin, (req, res) => {
  const info = db.prepare('UPDATE guests SET revoked_at = NULL WHERE id = ?').run(Number(req.params.id));
  if (!info.changes) return res.status(404).json({ error: 'not found' });
  res.json({ ok: true });
});
