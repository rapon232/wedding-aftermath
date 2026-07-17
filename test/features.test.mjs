// Group 11 server features: favorites, "most loved" sort, new-since-last-visit.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnServer, req, login, uploadFile, waitReady, ROOT } from './helpers.mjs';
import { jpeg } from './fixtures.mjs';

let srv;
let admin;
let guest;
before(async () => {
  srv = await spawnServer();
  admin = await login(srv.base, srv.adminCode);
  const g = await req(srv.base, 'POST', '/api/admin/guests', {
    cookie: admin,
    json: { names: ['Fav Guest'] },
  });
  guest = await login(srv.base, g.data[0].code);
});
after(() => srv?.stop());

async function seedPhoto(cookie, seed) {
  const up = await uploadFile(srv.base, cookie, await jpeg(seed), `f${seed}.jpg`, 'image/jpeg');
  await waitReady(srv.base, cookie, up.data.id);
  return up.data.id;
}

test('favorite toggle updates count and faved flag', async () => {
  const id = await seedPhoto(admin, 71);
  let r = await req(srv.base, 'POST', `/api/media/${id}/favorite`, { cookie: guest, json: { faved: true } });
  assert.equal(r.status, 200);
  assert.equal(r.data.count, 1);
  // reflected in listing for that guest
  const list = await req(srv.base, 'GET', '/api/media', { cookie: guest });
  const item = list.data.items.find((i) => i.id === id) || list.data.pinned.find((i) => i.id === id);
  assert.equal(item.fav_count, 1);
  assert.ok(item.faved);
  // another guest sees the count but faved=false for them
  const asAdmin = await req(srv.base, 'GET', '/api/media', { cookie: admin });
  const adminView = asAdmin.data.items.find((i) => i.id === id);
  assert.equal(adminView.fav_count, 1);
  assert.ok(!adminView.faved);
  // unfavorite
  r = await req(srv.base, 'POST', `/api/media/${id}/favorite`, { cookie: guest, json: { faved: false } });
  assert.equal(r.data.count, 0);
});

test('favorite is idempotent (double-favorite counts once)', async () => {
  const id = await seedPhoto(admin, 72);
  await req(srv.base, 'POST', `/api/media/${id}/favorite`, { cookie: guest, json: { faved: true } });
  const r = await req(srv.base, 'POST', `/api/media/${id}/favorite`, {
    cookie: guest,
    json: { faved: true },
  });
  assert.equal(r.data.count, 1);
});

test('"most loved" sort returns only favorited items, by count desc', async () => {
  const a = await seedPhoto(admin, 81);
  const b = await seedPhoto(admin, 82);
  await req(srv.base, 'POST', `/api/media/${a}/favorite`, { cookie: guest, json: { faved: true } });
  await req(srv.base, 'POST', `/api/media/${a}/favorite`, { cookie: admin, json: { faved: true } }); // a=2
  await req(srv.base, 'POST', `/api/media/${b}/favorite`, { cookie: guest, json: { faved: true } }); // b=1
  const loved = await req(srv.base, 'GET', '/api/media?sort=loved', { cookie: guest });
  const ids = loved.data.items.map((i) => i.id);
  assert.ok(ids.includes(a) && ids.includes(b));
  assert.ok(ids.indexOf(a) < ids.indexOf(b), 'more-loved item should come first');
  assert.ok(
    loved.data.items.every((i) => i.fav_count > 0),
    'loved view excludes unfavorited',
  );
});

