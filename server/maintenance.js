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

/**
 * Reconcile DB rows against files on disk.
 * - missingOriginals: ready rows whose original file is gone (data loss)
 * - orphanOriginals: original files with no DB row (leaked from crashes)
 * With { fix: true }, marks missing-original rows as failed and deletes orphan files.
 */
export function integritySweep({ fix = false } = {}) {
  const rows = db.prepare('SELECT id, ext, status FROM media').all();
  const known = new Set(rows.map((r) => `${r.id}.${r.ext}`));

  const missingOriginals = [];
  for (const r of rows) {
    if (r.status === 'failed') continue;
    if (!fs.existsSync(path.join(dirs.originals, `${r.id}.${r.ext}`))) missingOriginals.push(r.id);
  }

  const orphanOriginals = [];
  for (const f of fs.readdirSync(dirs.originals)) {
    if (!known.has(f)) orphanOriginals.push(f);
  }

  if (fix) {
    const markFailed = db.prepare("UPDATE media SET status = 'failed' WHERE id = ?");
    for (const id of missingOriginals) markFailed.run(id);
    for (const f of orphanOriginals) fs.rmSync(path.join(dirs.originals, f), { force: true });
    // Also drop derived files that no longer have a row.
    for (const [dir, ext] of [[dirs.thumbs, 'webp'], [dirs.previews, 'webp'], [dirs.posters, 'jpg']]) {
      const validIds = new Set(rows.map((r) => r.id));
      for (const f of fs.readdirSync(dir)) {
        if (!validIds.has(path.basename(f, `.${ext}`))) fs.rmSync(path.join(dir, f), { force: true });
      }
    }
  }

  return { total: rows.length, missingOriginals, orphanOriginals };
}

/** Aggregate stats for the backup-verification job. */
export function dataStats() {
  const counts = db.prepare("SELECT status, COUNT(*) AS n FROM media GROUP BY status").all();
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
