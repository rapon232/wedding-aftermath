// Live updates (SSE): auth-gated, and broadcasts when media becomes ready.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnServer, req, login, uploadFile } from './helpers.mjs';
import { jpeg } from './fixtures.mjs';

let srv;
let admin;
before(async () => {
  srv = await spawnServer();
  admin = await login(srv.base, srv.adminCode);
});
after(() => srv?.stop());

test('/api/events requires a session', async () => {
  const r = await fetch(`${srv.base}/api/events`);
  assert.equal(r.status, 401);
});

test('a finished upload broadcasts a "ready" event to listeners', async () => {
  const ac = new AbortController();
  const res = await fetch(`${srv.base}/api/events`, { headers: { Cookie: admin }, signal: ac.signal });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /event-stream/);

  // Read the stream in the background, collecting data lines.
  let buffer = '';
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const gotReady = (async () => {
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      if (/"type":"ready"/.test(buffer)) return true;
    }
    return false;
  })();

  // Upload a photo; once it processes it should push a "ready" line.
  const up = await uploadFile(srv.base, admin, await jpeg(3), 'live.jpg', 'image/jpeg');
  assert.equal(up.status, 201);

  const ok = await gotReady;
  ac.abort();
  assert.ok(ok, 'expected a "ready" SSE event after upload processed');
  assert.match(buffer, new RegExp(`"id":"${up.data.id}"`));
});
