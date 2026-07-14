import express from 'express';
import multer from 'multer';
import crypto from 'crypto';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { db } from './db.js';
import { config, dirs } from './config.js';
import { requireApi, requireAdmin } from './auth.js';
import { enqueue } from './processing.js';

const PHOTO_EXT = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif']);
const VIDEO_EXT = new Set(['mp4', 'mov', 'm4v']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// Chunks stay under Cloudflare's ~100 MB per-request body limit, but large enough
// to minimize round-trips on big videos over a long-haul link. Overridable for tests.
export const CHUNK_SIZE = Number(process.env.CHUNK_SIZE_BYTES) || 64 * 1024 * 1024;

function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}
const extOf = (name) => path.extname(String(name)).slice(1).toLowerCase();
const validExt = (ext) => PHOTO_EXT.has(ext) || VIDEO_EXT.has(ext);
// multer decodes filenames as latin1; recover UTF-8 (e.g. Cyrillic names)
const fixName = (n) => {
  try {
    return Buffer.from(n, 'latin1').toString('utf8');
  } catch {
    return n;
  }
};
const cleanName = (n) =>
  String(n).replace(/[/\\]/g, '_').replace(/[\x00-\x1f]/g, '').trim().slice(0, 200) || 'upload';

// --- Disk-space guard + per-guest upload rate limit ---
// Both run before a file is accepted, so guests get a clear message instead of a
// mysterious failure (full volume) or one person starving the NAS (flood).
import { hasFreeSpace } from './maintenance.js';

const uploadTimes = new Map(); // guestId -> [timestamps]

function uploadGuard(req, res, next) {
  if (!hasFreeSpace()) {
    return res.status(507).json({ error: 'The gallery is full right now — please tell the couple.' });
  }
  const now = Date.now();
  const cutoff = now - config.uploadRateWindowMs;
  const times = (uploadTimes.get(req.guest.id) || []).filter((t) => t > cutoff);
  if (times.length >= config.uploadRateMax) {
    return res.status(429).json({ error: 'Whoa — that’s a lot at once. Give it a minute and keep going.' });
  }
  times.push(now);
  uploadTimes.set(req.guest.id, times);
  next();
}

function sha256File(p) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256');
    fs.createReadStream(p)
      .on('data', (d) => h.update(d))
      .on('end', () => resolve(h.digest('hex')))
      .on('error', reject);
  });
}

export const mediaFilePaths = (m) => ({
  original: path.join(dirs.originals, `${m.id}.${m.ext}`),
  thumb: path.join(dirs.thumbs, `${m.id}.webp`),
  preview: path.join(dirs.previews, `${m.id}.webp`),
  poster: path.join(dirs.posters, `${m.id}.jpg`),
});

/** Common tail of both upload paths: hash → dedupe → insert row → move into place → enqueue. */
async function finalizeUpload({ tmpPath, originalName, uploaderId }) {
  const filename = cleanName(originalName);
  const ext = extOf(filename);
  if (!validExt(ext)) {
    fs.rmSync(tmpPath, { force: true });
    throw httpError(415, `unsupported file type: .${ext || '?'}`);
  }
  const sha256 = await sha256File(tmpPath);
  const existing = db.prepare('SELECT id, status, ext FROM media WHERE sha256 = ?').get(sha256);
  if (existing) {
    // Re-uploading a file whose processing previously failed → give it another shot.
    if (existing.status === 'failed' && fs.existsSync(path.join(dirs.originals, `${existing.id}.${existing.ext}`))) {
      db.prepare("UPDATE media SET status = 'processing' WHERE id = ?").run(existing.id);
      fs.rmSync(tmpPath, { force: true });
      enqueue(existing.id);
      return { id: existing.id, status: 'processing', duplicate: true };
    }
    fs.rmSync(tmpPath, { force: true });
    return { id: existing.id, status: existing.status, duplicate: true };
  }
  const id = crypto.randomUUID();
  const type = VIDEO_EXT.has(ext) ? 'video' : 'photo';
  const size = fs.statSync(tmpPath).size;
  // Insert BEFORE moving the file into place. If a concurrent identical upload
  // wins the UNIQUE(sha256) race, we catch it, drop our temp file, and report the
  // existing row as a duplicate — no orphaned original, no 500.
  try {
    db.prepare(
      `INSERT INTO media (id, uploader_id, filename, ext, type, size, sha256, taken_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))`
    ).run(id, uploaderId, filename, ext, type, size, sha256);
  } catch (err) {
    if (String(err.code).startsWith('SQLITE_CONSTRAINT')) {
      fs.rmSync(tmpPath, { force: true });
      const winner = db.prepare('SELECT id, status FROM media WHERE sha256 = ?').get(sha256);
      return { id: winner?.id, status: winner?.status, duplicate: true };
    }
    throw err;
  }
  fs.renameSync(tmpPath, path.join(dirs.originals, `${id}.${ext}`));
  enqueue(id);
  return { id, status: 'processing', type, duplicate: false };
}

