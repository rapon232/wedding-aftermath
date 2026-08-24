// Shared-code self-registration (the BG site's auth mode).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnServer, req, login, cookieFrom } from './helpers.mjs';

let srv;
let admin;
before(async () => {
  srv = await spawnServer({ SHARED_CODE: 'LOVEWINS', SITE: 'bg' });
  admin = await login(srv.base, srv.adminCode);
  assert.ok(admin, 'admin personal code must still work in shared mode');
});
after(() => srv?.stop());

test('shared code alone answers needProfile and grants no session', async () => {
  const r = await req(srv.base, 'POST', '/api/login', { json: { code: 'LOVE-WINS' } });
  assert.equal(r.status, 200);
  assert.equal(r.data.needProfile, true);
  assert.equal(r.setCookie, null, 'no session cookie before the profile step');
});

test('register creates a guest with a session, visible to admin', async () => {
  const r = await req(srv.base, 'POST', '/api/register', {
    json: { code: 'LOVEWINS', name: 'Мария Петрова', email: 'Maria@Example.BG' },
  });
  assert.equal(r.status, 201);
  assert.equal(r.data.isAdmin, false);
  const cookie = cookieFrom(r.setCookie);
  assert.ok(cookie, 'register starts a session');

  const me = await req(srv.base, 'GET', '/api/me', { cookie });
  assert.equal(me.status, 200);
  assert.equal(me.data.name, 'Мария Петрова');
  assert.equal(me.data.authMode, 'shared');

  const list = await req(srv.base, 'GET', '/api/admin/guests', { cookie: admin });
  const maria = list.data.find((g) => g.name === 'Мария Петрова');
  assert.ok(maria, 'self-registered guest appears in the admin panel');
  assert.equal(maria.email, 'maria@example.bg', 'email stored lowercased');
  assert.ok(maria.activated_at, 'self-registration counts as activated');
});

test('same email resumes the same guest — no duplicate, any case', async () => {
  const r = await req(srv.base, 'POST', '/api/register', {
    json: { code: 'LOVEWINS', name: 'Maria On Her Laptop', email: 'MARIA@example.bg' },
  });
  assert.equal(r.status, 200);
  assert.equal(r.data.name, 'Мария Петрова', 'original name wins — attribution stays stable');
  const list = await req(srv.base, 'GET', '/api/admin/guests', { cookie: admin });
  const marias = list.data.filter((g) => (g.email || '').toLowerCase() === 'maria@example.bg');
  assert.equal(marias.length, 1, 'still exactly one guest for that email');
});

test('revoked guest cannot re-register through the shared code', async () => {
  const reg = await req(srv.base, 'POST', '/api/register', {
    json: { code: 'LOVEWINS', name: 'Bad Actor', email: 'revoked@example.bg' },
  });
  assert.equal(reg.status, 201);
  const list = await req(srv.base, 'GET', '/api/admin/guests', { cookie: admin });
  const target = list.data.find((g) => g.email === 'revoked@example.bg');
  await req(srv.base, 'POST', `/api/admin/guests/${target.id}/revoke`, { cookie: admin });

  const again = await req(srv.base, 'POST', '/api/register', {
    json: { code: 'LOVEWINS', name: 'Bad Actor', email: 'revoked@example.bg' },
  });
  assert.equal(again.status, 403);
  assert.equal(cookieFrom(again.setCookie), null);
});

test('a known admin email is not an escalation path', async () => {
  // Create a guest with an email, promote them to admin, then try to hijack
  // that identity through the shared code.
  const mk = await req(srv.base, 'POST', '/api/admin/guests', {
    cookie: admin,
    json: { name: 'Second Admin', email: 'boss@example.bg' },
  });
  const id = mk.data[0].id;
  await req(srv.base, 'POST', `/api/admin/guests/${id}/admin`, {
    cookie: admin,
    json: { isAdmin: true },
  });
  const hijack = await req(srv.base, 'POST', '/api/register', {
    json: { code: 'LOVEWINS', name: 'Innocent Name', email: 'BOSS@example.bg' },
  });
  assert.equal(hijack.status, 401, 'admin emails must not resume via shared code');
  assert.equal(cookieFrom(hijack.setCookie), null);
});

