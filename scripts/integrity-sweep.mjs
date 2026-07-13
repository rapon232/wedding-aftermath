#!/usr/bin/env node
// Reconcile DB rows against files on disk. Read-only by default; pass --fix to
// mark rows with missing originals as failed and delete orphaned files.
//   DATA_DIR=/data node scripts/integrity-sweep.mjs [--fix]
import { integritySweep } from '../server/maintenance.js';

const fix = process.argv.includes('--fix');
const r = integritySweep({ fix });

if (r.refused) {
  console.error(
    `⚠ REFUSED: 0 media rows but ${r.orphanOriginals.length} original file(s) present. ` +
      `DB likely missing or volume mismounted — no files touched. Verify DATA_DIR / restore db.sqlite.`
  );
  process.exit(3);
}

console.log(`media rows:          ${r.total}`);
console.log(`missing originals:   ${r.missingOriginals.length}${fix ? ' (flagged failed)' : ''}`);
console.log(`orphan files:        ${r.orphanOriginals.length}${fix ? ' (quarantined to trash/)' : ''}`);

if (r.missingOriginals.length) console.log('  missing ids:', r.missingOriginals.slice(0, 20).join(', '));
if (r.orphanOriginals.length) console.log('  orphan files:', r.orphanOriginals.slice(0, 20).join(', '));

if (!fix && (r.missingOriginals.length || r.orphanOriginals.length)) {
  console.log('\nRe-run with --fix to repair.');
  process.exit(2);
}
