#!/usr/bin/env node
// One-off, NON-DESTRUCTIVE backfill of media.taken_at for videos whose capture
// date was never extracted (they show upload time). Re-reads each original with
// the same probe logic the upload pipeline uses.
//
//   READS  : the original video files (ffprobe, read-only)
//   WRITES : media.taken_at in db.sqlite — and ONLY that, and ONLY in --apply
//   NEVER  : moves / renames / re-encodes / deletes any media file
//
// Usage (run where the data volume lives, e.g. inside the container):
//   node scripts/backfill-video-dates.mjs            # dry-run: prints old -> new, writes nothing
//   node scripts/backfill-video-dates.mjs --apply    # backs up db.sqlite, then applies
//
import fs from 'fs';
import path from 'path';
import { config, dirs } from '../server/config.js';
import { db } from '../server/db.js';
import { probeVideoMeta } from '../server/processing.js';

const APPLY = process.argv.includes('--apply');
const dbPath = path.join(config.dataDir, 'db.sqlite');

function backupDb() {
  // A timestamped copy so an apply run is always reversible.
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = `${dbPath}.bak-${stamp}`;
  fs.copyFileSync(dbPath, dest);
  // WAL/SHM too, if present, so the backup is consistent.
  for (const suf of ['-wal', '-shm']) {
    if (fs.existsSync(dbPath + suf)) fs.copyFileSync(dbPath + suf, dest + suf);
  }
  console.log(`Backed up database → ${dest}`);
}

const videos = db
  .prepare(
    "SELECT id, filename, ext, taken_at, duration_s FROM media WHERE type = 'video' ORDER BY uploaded_at ASC",
  )
  .all();

console.log(`${APPLY ? 'APPLY' : 'DRY-RUN'} — ${videos.length} video(s) to check\n`);

if (APPLY && videos.length) backupDb();

// Fix capture date AND duration (duration_s feeds the thumbnail badge).
const update = db.prepare('UPDATE media SET taken_at = ?, duration_s = ? WHERE id = ?');
let changed = 0,
  unchanged = 0,
  noData = 0,
  missing = 0;

for (const v of videos) {
  const original = path.join(dirs.originals, `${v.id}.${v.ext}`);
  if (!fs.existsSync(original)) {
    console.warn(`MISSING original, skipped: ${v.filename} (${v.id})`);
    missing++;
    continue;
  }
  const { duration, takenAt } = await probeVideoMeta(original, `${v.id} (${v.filename})`);
  if (!takenAt && duration == null) {
    noData++;
    continue; // nothing discoverable → leave the row exactly as-is
  }
  // Keep existing values where the probe found nothing new.
  const newTaken = takenAt || v.taken_at;
  const newDur = duration != null ? duration : v.duration_s;
  if (newTaken === v.taken_at && newDur === v.duration_s) {
    unchanged++;
    continue;
  }
  const parts = [];
  if (newTaken !== v.taken_at) parts.push(`date ${v.taken_at} → ${newTaken}`);
  if (newDur !== v.duration_s) parts.push(`dur ${v.duration_s ?? 'null'} → ${newDur}`);
  console.log(`${v.filename}: ${parts.join(', ')}`);
  if (APPLY) update.run(newTaken, newDur, v.id);
  changed++;
}

console.log(
  `\n${APPLY ? 'Applied' : 'Would change'}: ${changed}  |  already correct: ${unchanged}  |  ` +
    `nothing found (left as-is): ${noData}  |  missing file: ${missing}`,
);
if (!APPLY && changed)
  console.log('\nRe-run with --apply to write these changes (db.sqlite is backed up first).');
