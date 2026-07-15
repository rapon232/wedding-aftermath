#!/usr/bin/env node
// Backup-verification job. Compares current data stats against the last snapshot
// and exits non-zero (with a loud message) if media count or bytes dropped
// unexpectedly — the signal of silent data loss. Run from cron on the NAS:
//   0 3 * * *  cd /path/to/app && DATA_DIR=/data node scripts/check-backup.mjs >> /var/log/aftermath-backup.log 2>&1
import fs from 'fs';
import path from 'path';
import { config } from '../server/config.js';
import { dataStats } from '../server/maintenance.js';

const STATE = path.join(config.dataDir, '.backup-state.json');
const now = dataStats();
const stamp = new Date().toISOString();

let prev = null;
try {
  prev = JSON.parse(fs.readFileSync(STATE, 'utf8'));
} catch {
  /* first run */
}

const line = (label, v) => `  ${label.padEnd(16)} ${v}`;
console.log(`[${stamp}] backup check`);
console.log(line('media rows', now.mediaRows));
console.log(line('original files', now.originalFiles));
console.log(line('original bytes', now.originalBytes.toLocaleString()));
if (now.disk) console.log(line('disk free GB', (now.disk.freeBytes / 1e9).toFixed(1)));

let alert = false;
if (prev) {
  // Allow tiny shrink from admin deletions; alert on a meaningful drop (>2% or >5 files).
  const dropFiles = prev.originalFiles - now.originalFiles;
  const dropBytes = prev.originalBytes - now.originalBytes;
  if (dropFiles > Math.max(5, prev.originalFiles * 0.02)) {
    console.error(
      `⚠ ALERT: original files dropped by ${dropFiles} (${prev.originalFiles} → ${now.originalFiles})`,
    );
    alert = true;
  }
  if (dropBytes > Math.max(50 * 1024 * 1024, prev.originalBytes * 0.02)) {
    console.error(`⚠ ALERT: original bytes dropped by ${(dropBytes / 1e6).toFixed(0)} MB`);
    alert = true;
  }
}

now.checkedAt = stamp;
fs.writeFileSync(STATE, JSON.stringify(now, null, 2));

if (alert) {
  console.error('⚠ Possible data loss — verify the NAS volume and restore from backup if needed.');
  process.exit(1);
}
console.log('✓ ok');
