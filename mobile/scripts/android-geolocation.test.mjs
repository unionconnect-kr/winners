import test from 'node:test';
import assert from 'node:assert/strict';
import { createAndroidGeolocation } from '../src/android-geolocation.js';

const position = (coords = {}) => ({ timestamp: Date.now(), coords: { latitude: 37.5, longitude: 127, accuracy: 12, ...coords } });
async function locate({ permission = 'granted', value = position(), error, permissionError } = {}) {
  const calls = [], successes = [], failures = [];
  const bridge = createAndroidGeolocation({
    async getCurrentPosition(options) { calls.push(options); if (error) throw error; return value; },
    async checkPermissions() { if (permissionError) throw permissionError; return { location: permission, coarseLocation: 'granted' }; },
  });
  await bridge.getCurrentPosition(p => successes.push(p), e => failures.push(e), { timeout: 15000, maximumAge: 60000, enableHighAccuracy: false });
  return { calls, successes, failures };
}
test('precise, valid native position reaches the caller with a fresh high-accuracy request', async () => {
  const r = await locate();
  assert.equal(r.successes.length, 1); assert.equal(r.failures.length, 0);
  assert.deepEqual(r.calls, [{ timeout: 15000, maximumAge: 0, enableHighAccuracy: true }]);
});
test('approximate-only permission is rejected even when its returned point looks accurate', async () => {
  for (const permission of ['denied', 'prompt', 'prompt-with-rationale', null]) {
    const r = await locate({ permission, value: position({ accuracy: 5 }) });
    assert.equal(r.successes.length, 0); assert.equal(r.failures.length, 1);
    assert.equal(r.failures[0].code, 1); assert.equal(r.failures[0].reason, 'precise-location-required');
  }
});
test('imprecise or invalid coordinates cannot be used for attendance or store registration', async () => {
  for (const coords of [{ accuracy: 101 }, { accuracy: 2500 }, { accuracy: NaN }, { accuracy: undefined }, { accuracy: 0 }, { accuracy: -5 }, { latitude: 91 }, { longitude: -181 }, { latitude: '37.5' }, { longitude: Infinity }]) {
    const r = await locate({ value: position(coords) });
    assert.equal(r.successes.length, 0); assert.equal(r.failures[0].reason, 'position-inaccurate');
  }
  assert.equal((await locate({ value: position({ accuracy: 100 }) })).successes.length, 1);
  assert.equal((await locate({ value: null })).successes.length, 0);
});
test('permission denial, GPS-off, timeout and permission recheck failures never report success', async () => {
  for (const [nativeCode, expected] of [['OS-PLUG-GLOC-0003', 1], ['OS-PLUG-GLOC-0007', 2], ['OS-PLUG-GLOC-0010', 3], ['unknown', 2]]) {
    const r = await locate({ error: { code: nativeCode } });
    assert.equal(r.successes.length, 0); assert.equal(r.failures[0].code, expected);
  }
  const r = await locate({ permissionError: { code: 'OS-PLUG-GLOC-0007' } });
  assert.equal(r.successes.length, 0); assert.equal(r.failures[0].code, 2);
});
