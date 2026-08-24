import express from 'express';
import { db, generateCode } from './db.js';
import { config } from './config.js';
import { emailConfigured, sendInvite } from './email.js';

const COOKIE = 'lw_session';

// Linear (no-backtracking) email sanity check: local@domain with a dot in domain.
const isEmail = (e) => /^[^@\s]+@[^@\s]+$/.test(e) && e.slice(e.indexOf('@') + 1).includes('.');

// Sanitize a guest-supplied display name: drop control + zero-width/bidi marks
// (they corrupt the admin export and enable visual impersonation), cap length,
// and capitalize each word (the entry field shows uppercase, so guests can't
// self-check; only first letters change so intentional caps like "McArthur"
// survive). Shared by self-registration and admin rename.
function cleanGuestName(raw) {
  return (
    String(raw || '')
      // eslint-disable-next-line no-control-regex
      .replace(/[\x00-\x1f​-‏‪-‮]/g, '')
      .trim()
      .slice(0, 80)
      .replace(/(^|[\s-])(\p{L})/gu, (_, sep, ch) => sep + ch.toUpperCase())
  );
}

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
    const g = db.prepare('SELECT id, name, is_admin, revoked_at FROM guests WHERE id = ?').get(id);
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
  return String(input || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

// Minimal brute-force hygiene: 30 auth attempts per IP per minute. Sized for
// shared-code onboarding bursts — a family on one Wi-Fi IP costs 2 requests per
// guest (login + register), and 30/min is still hopeless against the 31^8 code
// space or an 8-char shared code worth rotating anyway.
const attempts = new Map();
function throttleLogin(req, res, next) {
  const now = Date.now();
  // Prune expired entries so the Map can't grow unbounded (belt-and-braces with trust proxy 1).
  if (attempts.size > 1000) {
    for (const [ip, r] of attempts) if (now >= r.resetAt) attempts.delete(ip);
  }
  const rec = attempts.get(req.ip);
  if (rec && now < rec.resetAt && rec.count >= 30) {
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
  if (!guest) {
    // Shared-code mode: the site-wide code checks out, but we don't know who
    // this is yet — no session until they introduce themselves via /api/register.
    if (config.sharedCode && code === config.sharedCode) return res.json({ needProfile: true });
    return res.status(401).json({ error: 'invalid code' });
  }
  if (guest.revoked_at) return res.status(401).json({ error: 'invalid code' });
  setSession(res, guest.id);
  // Stamp first-login time once → drives the "activated" dot in the guest panel.
  db.prepare(
    "UPDATE guests SET activated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND activated_at IS NULL",
  ).run(guest.id);
  res.json({ id: guest.id, name: guest.name, isAdmin: !!guest.is_admin });
});

// Shared-code self-registration: the code proved they're invited; name+email
// tell us who they are. Email is the identity key — the same person on a second
// device resumes their existing guest instead of forking a duplicate.
authRouter.post('/api/register', throttleLogin, (req, res) => {
  if (!config.sharedCode) return res.status(404).json({ error: 'not enabled' });
  const code = normalizeCode(req.body?.code);
  if (code !== config.sharedCode) return res.status(401).json({ error: 'invalid code' });
  const name = cleanGuestName(req.body?.name);
  const email = String(req.body?.email || '')
    .trim()
    .toLowerCase();
  if (!name) return res.status(400).json({ error: 'name required' });
  if (!isEmail(email)) return res.status(400).json({ error: 'invalid email' });

  const existing = db
    .prepare(
      'SELECT id, name, is_admin, revoked_at FROM guests WHERE email IS NOT NULL AND lower(email) = ? ORDER BY id LIMIT 1',
    )
    .get(email);
  if (existing) {
    // Never hand out an admin session for shared-code + email — the shared code
    // is quasi-public, so an admin's known email must not be an escalation path.
    // Admins sign in with their personal code like before.
    if (existing.is_admin) return res.status(401).json({ error: 'invalid code' });
    if (existing.revoked_at) return res.status(403).json({ error: 'access revoked' });
    setSession(res, existing.id);
    db.prepare(
      "UPDATE guests SET activated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND activated_at IS NULL",
    ).run(existing.id);
    return res.json({ id: existing.id, name: existing.name, isAdmin: !!existing.is_admin });
  }

  // New face: their personal code is generated (schema wants one) but invisible —
  // they'll always come back through the shared code + their email.
  let row;
  for (let attempt = 0; ; attempt++) {
    try {
      row = db
        .prepare(
          `INSERT INTO guests (code, name, email, activated_at)
           VALUES (?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now')) RETURNING id, name`,
        )
        .get(generateCode(), name, email);
      break;
    } catch (err) {
      // Astronomically unlikely code collision — retry with a fresh one. Any
      // other constraint is a real error and must surface, not be retried.
      const codeCollision =
        String(err.code).startsWith('SQLITE_CONSTRAINT') && /guests\.code/.test(String(err.message));
      if (!codeCollision || attempt >= 4) throw err;
    }
  }
  setSession(res, row.id);
  res.status(201).json({ id: row.id, name: row.name, isAdmin: false });
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
    authMode: config.sharedCode ? 'shared' : 'codes',
    lastSeen: g.last_seen_at || null,
  });
});

