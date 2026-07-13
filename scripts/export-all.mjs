#!/usr/bin/env node
// Owner archive job: stream ALL original files into a single dated zip to stash
// offsite after the event. Independent of the web app (runs straight off disk).
//   DATA_DIR=/data node scripts/export-all.mjs [/path/to/output-dir]
import fs from 'fs';
import path from 'path';
import archiver from 'archiver';
import { dirs } from '../server/config.js';
import { db } from '../server/db.js';

const outDir = process.argv[2] || '.';
const stamp = new Date().toISOString().slice(0, 10);
const outPath = path.join(outDir, `aftermath-originals-${stamp}.zip`);

// Map media ids → original filenames so the archive uses friendly names.
const rows = db.prepare("SELECT id, ext, filename FROM media WHERE status = 'ready'").all();
const byBase = new Map(rows.map((r) => [`${r.id}.${r.ext}`, r.filename]));

const output = fs.createWriteStream(outPath);
const zip = archiver('zip', { store: true });
zip.on('warning', (e) => console.warn(e.message));
zip.on('error', (e) => {
  console.error(e);
  process.exit(1);
});
output.on('close', () => {
  console.log(`✓ wrote ${outPath} (${(zip.pointer() / 1e6).toFixed(0)} MB, ${count} files)`);
});
zip.pipe(output);

const used = new Set();
let count = 0;
for (const f of fs.readdirSync(dirs.originals)) {
  const src = path.join(dirs.originals, f);
  if (!fs.statSync(src).isFile()) continue;
  let name = byBase.get(f) || f; // friendly filename, fall back to id.ext
  for (let i = 2; used.has(name); i++) {
    const dot = name.lastIndexOf('.');
    name = dot > 0 ? `${name.slice(0, dot)} (${i})${name.slice(dot)}` : `${name} (${i})`;
  }
  used.add(name);
  zip.file(src, { name });
  count++;
}
console.log(`Archiving ${count} originals → ${outPath} …`);
zip.finalize();
