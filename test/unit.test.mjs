// Unit tests for pure helpers. Set a temp data dir before importing modules that
// open the DB on load.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'lw-unit-'));
process.env.SESSION_SECRET = 'unit-secret';

const { exifToUtc } = await import('../server/processing.js');
const { generateCode } = await import('../server/db.js');

test('exifToUtc: naive wall-clock assumed in event tz (summer, CEST +2)', () => {
  assert.equal(exifToUtc('2026:06:20 15:30:00'), '2026-06-20T13:30:00.000Z');
});

test('exifToUtc: naive wall-clock in winter (CET +1) across DST', () => {
  assert.equal(exifToUtc('2026:12:20 15:30:00'), '2026-12-20T14:30:00.000Z');
});

test('exifToUtc: camera offset tag wins over event tz', () => {
  assert.equal(exifToUtc('2026:06:20 15:30:00', '+02:00'), '2026-06-20T13:30:00.000Z');
  assert.equal(exifToUtc('2026:06:20 15:30:00', '-05:00'), '2026-06-20T20:30:00.000Z');
});

test('exifToUtc: accepts ISO-ish separators', () => {
  assert.equal(exifToUtc('2026-06-20T15:30:00'), '2026-06-20T13:30:00.000Z');
});

test('exifToUtc: malformed input returns null', () => {
  assert.equal(exifToUtc('not a date'), null);
  assert.equal(exifToUtc(''), null);
});

test('generateCode: XXXX-XXXX with no ambiguous characters', () => {
  for (let i = 0; i < 500; i++) {
    const code = generateCode();
    assert.match(code, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/, `bad shape: ${code}`);
    assert.ok(!/[O0I1]/.test(code), `ambiguous char in ${code}`);
  }
});

test('generateCode: effectively unique across many draws', () => {
  const seen = new Set();
  for (let i = 0; i < 2000; i++) seen.add(generateCode());
  // 31^8 space — collisions in 2000 draws should be essentially impossible
  assert.ok(seen.size > 1990, `too many collisions: ${seen.size}/2000`);
});
