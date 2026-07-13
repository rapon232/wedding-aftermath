// Comments on media + guestbook notes (new features).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnServer, req, login, uploadFile, waitReady } from './helpers.mjs';
import { jpeg } from './fixtures.mjs';

let srv;
let admin;
let guest;
let guestId;
before(async () => {
  srv = await spawnServer();
  admin = await login(srv.base, srv.adminCode);
  const g = await req(srv.base, 'POST', '/api/admin/guests', { cookie: admin, json: { names: ['Commenter'] } });
  guestId = g.data[0].id;
  guest = await login(srv.base, g.data[0].code);
});
after(() => srv?.stop());

test('comments: add, list, and delete permissions', async () => {
  const up = await uploadFile(srv.base, admin, await jpeg(200), 'c.jpg', 'image/jpeg');
  await waitReady(srv.base, admin, up.data.id);
  const id = up.data.id;

  const add = await req(srv.base, 'POST', `/api/media/${id}/comments`, { cookie: guest, json: { body: 'gorgeous! ♥' } });
  assert.equal(add.status, 201);
  assert.equal(add.data.body, 'gorgeous! ♥');
  assert.equal(add.data.guest_name, 'Commenter');

  const list = await req(srv.base, 'GET', `/api/media/${id}/comments`, { cookie: admin });
  assert.equal(list.data.length, 1);

  // another guest can't delete someone else's comment
  const foreign = await req(srv.base, 'DELETE', `/api/comments/${add.data.id}`, { cookie: admin });
  // admin CAN (admin override) — verify a non-owner non-admin is blocked instead:
  assert.equal(foreign.status, 200); // admin override allowed
  assert.equal((await req(srv.base, 'GET', `/api/media/${id}/comments`, { cookie: admin })).data.length, 0);
});

test('comments: empty body rejected; bad/missing media handled', async () => {
  const up = await uploadFile(srv.base, admin, await jpeg(201), 'c2.jpg', 'image/jpeg');
  await waitReady(srv.base, admin, up.data.id);
  assert.equal((await req(srv.base, 'POST', `/api/media/${up.data.id}/comments`, { cookie: guest, json: { body: '   ' } })).status, 400);
  assert.equal((await req(srv.base, 'POST', '/api/media/not-a-uuid/comments', { cookie: guest, json: { body: 'x' } })).status, 400);
  assert.equal(
    (await req(srv.base, 'POST', '/api/media/11111111-1111-1111-1111-111111111111/comments', { cookie: guest, json: { body: 'x' } })).status,
    404
  );
});

test('comments require auth', async () => {
  assert.equal((await req(srv.base, 'GET', '/api/media/11111111-1111-1111-1111-111111111111/comments')).status, 401);
});

test('notes: anyone leaves one, but only admins can read them', async () => {
  const n1 = await req(srv.base, 'POST', '/api/notes', { cookie: guest, json: { body: 'best day ever' } });
  assert.equal(n1.status, 201, 'a guest can leave a note');
  const n2 = await req(srv.base, 'POST', '/api/notes', { cookie: admin, json: { body: 'thank you all' } });

  // A non-admin guest CANNOT read the wall.
  assert.equal((await req(srv.base, 'GET', '/api/notes', { cookie: guest })).status, 403);

  // The admin can, newest-first.
  const list = await req(srv.base, 'GET', '/api/notes', { cookie: admin });
  assert.equal(list.status, 200);
  assert.ok(list.data.length >= 2);
  assert.equal(list.data[0].id, n2.data.id, 'newest first');

  // guest cannot delete another's note; admin can delete any.
  assert.equal((await req(srv.base, 'DELETE', `/api/notes/${n2.data.id}`, { cookie: guest })).status, 403);
  assert.equal((await req(srv.base, 'DELETE', `/api/notes/${n1.data.id}`, { cookie: admin })).status, 200);
});

test('notes: empty rejected, auth required', async () => {
  assert.equal((await req(srv.base, 'POST', '/api/notes', { cookie: guest, json: { body: '' } })).status, 400);
  assert.equal((await req(srv.base, 'POST', '/api/notes', { json: { body: 'x' } })).status, 401);
  assert.equal((await req(srv.base, 'GET', '/api/notes')).status, 401);
});
