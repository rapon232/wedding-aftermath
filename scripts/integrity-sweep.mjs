#!/usr/bin/env node
// Reconcile DB rows against files on disk. Read-only by default; pass --fix to
// mark rows with missing originals as failed and delete orphaned files.
//   DATA_DIR=/data node scripts/integrity-sweep.mjs [--fix]
import { integritySweep } from '../server/maintenance.js';

const fix = process.argv.includes('--fix');
const r = integritySweep({ fix });

console.log(`media rows:          ${r.total}`);
console.log(`missing originals:   ${r.missingOriginals.length}${fix ? ' (flagged failed)' : ''}`);
console.log(`orphan files:        ${r.orphanOriginals.length}${fix ? ' (removed)' : ''}`);

if (r.missingOriginals.length) console.log('  missing ids:', r.missingOriginals.slice(0, 20).join(', '));
if (r.orphanOriginals.length) console.log('  orphan files:', r.orphanOriginals.slice(0, 20).join(', '));

if (!fix && (r.missingOriginals.length || r.orphanOriginals.length)) {
  console.log('\nRe-run with --fix to repair.');
  process.exit(2);
}
