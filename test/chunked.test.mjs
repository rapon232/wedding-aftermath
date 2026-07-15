// Parallel/out-of-order chunked upload must reassemble byte-perfectly.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnServer, req, login } from './helpers.mjs';
import { jpeg } from './fixtures.mjs';

const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

let srv;
let admin;
before(async () => {
  // Tiny chunk size so a small file spans many chunks.
  srv = await spawnServer({ CHUNK_SIZE_BYTES: '16' });
  admin = await login(srv.base, srv.adminCode);
});
after(() => srv?.stop());

test('chunks arriving out of order reassemble to the exact original bytes', async () => {
  const buf = await jpeg(9);
  const init = await req(srv.base, 'POST', '/api/upload/init', {
    cookie: admin,
    json: { name: 'clip.jpg', size: buf.length },
  });
  assert.equal(init.status, 200);
  const { uploadId, chunkSize } = init.data;
  assert.equal(chunkSize, 16);
  const n = Math.ceil(buf.length / chunkSize);
  assert.ok(n > 3, 'expected several chunks');

  // Send them reversed (worst case for an offset-based writer).
  for (const i of [...Array(n).keys()].reverse()) {
    const slice = buf.subarray(i * chunkSize, Math.min((i + 1) * chunkSize, buf.length));
    const r = await fetch(`${srv.base}/api/upload/${uploadId}/chunk?index=${i}`, {
      method: 'POST',
      headers: { Cookie: admin, 'Content-Type': 'application/octet-stream' },
      body: slice,
    });
    assert.equal(r.status, 200, `chunk ${i} accepted`);
  }

  const fin = await req(srv.base, 'POST', `/api/upload/${uploadId}/finish`, { cookie: admin });
  assert.equal(fin.status, 201);

  const stored = fs.readFileSync(path.join(srv.dir, 'originals', `${fin.data.id}.jpg`));
  assert.equal(sha(stored), sha(buf), 'reassembled file must be byte-identical to the original');
});

test('a chunk past the declared size is rejected', async () => {
  const init = await req(srv.base, 'POST', '/api/upload/init', {
    cookie: admin,
    json: { name: 'x.jpg', size: 20 },
  });
  const { uploadId } = init.data;
  // index 5 → offset 80, well past size 20
  const r = await fetch(`${srv.base}/api/upload/${uploadId}/chunk?index=5`, {
    method: 'POST',
    headers: { Cookie: admin, 'Content-Type': 'application/octet-stream' },
    body: Buffer.alloc(16),
  });
  assert.equal(r.status, 400);
});
