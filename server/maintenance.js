// Data-safety helpers: disk space, integrity reconciliation, backup snapshotting.
// Used both at runtime (disk guard, boot sweep) and by the scripts/ cron jobs.
import fs from 'fs';
import path from 'path';
import { db } from './db.js';
import { dirs, config } from './config.js';

/** Free/total bytes on the data volume. Returns null if statfs is unavailable. */
export function diskInfo(dir = config.dataDir) {
  try {
    const s = fs.statfsSync(dir);
    return { freeBytes: s.bavail * s.bsize, totalBytes: s.blocks * s.bsize };
  } catch {
    return null;
  }
}

export function hasFreeSpace(minBytes = config.minFreeBytes) {
  const info = diskInfo();
  return !info || info.freeBytes >= minBytes;
}

const ORPHAN_GRACE_MS = 60 * 60 * 1000; // don't touch files younger than this (may be an in-flight upload)

/**
 * Reconcile DB rows against files on disk.
 * - missingOriginals: ready rows whose original file is gone (data loss)
 * - orphanOriginals: original files with no DB row (leaked from a crash)
 * - refused: true when the state looks like a mismount/empty DB and fixing would be destructive
 *
 * With { fix: true } (safe): marks missing-original rows as failed, removes only
 * regenerable derived files with no row, and QUARANTINES orphan originals into
 * trash/ (never deletes originals). Refuses entirely if the DB is empty while
 * originals exist — the classic "deleted db.sqlite / volume not mounted" trap.
 */
export function integritySweep({ fix = false } = {}) {
  const rows = db.prepare('SELECT id, ext, status FROM media').all();
  const known = new Set(rows.map((r) => `${r.id}.${r.ext}`));
  const validIds = new Set(rows.map((r) => r.id));

  const missingOriginals = [];
  for (const r of rows) {
    if (r.status === 'failed') continue;
    if (!fs.existsSync(path.join(dirs.originals, `${r.id}.${r.ext}`))) missingOriginals.push(r.id);
  }

  const originalFiles = fs.readdirSync(dirs.originals);
  const orphanOriginals = originalFiles.filter((f) => !known.has(f));

  // Safety valve: an empty/near-empty DB alongside real files means the DB was
  // lost or the volume is mismounted. Fixing would destroy data — refuse.
  const refused = rows.length === 0 && originalFiles.length > 0;

  if (fix && !refused) {
    const markFailed = db.prepare("UPDATE media SET status = 'failed' WHERE id = ?");
    for (const id of missingOriginals) markFailed.run(id);

    // Orphan originals are IRREPLACEABLE → quarantine (move), never delete, and
    // skip anything recently written (likely an upload mid-flight).
    const now = Date.now();
    for (const f of orphanOriginals) {
      const src = path.join(dirs.originals, f);
      if (now - fs.statSync(src).mtimeMs < ORPHAN_GRACE_MS) continue;
      fs.renameSync(src, path.join(dirs.trash, f));
    }
    // Derived files are regenerable → safe to delete when they have no row.
    for (const [dir, ext] of [
      [dirs.thumbs, 'webp'],
      [dirs.previews, 'webp'],
      [dirs.posters, 'jpg'],
    ]) {
      for (const f of fs.readdirSync(dir)) {
        if (!validIds.has(path.basename(f, `.${ext}`))) fs.rmSync(path.join(dir, f), { force: true });
      }
    }
  }

  return { total: rows.length, missingOriginals, orphanOriginals, refused };
}

/** Aggregate stats for the backup-verification job. */
export function dataStats() {
  const counts = db.prepare('SELECT status, COUNT(*) AS n FROM media GROUP BY status').all();
  const byStatus = counts.reduce((a, r) => ({ ...a, [r.status]: r.n }), {});
  let originalBytes = 0;
  for (const f of fs.readdirSync(dirs.originals)) {
    originalBytes += fs.statSync(path.join(dirs.originals, f)).size;
  }
  return {
    mediaRows: db.prepare('SELECT COUNT(*) AS n FROM media').get().n,
    ready: byStatus.ready || 0,
    guests: db.prepare('SELECT COUNT(*) AS n FROM guests').get().n,
    originalFiles: fs.readdirSync(dirs.originals).length,
    originalBytes,
    disk: diskInfo(),
  };
}
