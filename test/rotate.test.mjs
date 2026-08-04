// Admin rotate: permanent 90° clockwise rotation of photo originals.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnServer, req, login, uploadFile, waitReady } from './helpers.mjs';
import { jpeg } from './fixtures.mjs';

let srv;
let admin;
let guest;
let photoId;
before(async () => {
  srv = await spawnServer();
  admin = await login(srv.base, srv.adminCode);
  const g = await req(srv.base, 'POST', '/api/admin/guests', {
    cookie: admin,
    json: { names: ['Rotator Guest'] },
  });
  guest = await login(srv.base, g.data[0].code);
  const up = await uploadFile(srv.base, admin, await jpeg(7), 'sideways.jpg', 'image/jpeg');
  photoId = up.data.id;
  assert.equal(await waitReady(srv.base, admin, photoId), 'ready');
});
after(() => srv?.stop());

test('rotate swaps dimensions, bumps rev, and is repeatable to a full turn', async () => {
  const beforeItem = (await req(srv.base, 'GET', `/api/media/${photoId}`, { cookie: admin })).data;
  assert.equal(beforeItem.rev, 0);

  const r1 = await req(srv.base, 'POST', `/api/admin/media/${photoId}/rotate`, { cookie: admin });
  assert.equal(r1.status, 200);
  assert.equal(r1.data.rev, 1);
  assert.equal(r1.data.width, beforeItem.height, 'width and height should swap');
  assert.equal(r1.data.height, beforeItem.width);
  assert.equal(r1.data.ext, 'jpg', 'non-HEIC keeps its format');
  assert.equal(r1.data.filename, 'sideways.jpg', 'filename unchanged for non-HEIC');

  // Renditions regenerated and dimensions persisted.
  const mid = (await req(srv.base, 'GET', `/api/media/${photoId}`, { cookie: admin })).data;
  assert.equal(mid.width, beforeItem.height);
  assert.equal(mid.rev, 1);
  const thumb = await fetch(`${srv.base}/media/thumb/${photoId}?v=1`, {
    headers: { Cookie: admin },
  });
  assert.equal(thumb.status, 200);

  // Three more quarter-turns land back on the original orientation.
  for (let i = 0; i < 3; i++) {
    const r = await req(srv.base, 'POST', `/api/admin/media/${photoId}/rotate`, { cookie: admin });
    assert.equal(r.status, 200);
  }
  const full = (await req(srv.base, 'GET', `/api/media/${photoId}`, { cookie: admin })).data;
  assert.equal(full.width, beforeItem.width);
  assert.equal(full.height, beforeItem.height);
  assert.equal(full.rev, 4);
});

test('non-admin cannot rotate', async () => {
  const r = await req(srv.base, 'POST', `/api/admin/media/${photoId}/rotate`, { cookie: guest });
  assert.equal(r.status, 403);
});

test('rotate rejects unknown and malformed ids', async () => {
  assert.equal(
    (
      await req(srv.base, 'POST', '/api/admin/media/00000000-0000-4000-8000-000000000000/rotate', {
        cookie: admin,
      })
    ).status,
    404,
  );
  assert.equal(
    (await req(srv.base, 'POST', '/api/admin/media/not-a-uuid/rotate', { cookie: admin })).status,
    400,
  );
});

test('gallery listing exposes rev for cache busting', async () => {
  const list = await req(srv.base, 'GET', '/api/media', { cookie: admin });
  const item = list.data.items.find((i) => i.id === photoId);
  assert.ok(item, 'photo should be listed');
  assert.equal(item.rev, 4);
});
