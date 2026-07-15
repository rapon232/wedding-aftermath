// Group 11 server features: favorites, "most loved" sort, new-since-last-visit.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnServer, req, login, uploadFile, waitReady } from './helpers.mjs';
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

test('new-since-last-visit counts others’ uploads after last seen', async () => {
  // guest visits (stamps last_seen), then admin uploads → guest should see newCount >= 1
  await req(srv.base, 'GET', '/api/media', { cookie: guest });
  await req(srv.base, 'POST', '/api/seen', { cookie: guest });
  await seedPhoto(admin, 91);
  const after = await req(srv.base, 'GET', '/api/media', { cookie: guest });
  assert.ok(after.data.newCount >= 1, `expected new uploads, got ${after.data.newCount}`);
  // a guest's own uploads don't count as "new" to them
  await req(srv.base, 'POST', '/api/seen', { cookie: guest });
  await seedPhoto(guest, 92);
  const mine = await req(srv.base, 'GET', '/api/media', { cookie: guest });
  assert.equal(mine.data.newCount, 0);
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
