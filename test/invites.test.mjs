// Guest invites: import, make-admin, activation, send-invite guards.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnServer, req, login } from './helpers.mjs';

let srv;
let admin;
before(async () => {
  srv = await spawnServer(); // no RESEND_API_KEY → email disabled
  admin = await login(srv.base, srv.adminCode);
});
after(() => srv?.stop());

test('CSV import creates guests with codes and dedupes by email', async () => {
  const csv = 'name,email\nAlice A,alice@example.com\nBob B,bob@example.com\nAlice Again,alice@example.com\nNoEmail,\n';
  const r = await req(srv.base, 'POST', '/api/admin/import', { cookie: admin, json: { csv } });
  assert.equal(r.status, 201);
  assert.equal(r.data.createdCount, 2, 'two valid unique emails');
  assert.ok(r.data.skipped >= 2, 'dupe + no-email skipped');
  assert.match(r.data.created[0].code, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  // re-importing the same emails skips them all
  const again = await req(srv.base, 'POST', '/api/admin/import', { cookie: admin, json: { csv } });
  assert.equal(again.data.createdCount, 0);
});

test('CSV import auto-detects semicolon delimiter (Numbers/Excel export) + BOM', async () => {
  const csv = '﻿name;email\r\nSemi One;semi1@example.com\r\nSemi Two;semi2@example.com\r\n';
  const r = await req(srv.base, 'POST', '/api/admin/import', { cookie: admin, json: { csv } });
  assert.equal(r.status, 201);
  assert.equal(r.data.createdCount, 2, 'semicolon rows parsed, not skipped');
  assert.equal(r.data.created[0].email, 'semi1@example.com');
});

test('creating a guest with an existing name is skipped (no duplicate)', async () => {
  const first = await req(srv.base, 'POST', '/api/admin/guests', { cookie: admin, json: { names: ['Unique Uma'] } });
  assert.equal(first.data.length, 1);
  const dupe = await req(srv.base, 'POST', '/api/admin/guests', { cookie: admin, json: { names: ['unique uma', 'Brand New'] } });
  assert.equal(dupe.data.length, 1, 'only the new name is created; the existing one is skipped');
  assert.equal(dupe.data[0].name, 'Brand New');
});

test('create a single guest with name + email (hand-add without CSV)', async () => {
  const r = await req(srv.base, 'POST', '/api/admin/guests', { cookie: admin, json: { name: 'Solo Sam', email: 'sam@example.com' } });
  assert.equal(r.status, 201);
  assert.equal(r.data.length, 1);
  assert.equal(r.data[0].email, 'sam@example.com');
  // the guest shows up with their email, so Send invite is available
  const g = (await req(srv.base, 'GET', '/api/admin/guests', { cookie: admin })).data.find((x) => x.id === r.data[0].id);
  assert.equal(g.email, 'sam@example.com');
  // duplicate email is skipped
  const dupe = await req(srv.base, 'POST', '/api/admin/guests', { cookie: admin, json: { name: 'Sam Twin', email: 'sam@example.com' } });
  assert.equal(dupe.data.length, 0);
  // an email alongside multiple names is rejected
  const bad = await req(srv.base, 'POST', '/api/admin/guests', { cookie: admin, json: { names: ['A B', 'C D'], email: 'x@example.com' } });
  assert.equal(bad.status, 400);
});

test('make-admin grants and revokes, but never removes the last admin', async () => {
  const g = await req(srv.base, 'POST', '/api/admin/guests', { cookie: admin, json: { names: ['Deputy'] } });
  const id = g.data[0].id;
  assert.equal((await req(srv.base, 'POST', `/api/admin/guests/${id}/admin`, { cookie: admin, json: { isAdmin: true } })).status, 200);
  // now demote them back
  assert.equal((await req(srv.base, 'POST', `/api/admin/guests/${id}/admin`, { cookie: admin, json: { isAdmin: false } })).status, 200);
  // find the bootstrap admin id (the only admin at start) and try to demote → blocked
  const guests = (await req(srv.base, 'GET', '/api/admin/guests', { cookie: admin })).data;
  const admins = guests.filter((x) => x.is_admin);
  assert.equal(admins.length, 1);
  const r = await req(srv.base, 'POST', `/api/admin/guests/${admins[0].id}/admin`, { cookie: admin, json: { isAdmin: false } });
  assert.equal(r.status, 400, 'cannot remove the last admin');
});

test('activation stamps on first login and shows in the guest list', async () => {
  const g = await req(srv.base, 'POST', '/api/admin/guests', { cookie: admin, json: { names: ['Fresh'] } });
  const code = g.data[0].code;
  const before = (await req(srv.base, 'GET', '/api/admin/guests', { cookie: admin })).data.find((x) => x.id === g.data[0].id);
  assert.equal(before.activated_at, null, 'not activated before login');
  await login(srv.base, code);
  const after = (await req(srv.base, 'GET', '/api/admin/guests', { cookie: admin })).data.find((x) => x.id === g.data[0].id);
  assert.ok(after.activated_at, 'activated after first login');
});

test('send-invite guards: no email → 400, email-not-configured → 503, non-admin → 403', async () => {
  const noEmail = await req(srv.base, 'POST', '/api/admin/guests', { cookie: admin, json: { names: ['Emailless'] } });
  const r1 = await req(srv.base, 'POST', `/api/admin/guests/${noEmail.data[0].id}/invite`, { cookie: admin });
  assert.equal(r1.status, 400); // no email on this guest

  const imp = await req(srv.base, 'POST', '/api/admin/import', { cookie: admin, json: { csv: 'name,email\nCarol,carol@example.com\n' } });
  const r2 = await req(srv.base, 'POST', `/api/admin/guests/${imp.data.created[0].id}/invite`, { cookie: admin });
  assert.equal(r2.status, 503); // has email but server has no RESEND key in tests

  // non-admin can't invite
  const guest = await login(srv.base, imp.data.created[0].code);
  const r3 = await req(srv.base, 'POST', `/api/admin/guests/${imp.data.created[0].id}/invite`, { cookie: guest });
  assert.equal(r3.status, 403);
});
