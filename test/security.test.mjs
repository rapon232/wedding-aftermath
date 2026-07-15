// Adversarial / hackability tests: injection, traversal, authz/IDOR, abuse limits.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnServer, req, login, uploadFile, waitReady } from './helpers.mjs';
import { jpeg } from './fixtures.mjs';

let srv;
let admin;
let guestA;
let guestB;
let guestBId;

before(async () => {
  srv = await spawnServer();
  admin = await login(srv.base, srv.adminCode);
  const a = await req(srv.base, 'POST', '/api/admin/guests', {
    cookie: admin,
    json: { names: ['Alice', 'Bob'] },
  });
  guestA = await login(srv.base, a.data[0].code);
  guestB = await login(srv.base, a.data[1].code);
  guestBId = a.data[1].id;
});
after(() => srv?.stop());

// --- 8.4 SQL injection ---

test('SQLi: classic payloads in login code never authenticate', async () => {
  const payloads = [
    "' OR '1'='1",
    "' OR 1=1 --",
    "'; DROP TABLE guests; --",
    "admin'--",
    "' UNION SELECT code FROM guests --",
  ];
  for (const code of payloads) {
    const r = await req(srv.base, 'POST', '/api/login', { json: { code } });
    assert.equal(r.status, 401, `payload authenticated: ${code}`);
  }
  // guests table must still be intact
  const g = await req(srv.base, 'GET', '/api/admin/guests', { cookie: admin });
  assert.equal(g.status, 200);
  assert.ok(g.data.length >= 3, 'guests table survived injection attempts');
});

test('SQLi: injection in listing filters does not error or leak', async () => {
  const probes = [
    '/api/media?uploader=1 OR 1=1',
    '/api/media?uploader=1; DROP TABLE media--',
    "/api/media?type=photo' OR '1'='1",
    '/api/media?sort=taken_at;DELETE FROM media',
  ];
  for (const p of probes) {
    const r = await req(srv.base, 'GET', encodeURI(p), { cookie: admin });
    assert.ok(r.status === 200 || r.status === 400, `unexpected ${r.status} for ${p}`);
  }
  // media table still queryable
  assert.equal((await req(srv.base, 'GET', '/api/media', { cookie: admin })).status, 200);
});

test('SQLi: malformed/injected cursor is rejected, not executed', async () => {
  const bad = Buffer.from(JSON.stringify({ v: "' OR 1=1", id: "'; DROP TABLE media--" })).toString(
    'base64url',
  );
  const r = await req(srv.base, 'GET', `/api/media?cursor=${bad}`, { cookie: admin });
  // parametrized — treated as literal values, returns a normal (likely empty) page
  assert.equal(r.status, 200);
  assert.equal((await req(srv.base, 'GET', '/api/media', { cookie: admin })).status, 200);
});

// --- 8.5 Path traversal / file access ---

test('traversal: /media routes never serve arbitrary files', async () => {
  const ids = [
    '..%2f..%2fdb.sqlite',
    '..%2F..%2Fserver%2Fconfig.js',
    '%2e%2e%2f%2e%2e%2fdb.sqlite',
    '....//....//db.sqlite',
    'a/../../db.sqlite',
    '00000000-0000-0000-0000-000000000000%00.webp',
  ];
  for (const id of ['thumb', 'preview', 'poster', 'file']) {
    for (const bad of ids) {
      const r = await req(srv.base, 'GET', `/media/${id}/${bad}`, { cookie: admin });
      assert.notEqual(r.status, 200, `served something for /media/${id}/${bad}`);
      assert.ok(!/SQLite format/i.test(r.text), 'leaked sqlite file bytes');
      assert.ok(!/SESSION_SECRET|better-sqlite3/.test(r.text), 'leaked source');
    }
  }
});

test('traversal: valid UUID that does not exist is 404, not 500', async () => {
  const r = await req(srv.base, 'GET', '/media/file/11111111-1111-1111-1111-111111111111', { cookie: admin });
  assert.equal(r.status, 404);
});

// --- 8.6 Authorization / IDOR ---

test('authz: protected routes require a session (401)', async () => {
  const routes = [
    ['GET', '/api/me'],
    ['GET', '/api/media'],
    ['GET', '/api/uploaders'],
    ['GET', '/media/thumb/11111111-1111-1111-1111-111111111111'],
    ['POST', '/api/upload'],
  ];
  for (const [method, path] of routes) {
    const r = await req(srv.base, method, path);
    assert.equal(r.status, 401, `${method} ${path} not protected`);
  }
});