test('NEW is per item and per guest: cleared by viewing, own uploads excluded', async () => {
  const before = await req(srv.base, 'GET', '/api/media', { cookie: guest });
  const id = await seedPhoto(admin, 91);
  const after = await req(srv.base, 'GET', '/api/media', { cookie: guest });
  assert.equal(after.data.newCount, before.data.newCount + 1);
  assert.equal(after.data.items.find((i) => i.id === id).seen, 0);

  // "viewing" it (what the lightbox reports) marks it seen — idempotently
  assert.equal((await req(srv.base, 'POST', `/api/media/${id}/seen`, { cookie: guest })).status, 204);
  assert.equal((await req(srv.base, 'POST', `/api/media/${id}/seen`, { cookie: guest })).status, 204);
  const seen = await req(srv.base, 'GET', '/api/media', { cookie: guest });
  assert.equal(seen.data.items.find((i) => i.id === id).seen, 1);
  assert.equal(seen.data.newCount, before.data.newCount);

  // the other guest's view is independent: still unseen for the uploader? no —
  // own uploads are never new, so check with the admin's separate item instead
  const mineId = await seedPhoto(guest, 92);
  const mine = await req(srv.base, 'GET', '/api/media', { cookie: guest });
  assert.equal(mine.data.items.find((i) => i.id === mineId).seen, 0); // seen flag is raw…
  assert.equal(mine.data.newCount, before.data.newCount); // …but own uploads never count as new
  // guards
  assert.equal((await req(srv.base, 'POST', '/api/media/not-a-uuid/seen', { cookie: guest })).status, 400);
  assert.equal(
    (
      await req(srv.base, 'POST', '/api/media/11111111-1111-1111-1111-111111111111/seen', {
        cookie: guest,
      })
    ).status,
    404,
  );
});

async function respawn(dataDir) {
  const { spawn } = await import('node:child_process');
  const net = await import('node:net');
  const port = await new Promise((resolve) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const p = srv.address().port;
      srv.close(() => resolve(p));
    });
  });
  const child = spawn('node', ['server/index.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      DATA_DIR: dataDir,
      SESSION_SECRET: 'test-secret-respawn',
      NODE_ENV: 'test',
      RESEND_API_KEY: '',
    },
  });
  let out = '';
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`respawn timeout:\n${out}`));
    }, 10000);
    child.stdout.on('data', (d) => {
      out += d;
      if (/listening on/.test(out)) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.stderr.on('data', (d) => (out += d));
    child.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`respawn exited early (${code}):\n${out}`));
    });
  });
  return { base: `http://127.0.0.1:${port}`, stop: () => child.kill('SIGKILL') };
}

test('grandfathering: media from before seen-tracking is not NEW for returning guests', async () => {
  const os = await import('node:os');
  const fs = await import('node:fs');
  const path = await import('node:path');
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lw-grandfather-'));
  // Era 1: feature exists. A guest visits (stamping last_seen_at) after an upload.
  const s1 = await spawnServer({ DATA_DIR: dataDir });
  try {
    const a1 = await login(s1.base, s1.adminCode);
    const up = await uploadFile(s1.base, a1, await jpeg(93), 'old.jpg', 'image/jpeg');
    await waitReady(s1.base, a1, up.data.id);
    const g1 = await req(s1.base, 'POST', '/api/admin/guests', {
      cookie: a1,
      json: { names: ['Returning'] },
    });
    const gc1 = await login(s1.base, g1.data[0].code);
    await req(s1.base, 'POST', '/api/seen', { cookie: gc1 }); // the client stamps last_seen_at after load
    s1.stop();
    // Simulate a pre-feature database: drop the table so the migration re-runs.
    const { default: Database } = await import('better-sqlite3');
    const raw = new Database(path.join(dataDir, 'db.sqlite'));
    raw.exec('DROP TABLE media_seen');
    raw.close();
    // Era 2: reboot on the existing DB. spawnServer can't be reused here — the
    // admin access code is only printed on first creation — so wait for
    // "listening on" ourselves (and never leave an orphan child on failure).
    const s2 = await respawn(dataDir);
    try {
      const g2code = g1.data[0].code;
      const gc2 = await login(s2.base, g2code);
      const list = await req(s2.base, 'GET', '/api/media', { cookie: gc2 });
      const item = list.data.items.find((i) => i.id === up.data.id);
      assert.equal(item.seen, 1, 'pre-feature media starts seen for returning guests');
      assert.equal(list.data.newCount, 0);
      s2.stop();
    } catch (e) {
      s2.stop();
      throw e;
    }
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test('favorite on missing/bad id is handled', async () => {
  assert.equal(
    (await req(srv.base, 'POST', '/api/media/not-a-uuid/favorite', { cookie: guest, json: {} })).status,
    400,
  );
  assert.equal(
    (
      await req(srv.base, 'POST', '/api/media/11111111-1111-1111-1111-111111111111/favorite', {
        cookie: guest,
        json: {},
      })
    ).status,
    404,
  );
});