// Sweep stale temp files (abandoned chunked uploads, orphaned multer files).
function sweepTmp() {
  for (const f of fs.readdirSync(dirs.tmp)) {
    const p = path.join(dirs.tmp, f);
    try {
      if (Date.now() - fs.statSync(p).mtimeMs > 24 * 3600 * 1000) fs.rmSync(p, { force: true });
    } catch {
      /* raced with a live upload — ignore */
    }
  }
}
sweepTmp();

const upload = multer({
  storage: multer.diskStorage({ destination: dirs.tmp }),
  limits: { fileSize: config.maxFileBytes },
  fileFilter: (_req, file, cb) => {
    const ext = extOf(fixName(file.originalname));
    cb(validExt(ext) ? null : httpError(415, `unsupported file type: .${ext || '?'}`), validExt(ext));
  },
});

export const mediaRouter = express.Router();

// --- Simple path: one file per multipart request (client uses this under ~90 MB) ---

mediaRouter.post('/api/upload', requireApi, uploadGuard, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) throw httpError(400, 'file required');
    const result = await finalizeUpload({
      tmpPath: req.file.path,
      originalName: fixName(req.file.originalname),
      uploaderId: req.guest.id,
    });
    res.status(result.duplicate ? 200 : 201).json(result);
  } catch (err) {
    next(err);
  }
});

// --- Chunked path for large files (Cloudflare caps request bodies at ~100 MB) ---
// Sessions are in-memory; a server restart orphans them (client restarts the file,
// stale .part files are swept on boot).

const chunkSessions = new Map();
const CHUNK_SESSION_TTL_MS = 3 * 3600 * 1000;

// Evict abandoned chunk sessions (guest closed the tab mid-upload) and their
// .part files so they don't accumulate. Hourly; unref'd so it never blocks exit.
setInterval(() => {
  const now = Date.now();
  for (const [uid, s] of chunkSessions) {
    if (now - (s.touchedAt || 0) > CHUNK_SESSION_TTL_MS) {
      chunkSessions.delete(uid);
      fs.rmSync(s.partPath, { force: true });
    }
  }
  sweepTmp();
}, 3600 * 1000).unref();

mediaRouter.post('/api/upload/init', requireApi, uploadGuard, (req, res) => {
  const name = cleanName(String(req.body?.name || ''));
  const size = Number(req.body?.size);
  if (!validExt(extOf(name))) return res.status(415).json({ error: `unsupported file type` });
  if (!Number.isInteger(size) || size <= 0) return res.status(400).json({ error: 'size required' });
  if (size > config.maxFileBytes) return res.status(413).json({ error: 'file too large (max 2 GB)' });
  const uploadId = crypto.randomUUID();
  const partPath = path.join(dirs.tmp, `${uploadId}.part`);
  fs.writeFileSync(partPath, '');
  chunkSessions.set(uploadId, {
    name, size, uploaderId: req.guest.id, received: 0, partPath, touchedAt: Date.now(),
  });
  res.json({ uploadId, chunkSize: CHUNK_SIZE });
});

mediaRouter.post(
  '/api/upload/:uid/chunk',
  requireApi,
  express.raw({ type: () => true, limit: CHUNK_SIZE + 1024 * 1024 }),
  async (req, res, next) => {
    const s = chunkSessions.get(req.params.uid);
    if (!s || s.uploaderId !== req.guest.id) return res.status(404).json({ error: 'unknown upload' });
    const index = Number(req.query.index);
    if (!Number.isInteger(index) || index < 0) return res.status(400).json({ error: 'bad chunk index' });
    if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: 'empty chunk' });
    // Chunks may now arrive in ANY order (client uploads several in parallel).
    // Each is written at its byte offset, so ordering doesn't matter.
    const offset = index * CHUNK_SIZE;
    if (offset + req.body.length > s.size) {
      chunkSessions.delete(req.params.uid);
      fs.rmSync(s.partPath, { force: true });
      return res.status(400).json({ error: 'more data than declared size' });
    }
    // Re-check free space on every chunk — the init-time guard doesn't cover a
    // long multi-GB stream or many concurrent sessions filling the volume.
    if (!hasFreeSpace()) {
      chunkSessions.delete(req.params.uid);
      fs.rmSync(s.partPath, { force: true });
      return res.status(507).json({ error: 'The gallery is full right now — please tell the couple.' });
    }
    try {
      // Positional write (async, so parallel chunks don't block the event loop).
      const fh = await fsp.open(s.partPath, 'r+');
      try {
        await fh.write(req.body, 0, req.body.length, offset);
      } finally {
        await fh.close();
      }
    } catch (err) {
      return next(err);
    }
    s.received += req.body.length;
    s.touchedAt = Date.now();
    res.json({ received: s.received });
  }
);

