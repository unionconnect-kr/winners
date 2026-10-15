import test from 'node:test';
import assert from 'node:assert/strict';
import { reportBytesToBase64 } from '../src/report-file.js';

test('multi-megabyte report bytes survive the native base64 bridge without corruption or stack overflow', () => {
  const bytes = Uint8Array.from({ length: 3 * 1024 * 1024 + 17 }, (_, i) => i % 256);
  assert.deepEqual(Buffer.from(reportBytesToBase64(bytes.buffer), 'base64'), Buffer.from(bytes));
  // Views must export only their selected bytes, not unrelated backing data.
  assert.deepEqual(Buffer.from(reportBytesToBase64(bytes.subarray(111, 997)), 'base64'), Buffer.from(bytes.subarray(111, 997)));
  assert.throws(() => reportBytesToBase64(new Uint8Array()), /size/);
  assert.throws(() => reportBytesToBase64(new Uint8Array(32 * 1024 * 1024 + 1)), /size/);
});
