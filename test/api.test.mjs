// API integration tests against the real server.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnServer, req, login, cookieFrom, uploadFile, waitReady } from './helpers.mjs';
import { jpeg } from './fixtures.mjs';

let srv;
let admin; // admin cookie
before(async () => {
  srv = await spawnServer();
  admin = await login(srv.base, srv.adminCode);
  assert.ok(admin, 'admin should log in');
});
after(() => srv?.stop());

test('health endpoint works', async () => {
  const r = await req(srv.base, 'GET', '/api/health');
  assert.equal(r.status, 200);
  assert.equal(r.data.ok, true);
});

test('login: wrong code 401, correct code sets session', async () => {
  assert.equal((await req(srv.base, 'POST', '/api/login', { json: { code: 'AAAA-AAAA' } })).status, 401);
  const me = await req(srv.base, 'GET', '/api/me', { cookie: admin });
  assert.equal(me.status, 200);
  assert.equal(me.data.isAdmin, true);
  assert.equal(me.data.eventTz, 'Europe/Rome');
});

test('login is forgiving of case and dashes', async () => {
  const messy = srv.adminCode.toLowerCase().replace('-', '');
  const c = await login(srv.base, messy);
  assert.ok(c, 'normalized code should authenticate');
});

test('admin creates a guest; guest can log in but is not admin', async () => {
  const r = await req(srv.base, 'POST', '/api/admin/guests', { cookie: admin, json: { names: ['Guest One'] } });
  assert.equal(r.status, 201);
  const code = r.data[0].code;
  const gc = await login(srv.base, code);
  const me = await req(srv.base, 'GET', '/api/me', { cookie: gc });
  assert.equal(me.data.isAdmin, false);
});

test('revocation invalidates a live session immediately', async () => {
  const created = await req(srv.base, 'POST', '/api/admin/guests', { cookie: admin, json: { names: ['Revoke Me'] } });
  const id = created.data[0].id;
  const gc = await login(srv.base, created.data[0].code);
  assert.equal((await req(srv.base, 'GET', '/api/me', { cookie: gc })).status, 200);
  await req(srv.base, 'POST', `/api/admin/guests/${id}/revoke`, { cookie: admin });
  assert.equal((await req(srv.base, 'GET', '/api/me', { cookie: gc })).status, 401, 'revoked session must die');
  assert.equal(await login(srv.base, created.data[0].code), null, 'revoked code cannot re-login');
});

test('upload: photo processes to ready and appears in listing', async () => {
  const up = await uploadFile(srv.base, admin, await jpeg(1), 'party.jpg', 'image/jpeg');
  assert.equal(up.status, 201);
  assert.equal(up.data.type, 'photo');
  const status = await waitReady(srv.base, admin, up.data.id);
  assert.equal(status, 'ready');
  const list = await req(srv.base, 'GET', '/api/media', { cookie: admin });
  assert.ok(list.data.items.some((i) => i.id === up.data.id));
});

test('upload: identical bytes are de-duplicated', async () => {
  const buf = await jpeg(2);
  const first = await uploadFile(srv.base, admin, buf, 'dup.jpg', 'image/jpeg');
  assert.equal(first.status, 201);
  const second = await uploadFile(srv.base, admin, buf, 'dup-again.jpg', 'image/jpeg');
  assert.equal(second.status, 200);
  assert.equal(second.data.duplicate, true);
  assert.equal(second.data.id, first.data.id);
});

test('upload: unsupported type rejected with 415', async () => {
  const up = await uploadFile(srv.base, admin, Buffer.from('hello'), 'notes.txt', 'text/plain');
  assert.equal(up.status, 415);
});

test('listing: type filter and keyset paging', async () => {
  // seed a few more photos
  for (let i = 10; i < 14; i++) {
    const up = await uploadFile(srv.base, admin, await jpeg(i), `p${i}.jpg`, 'image/jpeg');
    await waitReady(srv.base, admin, up.data.id);
  }
  const photos = await req(srv.base, 'GET', '/api/media?type=photo&limit=2', { cookie: admin });
  assert.equal(photos.status, 200);
  assert.ok(photos.data.items.every((i) => i.type === 'photo'));
  assert.ok(photos.data.nextCursor, 'should paginate');
  const page2 = await req(srv.base, 'GET', `/api/media?type=photo&limit=2&cursor=${photos.data.nextCursor}`, { cookie: admin });
  const ids1 = new Set(photos.data.items.map((i) => i.id));
  assert.ok(page2.data.items.every((i) => !ids1.has(i.id)), 'page 2 must not repeat page 1');
});

test('download: zip of selected ids streams as application/zip', async () => {
  const list = await req(srv.base, 'GET', '/api/media?limit=2', { cookie: admin });
  const ids = list.data.items.map((i) => i.id).join(',');
  const r = await fetch(srv.base + '/api/download', {
    method: 'POST',
    headers: { Cookie: admin, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `ids=${ids}`,
  });
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /zip/);
  const bytes = Buffer.from(await r.arrayBuffer());
  assert.ok(bytes.length > 0, 'zip should have content');
  assert.equal(bytes.subarray(0, 2).toString(), 'PK', 'valid zip magic');
});

test('listing: hostile limit values are clamped, not crashed', async () => {
  for (const bad of ['-5', '2.5', '0', 'abc', '99999']) {
    const r = await req(srv.base, 'GET', `/api/media?limit=${bad}`, { cookie: admin });
    assert.equal(r.status, 200, `limit=${bad} should not error`);
    assert.ok(Array.isArray(r.data.items));
    assert.ok(r.data.items.length <= 100, 'never exceeds PAGE_MAX');
  }
});

test('download: empty selection 400', async () => {
  const r = await req(srv.base, 'POST', '/api/download', {
    cookie: admin,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'ids=',
  });
  assert.equal(r.status, 400);
});

test('pin: admin pins, item moves to pinned set and out of paged items', async () => {
  const list = await req(srv.base, 'GET', '/api/media?limit=1', { cookie: admin });
  const id = list.data.items[0].id;
  const pin = await req(srv.base, 'POST', `/api/admin/media/${id}/pin`, { cookie: admin, json: { pinned: true } });
  assert.equal(pin.status, 200);
  const after = await req(srv.base, 'GET', '/api/media', { cookie: admin });
  assert.ok(after.data.pinned.some((i) => i.id === id), 'pinned set contains it');
  assert.ok(!after.data.items.some((i) => i.id === id), 'paged items exclude it');
  // unpin
  await req(srv.base, 'POST', `/api/admin/media/${id}/pin`, { cookie: admin, json: { pinned: false } });
  const restored = await req(srv.base, 'GET', '/api/media', { cookie: admin });
  assert.ok(!restored.data.pinned.some((i) => i.id === id));
});

test('logout clears the session', async () => {
  const gc = await login(srv.base, srv.adminCode);
  const out = await req(srv.base, 'POST', '/api/logout', { cookie: gc });
  const cleared = cookieFrom(out.setCookie);
  // sending the cleared cookie value should not authenticate
  assert.equal((await req(srv.base, 'GET', '/api/me', { cookie: cleared })).status, 401);
});