test('authz: admin routes forbidden to non-admins (403)', async () => {
  const routes = [
    ['GET', '/api/admin/guests'],
    ['POST', '/api/admin/guests'],
    ['POST', '/api/admin/guests/1/revoke'],
    ['POST', '/api/admin/media/11111111-1111-1111-1111-111111111111/pin'],
  ];
  for (const [method, path] of routes) {
    const r = await req(srv.base, method, path, { cookie: guestA, json: {} });
    assert.equal(r.status, 403, `${method} ${path} allowed for non-admin`);
  }
});

test('IDOR: a guest cannot delete another guest’s upload', async () => {
  const up = await uploadFile(srv.base, guestA, await jpeg(42), 'alice.jpg', 'image/jpeg');
  await waitReady(srv.base, guestA, up.data.id);
  // Bob tries to delete Alice's photo
  const bobDel = await req(srv.base, 'DELETE', `/api/media/${up.data.id}`, { cookie: guestB });
  assert.equal(bobDel.status, 403);
  // Alice can delete her own
  const aliceDel = await req(srv.base, 'DELETE', `/api/media/${up.data.id}`, { cookie: guestA });
  assert.equal(aliceDel.status, 200);
});

test('authz: tampered / forged session cookies are rejected', async () => {
  for (const bad of ['lw_session=garbage', 'lw_session=s%3A1.forgedsignature', 'lw_session=999']) {
    const r = await req(srv.base, 'GET', '/api/me', { cookie: bad });
    assert.equal(r.status, 401, `accepted forged cookie: ${bad}`);
  }
});

// --- 8.7 Abuse limits & cookie hygiene ---
// NB: this runs before the brute-force test on purpose — that test exhausts the
// per-IP login throttle, which would otherwise 429 this login (all tests share 127.0.0.1).

test('cookie hygiene: session cookie is HttpOnly + SameSite', async () => {
  const r = await req(srv.base, 'POST', '/api/login', { json: { code: srv.adminCode } });
  const sc = r.setCookie || '';
  assert.match(sc, /HttpOnly/i, 'cookie not HttpOnly');
  assert.match(sc, /SameSite=Lax/i, 'cookie missing SameSite=Lax');
});

test('abuse: repeated bad logins get throttled (429)', async () => {
  let sawThrottle = false;
  for (let i = 0; i < 12; i++) {
    const r = await req(srv.base, 'POST', '/api/login', { json: { code: 'ZZZZ-ZZZZ' } });
    if (r.status === 429) sawThrottle = true;
  }
  assert.ok(sawThrottle, 'brute-force was not throttled');
});

test('abuse: oversized JSON body rejected (413)', async () => {
  const huge = 'x'.repeat(2 * 1024 * 1024); // 2 MB > 1 MB json limit
  const r = await req(srv.base, 'POST', '/api/login', { json: { code: huge } });
  assert.equal(r.status, 413);
});

test('abuse: chunked upload rejects more data than declared', async () => {
  const init = await req(srv.base, 'POST', '/api/upload/init', {
    cookie: admin,
    json: { name: 'big.mp4', size: 10 },
  });
  assert.equal(init.status, 200);
  const uid = init.data.uploadId;
  const r = await fetch(`${srv.base}/api/upload/${uid}/chunk?index=0`, {
    method: 'POST',
    headers: { Cookie: admin, 'Content-Type': 'application/octet-stream' },
    body: Buffer.alloc(100), // 100 > declared 10
  });
  assert.equal(r.status, 400);
});

test('abuse: chunked upload session is scoped to its owner', async () => {
  const init = await req(srv.base, 'POST', '/api/upload/init', {
    cookie: guestA,
    json: { name: 'a.mp4', size: 1000 },
  });
  const uid = init.data.uploadId;
  // Bob tries to push a chunk into Alice's upload session
  const r = await fetch(`${srv.base}/api/upload/${uid}/chunk?index=0`, {
    method: 'POST',
    headers: { Cookie: guestB, 'Content-Type': 'application/octet-stream' },
    body: Buffer.alloc(10),
  });
  assert.equal(r.status, 404, 'cross-user chunk hijack allowed');
});
