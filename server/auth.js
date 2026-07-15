import express from 'express';
import { db, generateCode } from './db.js';
import { config } from './config.js';
import { emailConfigured, sendInvite } from './email.js';

const COOKIE = 'lw_session';

// Linear (no-backtracking) email sanity check: local@domain with a dot in domain.
const isEmail = (e) => /^[^@\s]+@[^@\s]+$/.test(e) && e.slice(e.indexOf('@') + 1).includes('.');

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
  // Prune expired entries so the Map can't grow unbounded (belt-and-braces with trust proxy 1).
  if (attempts.size > 1000) {
    for (const [ip, r] of attempts) if (now >= r.resetAt) attempts.delete(ip);
  }
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
  // Stamp first-login time once → drives the "activated" dot in the guest panel.
  db.prepare("UPDATE guests SET activated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND activated_at IS NULL").run(
    guest.id
  );
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
      SELECT g.id, g.code, g.name, g.email, g.is_admin, g.revoked_at, g.created_at,
             g.invited_at, g.activated_at,
             COUNT(m.id) AS media_count
      FROM guests g LEFT JOIN media m ON m.uploader_id = g.id
      GROUP BY g.id ORDER BY g.name COLLATE NOCASE
    `)
    .all();
  res.json(guests);
});

authRouter.post('/api/admin/guests', requireAdmin, (req, res) => {
  const names = Array.isArray(req.body?.names) ? req.body.names : [req.body?.name];
  const clean = names.map((n) => String(n || '').trim().slice(0, 100)).filter(Boolean);
  if (!clean.length) return res.status(400).json({ error: 'name(s) required' });
  // An optional email may be supplied only when adding a single guest by hand,
  // so we can invite them straight away without a CSV import.
  const emailRaw = String(req.body?.email || '').trim().toLowerCase();
  if (emailRaw && clean.length !== 1) return res.status(400).json({ error: 'email only allowed with a single name' });
  if (emailRaw && !isEmail(emailRaw)) return res.status(400).json({ error: 'invalid email' });
  const email = emailRaw || null;
  // Skip names (and, if given, emails) that already exist so we don't duplicate.
  const existing = new Set(db.prepare('SELECT lower(name) AS n FROM guests').all().map((r) => r.n));
  const existingEmails = new Set(
    db.prepare('SELECT lower(email) AS e FROM guests WHERE email IS NOT NULL').all().map((r) => r.e)
  );
  const insert = db.prepare('INSERT INTO guests (code, name, email) VALUES (?, ?, ?)');
  const created = [];
  let skipped = 0;
  db.transaction(() => {
    for (const name of clean) {
      const key = name.toLowerCase();
      if (existing.has(key) || (email && existingEmails.has(email))) { skipped++; continue; }
      existing.add(key);
      if (email) existingEmails.add(email);
      const code = generateCode();
      const { lastInsertRowid } = insert.run(code, name, email);
      created.push({ id: Number(lastInsertRowid), name, email, code });
    }
  })();
  // Return the created guests as an array (only the new ones; dupes are skipped).
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

// Grant / revoke admin. Won't remove the last remaining admin (lock-out guard).
authRouter.post('/api/admin/guests/:id/admin', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const makeAdmin = req.body?.isAdmin !== false;
  const g = db.prepare('SELECT id, is_admin FROM guests WHERE id = ?').get(id);
  if (!g) return res.status(404).json({ error: 'not found' });
  if (!makeAdmin) {
    const admins = db.prepare('SELECT COUNT(*) AS n FROM guests WHERE is_admin = 1 AND revoked_at IS NULL').get().n;
    if (g.is_admin && admins <= 1) return res.status(400).json({ error: 'need at least one admin' });
  }
  db.prepare('UPDATE guests SET is_admin = ? WHERE id = ?').run(makeAdmin ? 1 : 0, id);
  res.json({ ok: true, isAdmin: makeAdmin });
});

// Bulk-create guests from a name,email CSV (or a rows array). Dedupe by email.
authRouter.post('/api/admin/import', requireAdmin, (req, res) => {
  let rows = [];
  if (Array.isArray(req.body?.rows)) {
    rows = req.body.rows.map((r) => ({ name: r.name, email: r.email }));
  } else if (typeof req.body?.csv === 'string') {
    rows = parseCsv(req.body.csv);
  } else {
    return res.status(400).json({ error: 'provide csv or rows' });
  }
  const existing = new Set(
    db.prepare('SELECT lower(email) AS e FROM guests WHERE email IS NOT NULL').all().map((r) => r.e)
  );
  const existingNames = new Set(db.prepare('SELECT lower(name) AS n FROM guests').all().map((r) => r.n));
  const insert = db.prepare('INSERT INTO guests (code, name, email) VALUES (?, ?, ?)');
  const created = [];
  let skipped = 0;
  db.transaction(() => {
    for (const r of rows) {
      const name = String(r.name || '').trim().slice(0, 100);
      const email = String(r.email || '').trim().toLowerCase();
      // Skip invalid/duplicate email OR a name that already exists.
      if (!name || !isEmail(email) || existing.has(email) || existingNames.has(name.toLowerCase())) {
        skipped++;
        continue;
      }
      existing.add(email);
      existingNames.add(name.toLowerCase());
      const code = generateCode();
      const { lastInsertRowid } = insert.run(code, name, email);
      created.push({ id: Number(lastInsertRowid), name, email, code });
    }
  })();
  res.status(201).json({ created, createdCount: created.length, skipped });
});

// Email one guest their personal link + code, and stamp invited_at.
authRouter.post('/api/admin/guests/:id/invite', requireAdmin, async (req, res, next) => {
  const g = db.prepare('SELECT id, name, email, code, revoked_at FROM guests WHERE id = ?').get(Number(req.params.id));
  if (!g) return res.status(404).json({ error: 'not found' });
  if (g.revoked_at) return res.status(400).json({ error: 'guest is revoked' });
  if (!g.email) return res.status(400).json({ error: 'this guest has no email' });
  if (!emailConfigured()) return res.status(503).json({ error: 'email is not configured on the server' });
  try {
    await sendInvite({ to: g.email, name: g.name, code: g.code });
    db.prepare("UPDATE guests SET invited_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?").run(g.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('invite send failed:', err.message);
    res.status(502).json({ error: `could not send: ${err.message}` });
  }
});

// Minimal RFC4180-ish CSV parser (name,email with a header row). Strips a BOM and
// auto-detects the delimiter (comma / semicolon / tab) — Numbers/Excel in many
// locales export semicolon-separated ".csv".
function parseCsv(text) {
  const clean = String(text).replace(/^﻿/, '');
  const lines = clean.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  // Pick the delimiter that appears most in the header line.
  const first = lines[0];
  const delim = [',', ';', '\t']
    .map((d) => [d, (first.split(d).length - 1)])
    .reduce((best, cur) => (cur[1] > best[1] ? cur : best), [',', -1])[0];
  const rows = lines.map((l) => {
    const out = [];
    let field = '';
    let q = false;
    for (let i = 0; i < l.length; i++) {
      const c = l[i];
      if (q) {
        if (c === '"') {
          if (l[i + 1] === '"') { field += '"'; i++; } else q = false;
        } else field += c;
      } else if (c === '"') q = true;
      else if (c === delim) { out.push(field); field = ''; }
      else field += c;
    }
    out.push(field);
    return out;
  });
  // Detect a header (name/email) and column order.
  let nameIdx = 0;
  let emailIdx = 1;
  const header = rows[0].map((h) => h.trim().toLowerCase());
  if (header.includes('email') || header.includes('name')) {
    const ni = header.indexOf('name');
    const ei = header.indexOf('email');
    if (ni >= 0) nameIdx = ni;
    if (ei >= 0) emailIdx = ei;
    rows.shift();
  }
  return rows.map((r) => ({ name: (r[nameIdx] || '').trim(), email: (r[emailIdx] || '').trim() }));
}
