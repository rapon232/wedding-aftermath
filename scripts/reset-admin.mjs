#!/usr/bin/env node
// Regenerate the admin guest's access code WITHOUT touching media or the DB
// structure. Use this if the admin code is lost — never delete db.sqlite.
//   DATA_DIR=/data node scripts/reset-admin.mjs
import { db, generateCode } from '../server/db.js';

const admin = db.prepare('SELECT id, name FROM guests WHERE is_admin = 1 ORDER BY id LIMIT 1').get();
if (!admin) {
  console.error('No admin guest exists. Start the app once against this DATA_DIR to create one.');
  process.exit(1);
}
const code = generateCode();
db.prepare('UPDATE guests SET code = ?, revoked_at = NULL WHERE id = ?').run(code, admin.id);
console.log(`★ New access code for admin "${admin.name}": ${code}`);
