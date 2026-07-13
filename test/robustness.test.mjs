// Robustness & data-safety tests (group 10).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { spawnServer, req, login, uploadFile, waitReady } from './helpers.mjs';

let srv;
let admin;
before(async () => {
  srv = await spawnServer();
  admin = await login(srv.base, srv.adminCode);
});
after(() => srv?.stop());

test('health reports uptime and disk', async () => {
  const r = await req(srv.base, 'GET', '/api/health');
  assert.equal(r.data.ok, true);
  assert.ok(typeof r.data.uptimeSec === 'number');
  assert.ok('diskFreeGb' in r.data);
});

test('derived renditions carry no EXIF/GPS metadata', async () => {
  // Upload a JPEG that DOES have GPS EXIF, then assert the thumbnail is clean.
  const withGps = await sharp({ create: { width: 800, height: 600, channels: 3, background: { r: 1, g: 2, b: 3 } } })
    .jpeg()
    .withExif({ IFD0: { Make: 'TestCam' }, GPS: { GPSLatitudeRef: 'N', GPSLongitudeRef: 'E' } })
    .toBuffer();
  const up = await uploadFile(srv.base, admin, withGps, 'gps.jpg', 'image/jpeg');
  await waitReady(srv.base, admin, up.data.id);
  const thumbPath = path.join(srv.dir, 'thumbs', `${up.data.id}.webp`);
  const meta = await sharp(thumbPath).metadata();
  assert.ok(!meta.exif, 'thumbnail must not carry EXIF');
  assert.equal(meta.format, 'webp');
});

test('per-guest upload rate limit returns 429 past the cap', async () => {
  // Create a guest whose cap we can exhaust by driving the init endpoint.
  const g = await req(srv.base, 'POST', '/api/admin/guests', { cookie: admin, json: { names: ['Flooder'] } });
  const cookie = await login(srv.base, g.data[0].code);
  let throttled = false;
  // uploadRateMax defaults to 400; drive init (cheap) past it.
  for (let i = 0; i < 405; i++) {
    const r = await req(srv.base, 'POST', '/api/upload/init', { cookie, json: { name: 'x.jpg', size: 100 } });
    if (r.status === 429) {
      throttled = true;
      break;
    }
  }
  assert.ok(throttled, 'flood was not rate-limited');
});

test('integrity sweep detects missing originals and orphan files, and --fix repairs', async () => {
  // Fresh in-process app pointed at its own temp data dir (independent of the
  // spawned server). config/db load lazily on first import, so set env first.
  const os = await import('os');
  process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'lw-sweep-'));
  process.env.SESSION_SECRET = 'sweep-secret';
  const { db } = await import('../server/db.js');
  const { integritySweep } = await import('../server/maintenance.js');
  const { dirs } = await import('../server/config.js');

  db.prepare("INSERT INTO guests (code, name, is_admin) VALUES ('SWEP-TEST', 'S', 1)").run();
  // Row with no original file on disk → should be flagged missing.
  db.prepare(
    `INSERT INTO media (id, uploader_id, filename, ext, type, size, sha256, taken_at, status)
     VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 1, 'x.jpg', 'jpg', 'photo', 1, 'h1',
             '2026-06-20T00:00:00Z', 'ready')`
  ).run();
  // Orphan file with no row, aged past the grace window so the sweep will act on it.
  const orphan = path.join(dirs.originals, 'orphan-file.jpg');
  fs.writeFileSync(orphan, 'x');
  const old = Date.now() / 1000 - 2 * 3600;
  fs.utimesSync(orphan, old, old);

  const before = integritySweep({ fix: false });
  assert.ok(before.missingOriginals.includes('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'));
  assert.ok(before.orphanOriginals.includes('orphan-file.jpg'));
  assert.equal(before.refused, false);

  const fixed = integritySweep({ fix: true });
  // Orphan is QUARANTINED (moved to trash/), never deleted — recoverable.
  assert.ok(!fs.existsSync(orphan), 'orphan should leave originals/');
  assert.ok(fs.existsSync(path.join(dirs.trash, 'orphan-file.jpg')), 'orphan should be quarantined to trash/');
  assert.equal(fixed.refused, false);
  const row = db.prepare("SELECT status FROM media WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'").get();
  assert.equal(row.status, 'failed');

  // Danger guard: empty DB + files present (deleted-db.sqlite / mismount) → REFUSE, touch nothing.
  db.prepare('DELETE FROM media').run();
  const precious = path.join(dirs.originals, 'precious.jpg');
  fs.writeFileSync(precious, 'irreplaceable');
  fs.utimesSync(precious, old, old);
  const danger = integritySweep({ fix: true });
  assert.equal(danger.refused, true, 'must refuse when rows=0 and files exist');
  assert.ok(fs.existsSync(precious), 'the precious original must NOT be deleted or moved');
});