test('register strips control and bidi characters from names', async () => {
  const r = await req(srv.base, 'POST', '/api/register', {
    json: { code: 'LOVEWINS', name: 'Zara‮ Line\nBreak', email: 'zara@example.bg' },
  });
  assert.equal(r.status, 201);
  assert.equal(r.data.name, 'Zara LineBreak');
});

test('register capitalizes each word of the name', async () => {
  const r = await req(srv.base, 'POST', '/api/register', {
    json: { code: 'LOVEWINS', name: 'иван петров-стоянов', email: 'ivan@example.bg' },
  });
  assert.equal(r.status, 201);
  assert.equal(r.data.name, 'Иван Петров-Стоянов');
});

test('register validates code, name, and email', async () => {
  const bad = await req(srv.base, 'POST', '/api/register', {
    json: { code: 'WRONGCODE', name: 'X', email: 'x@example.bg' },
  });
  assert.equal(bad.status, 401);
  const noName = await req(srv.base, 'POST', '/api/register', {
    json: { code: 'LOVEWINS', name: '  ', email: 'x@example.bg' },
  });
  assert.equal(noName.status, 400);
  const noEmail = await req(srv.base, 'POST', '/api/register', {
    json: { code: 'LOVEWINS', name: 'X', email: 'not-an-email' },
  });
  assert.equal(noEmail.status, 400);
});

test('admin can delete an empty guest but not one with uploads, an admin, or self', async () => {
  // A fresh self-registered guest with no uploads → deletable.
  const reg = await req(srv.base, 'POST', '/api/register', {
    json: { code: 'LOVEWINS', name: 'Deletable Guest', email: 'del@example.bg' },
  });
  const cookie = cookieFrom(reg.setCookie);
  const meRow = await req(srv.base, 'GET', '/api/me', { cookie });
  const gid = meRow.data.id;
  const del = await req(srv.base, 'DELETE', `/api/admin/guests/${gid}`, { cookie: admin });
  assert.equal(del.status, 200);
  const list = await req(srv.base, 'GET', '/api/admin/guests', { cookie: admin });
  assert.ok(!list.data.some((g) => g.id === gid), 'guest is gone');

  // Deleting yourself and deleting an admin are both refused.
  const meAdmin = await req(srv.base, 'GET', '/api/me', { cookie: admin });
  assert.equal(
    (await req(srv.base, 'DELETE', `/api/admin/guests/${meAdmin.data.id}`, { cookie: admin })).status,
    400,
  );
});

test('admin can rename a guest (sanitized + capitalized)', async () => {
  const mk = await req(srv.base, 'POST', '/api/admin/guests', {
    cookie: admin,
    json: { name: 'Temp', email: 'rename@example.bg' },
  });
  const id = mk.data[0].id;
  const r = await req(srv.base, 'POST', `/api/admin/guests/${id}/rename`, {
    cookie: admin,
    json: { name: 'мария иванова' },
  });
  assert.equal(r.status, 200);
  assert.equal(r.data.name, 'Мария Иванова');
  const empty = await req(srv.base, 'POST', `/api/admin/guests/${id}/rename`, {
    cookie: admin,
    json: { name: '   ' },
  });
  assert.equal(empty.status, 400);
});

test('classic mode: register is 404 and shared code is rejected at login', async () => {
  const classic = await spawnServer();
  try {
    const r = await req(classic.base, 'POST', '/api/register', {
      json: { code: 'LOVEWINS', name: 'X', email: 'x@example.bg' },
    });
    assert.equal(r.status, 404);
    const l = await req(classic.base, 'POST', '/api/login', { json: { code: 'LOVEWINS' } });
    assert.equal(l.status, 401);
  } finally {
    classic.stop();
  }
});
