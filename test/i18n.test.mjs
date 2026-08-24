// The two locale tables must stay in lockstep: a key present in one and missing
// in the other builds cleanly but renders "undefined" (or throws, for the
// function-valued entries) on the other site — this is the CI net for that.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import en from '../src/i18n/en.js';
import bg from '../src/i18n/bg.js';

test('en/bg locale tables have identical shape', () => {
  for (const section of ['meta', 't']) {
    const enKeys = Object.keys(en[section]).sort();
    const bgKeys = Object.keys(bg[section]).sort();
    assert.deepEqual(bgKeys, enKeys, `${section}.* keys must match between en.js and bg.js`);
    for (const k of enKeys) {
      assert.equal(
        typeof bg[section][k],
        typeof en[section][k],
        `${section}.${k} must be the same kind (string vs function) in both locales`,
      );
    }
  }
  // Top-level scalars every consumer relies on.
  for (const k of ['site', 'lang', 'intl', 'suit', 'publicUrl']) {
    assert.equal(typeof en[k], 'string', `en.${k}`);
    assert.equal(typeof bg[k], 'string', `bg.${k}`);
  }
  // days is per-site by design (different dates), but must exist and be non-empty.
  assert.ok(Object.keys(en.days).length >= 1);
  assert.ok(Object.keys(bg.days).length >= 1);
});

test('function-valued strings produce text for representative inputs', () => {
  // Generic smoke: every function entry returns a non-empty string when given
  // plausible arguments (a count/type first, a name second).
  for (const table of [en.t, bg.t]) {
    for (const [k, v] of Object.entries(table)) {
      if (typeof v !== 'function') continue;
      for (const args of [
        [2, 'Мария'],
        [1, 'Test'],
      ]) {
        const out = v(...args);
        assert.equal(typeof out, 'string', `${k} must return a string`);
        assert.ok(out.length > 0, `${k} must not be empty`);
      }
    }
  }
});
