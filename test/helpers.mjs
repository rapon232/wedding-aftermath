// Test harness: boot the real app as a black box on an ephemeral port with a
// throwaway data dir, and small HTTP helpers. Each test file spins one server.
import { spawn } from 'child_process';
import net from 'net';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

export const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

export function getFreePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.on('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

export async function spawnServer(extraEnv = {}) {
  const port = await getFreePort();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lw-test-'));
  const child = spawn('node', ['server/index.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      DATA_DIR: dir,
      SESSION_SECRET: `test-secret-${port}`,
      ADMIN_NAME: 'TestAdmin',
      NODE_ENV: 'test',
      RESEND_API_KEY: '', // never send real email from tests (override any .env value)
      ...extraEnv,
    },
  });

  let out = '';
  const adminCode = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`server start timeout:\n${out}`)), 10000);
    const scan = () => {
      const m = out.match(/access code: (\S+)/);
      if (m && /listening on/.test(out)) {
        clearTimeout(timer);
        resolve(m[1]);
      }
    };
    child.stdout.on('data', (d) => {
      out += d;
      scan();
    });
    child.stderr.on('data', (d) => (out += d));
    child.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`server exited early (${code}):\n${out}`));
    });
  });

  const base = `http://127.0.0.1:${port}`;
  return {
    base,
    adminCode,
    dir,
    stop() {
      child.kill('SIGKILL');
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        /* best effort */
      }
    },
  };
}

/** One HTTP call. Pass {json} to send a JSON body, {body} for raw/FormData, {cookie} to authenticate. */
export async function req(base, method, pathname, opts = {}) {
  const headers = { ...opts.headers };
  let body = opts.body;
  const noBody = method === 'GET' || method === 'HEAD';
  if (opts.json !== undefined && !noBody) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.json);
  }
  if (noBody) body = undefined;
  if (opts.cookie) headers.Cookie = opts.cookie;
  const r = await fetch(base + pathname, { method, headers, body, redirect: 'manual' });
  const text = await r.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    /* non-JSON */
  }
  return { status: r.status, data, text, headers: r.headers, setCookie: r.headers.get('set-cookie') };
}

export function cookieFrom(setCookie) {
  return setCookie ? setCookie.split(';')[0] : null;
}

export async function login(base, code) {
  const r = await req(base, 'POST', '/api/login', { json: { code } });
  return cookieFrom(r.setCookie);
}

/** Upload a buffer as a named file via multipart. */
export async function uploadFile(base, cookie, buffer, filename, type = 'application/octet-stream') {
  const fd = new FormData();
  fd.append('file', new Blob([buffer], { type }), filename);
  const r = await fetch(base + '/api/upload', { method: 'POST', headers: { Cookie: cookie }, body: fd });
  const data = await r.json().catch(() => null);
  return { status: r.status, data };
}

/** Poll a media item until it leaves "processing" (or time out). */
export async function waitReady(base, cookie, id, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const r = await req(base, 'GET', `/api/media/${id}`, { cookie });
    if (r.data && r.data.status !== 'processing') return r.data.status;
    await new Promise((res) => setTimeout(res, 150));
  }
  return 'timeout';
}