mediaRouter.post('/api/upload/:uid/finish', requireApi, async (req, res, next) => {
  const s = chunkSessions.get(req.params.uid);
  if (!s || s.uploaderId !== req.guest.id) return res.status(404).json({ error: 'unknown upload' });
  chunkSessions.delete(req.params.uid);
  try {
    if (s.received !== s.size) {
      fs.rmSync(s.partPath, { force: true });
      throw httpError(400, `incomplete upload: got ${s.received} of ${s.size} bytes`);
    }
    const result = await finalizeUpload({ tmpPath: s.partPath, originalName: s.name, uploaderId: s.uploaderId });
    res.status(result.duplicate ? 200 : 201).json(result);
  } catch (err) {
    next(err);
  }
});

// --- Item status (upload tray polls this until processing finishes) ---

mediaRouter.get('/api/media/:id', requireApi, (req, res) => {
  if (!UUID_RE.test(req.params.id)) return res.status(400).json({ error: 'bad id' });
  const m = db
    .prepare(
      `SELECT m.id, m.type, m.status, m.filename, m.size, m.taken_at, m.uploaded_at,
              m.width, m.height, m.duration_s, m.pinned_at, m.uploader_id, g.name AS uploader_name
       FROM media m JOIN guests g ON g.id = m.uploader_id WHERE m.id = ?`
    )
    .get(req.params.id);
  if (!m) return res.status(404).json({ error: 'not found' });
  res.json(m);
});

// --- Pin / unpin (admin only): pinned media surfaces at the top for everyone ---

mediaRouter.post('/api/admin/media/:id/pin', requireAdmin, (req, res) => {
  if (!UUID_RE.test(req.params.id)) return res.status(400).json({ error: 'bad id' });
  const exists = db.prepare('SELECT 1 FROM media WHERE id = ?').get(req.params.id);
  if (!exists) return res.status(404).json({ error: 'not found' });
  const pinned = req.body?.pinned !== false; // default: pin
  db.prepare('UPDATE media SET pinned_at = ? WHERE id = ?').run(
    pinned ? new Date().toISOString() : null,
    req.params.id
  );
  res.json({ ok: true, pinned });
});

// --- Favorites / ♥ reactions (group 11.3) ---

mediaRouter.post('/api/media/:id/favorite', requireApi, (req, res) => {
  if (!UUID_RE.test(req.params.id)) return res.status(400).json({ error: 'bad id' });
  const exists = db.prepare('SELECT 1 FROM media WHERE id = ?').get(req.params.id);
  if (!exists) return res.status(404).json({ error: 'not found' });
  const faved = req.body?.faved !== false; // default: favorite
  if (faved) {
    db.prepare('INSERT OR IGNORE INTO media_reactions (media_id, guest_id) VALUES (?, ?)').run(
      req.params.id,
      req.guest.id
    );
  } else {
    db.prepare('DELETE FROM media_reactions WHERE media_id = ? AND guest_id = ?').run(req.params.id, req.guest.id);
  }
  const count = db.prepare('SELECT COUNT(*) AS n FROM media_reactions WHERE media_id = ?').get(req.params.id).n;
  res.json({ ok: true, faved, count });
});

// --- Delete: own uploads, or anything as admin ---

mediaRouter.delete('/api/media/:id', requireApi, (req, res) => {
  const m = db.prepare('SELECT id, ext, uploader_id FROM media WHERE id = ?').get(req.params.id);
  if (!m) return res.status(404).json({ error: 'not found' });
  if (m.uploader_id !== req.guest.id && !req.guest.is_admin) return res.status(403).json({ error: 'forbidden' });
  for (const p of Object.values(mediaFilePaths(m))) fs.rmSync(p, { force: true });
  db.prepare('DELETE FROM media WHERE id = ?').run(m.id);
  res.json({ ok: true });
});

// Router-scoped error handler: multer + upload errors become clean JSON.
mediaRouter.use((err, _req, res, _next) => {
  if (err?.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'file too large (max 2 GB)' });
  if (err?.status) return res.status(err.status).json({ error: err.message });
  console.error('upload error:', err);
  res.status(500).json({ error: 'upload failed' });
});