authRouter.post('/api/seen', requireApi, (req, res) => {
  db.prepare("UPDATE guests SET last_seen_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?").run(
    req.guest.id,
  );
  res.json({ ok: true });
});

// --- Admin: guest code management ---

authRouter.get('/api/admin/guests', requireAdmin, (_req, res) => {
  const guests = db
    .prepare(
      `
      SELECT g.id, g.code, g.name, g.email, g.is_admin, g.revoked_at, g.created_at,
             g.invited_at, g.activated_at,
             COUNT(m.id) AS media_count
      FROM guests g LEFT JOIN media m ON m.uploader_id = g.id
      GROUP BY g.id ORDER BY g.name COLLATE NOCASE
    `,
    )
    .all();
  res.json(guests);
});

authRouter.post('/api/admin/guests', requireAdmin, (req, res) => {
  const names = Array.isArray(req.body?.names) ? req.body.names : [req.body?.name];
  const clean = names
    .map((n) =>
      String(n || '')
        .trim()
        .slice(0, 100),
    )
    .filter(Boolean);
  if (!clean.length) return res.status(400).json({ error: 'name(s) required' });
  // An optional email may be supplied only when adding a single guest by hand,
  // so we can invite them straight away without a CSV import.
  const emailRaw = String(req.body?.email || '')
    .trim()
    .toLowerCase();
  if (emailRaw && clean.length !== 1)
    return res.status(400).json({ error: 'email only allowed with a single name' });
  if (emailRaw && !isEmail(emailRaw)) return res.status(400).json({ error: 'invalid email' });
  const email = emailRaw || null;
  // Skip names (and, if given, emails) that already exist so we don't duplicate.
  const existing = new Set(
    db
      .prepare('SELECT lower(name) AS n FROM guests')
      .all()
      .map((r) => r.n),
  );
  const existingEmails = new Set(
    db
      .prepare('SELECT lower(email) AS e FROM guests WHERE email IS NOT NULL')
      .all()
      .map((r) => r.e),
  );
  const insert = db.prepare('INSERT INTO guests (code, name, email) VALUES (?, ?, ?)');
  const created = [];
  let skipped = 0;
  db.transaction(() => {
    for (const name of clean) {
      const key = name.toLowerCase();
      if (existing.has(key) || (email && existingEmails.has(email))) {
        skipped++;
        continue;
      }
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
    .prepare(
      "UPDATE guests SET revoked_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND revoked_at IS NULL",
    )
    .run(id);
  if (!info.changes) return res.status(404).json({ error: 'not found or already revoked' });
  res.json({ ok: true });
});

authRouter.post('/api/admin/guests/:id/restore', requireAdmin, (req, res) => {
  const info = db.prepare('UPDATE guests SET revoked_at = NULL WHERE id = ?').run(Number(req.params.id));
  if (!info.changes) return res.status(404).json({ error: 'not found' });
  res.json({ ok: true });
});

// Permanently remove a guest (for duplicates / test / spam accounts). Refuses to
// touch admins, yourself, or anyone who has uploaded media — deleting a guest
// with photos would mean deleting the photos, which Revoke exists to avoid. Their
// comments/notes/reactions/seen rows go with them (reactions & seen cascade;
// comments & notes are RESTRICT-referenced, so we clear them in the same tx).
const deleteGuest = db.transaction((id) => {
  db.prepare('DELETE FROM media_comments WHERE guest_id = ?').run(id);
  db.prepare('DELETE FROM notes WHERE guest_id = ?').run(id);
  db.prepare('DELETE FROM guests WHERE id = ?').run(id);
});
// Rename any guest (fix a self-registered typo, or set the admin's own name).
authRouter.post('/api/admin/guests/:id/rename', requireAdmin, (req, res) => {
  const name = cleanGuestName(req.body?.name);
  if (!name) return res.status(400).json({ error: 'name required' });
  const info = db.prepare('UPDATE guests SET name = ? WHERE id = ?').run(name, Number(req.params.id));
  if (!info.changes) return res.status(404).json({ error: 'not found' });
  res.json({ ok: true, name });
});

authRouter.delete('/api/admin/guests/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (id === req.guest.id) return res.status(400).json({ error: 'cannot delete yourself' });
  const g = db.prepare('SELECT id, is_admin FROM guests WHERE id = ?').get(id);
  if (!g) return res.status(404).json({ error: 'not found' });
  if (g.is_admin) return res.status(400).json({ error: 'demote this admin before deleting' });
  const uploads = db.prepare('SELECT COUNT(*) AS n FROM media WHERE uploader_id = ?').get(id).n;
  if (uploads > 0) {
    return res.status(400).json({ error: `guest has ${uploads} upload(s) — revoke instead of deleting` });
  }
  deleteGuest(id);
  res.json({ ok: true });
});

// Grant / revoke admin. Won't remove the last remaining admin (lock-out guard).
authRouter.post('/api/admin/guests/:id/admin', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const makeAdmin = req.body?.isAdmin !== false;
  const g = db.prepare('SELECT id, is_admin FROM guests WHERE id = ?').get(id);
  if (!g) return res.status(404).json({ error: 'not found' });
  if (!makeAdmin) {
    const admins = db
      .prepare('SELECT COUNT(*) AS n FROM guests WHERE is_admin = 1 AND revoked_at IS NULL')
      .get().n;
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
    db
      .prepare('SELECT lower(email) AS e FROM guests WHERE email IS NOT NULL')
      .all()
      .map((r) => r.e),
  );
  const existingNames = new Set(
    db
      .prepare('SELECT lower(name) AS n FROM guests')
      .all()
      .map((r) => r.n),
  );
  const insert = db.prepare('INSERT INTO guests (code, name, email) VALUES (?, ?, ?)');
  const created = [];
  let skipped = 0;
  db.transaction(() => {
    for (const r of rows) {
      const name = String(r.name || '')
        .trim()
        .slice(0, 100);
      const email = String(r.email || '')
        .trim()
        .toLowerCase();
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
  const g = db
    .prepare('SELECT id, name, email, code, revoked_at FROM guests WHERE id = ?')
    .get(Number(req.params.id));
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
    .map((d) => [d, first.split(d).length - 1])
    .reduce((best, cur) => (cur[1] > best[1] ? cur : best), [',', -1])[0];
  const rows = lines.map((l) => {
    const out = [];
    let field = '';
    let q = false;
    for (let i = 0; i < l.length; i++) {
      const c = l[i];
      if (q) {
        if (c === '"') {
          if (l[i + 1] === '"') {
            field += '"';
            i++;
          } else q = false;
        } else field += c;
      } else if (c === '"') q = true;
      else if (c === delim) {
        out.push(field);
        field = '';
      } else field += c;
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
