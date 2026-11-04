import test from 'node:test';
import assert from 'node:assert/strict';
import { createAndroidPush, PUSH_NOT_READY } from '../src/android-push.js';
function harness(options = {}) {
  const calls = [], listeners = new Map(), saved = new Map();
  let c = { userId: 'u1', storeId: 's1', role: 'storeOwner' };
  const storage = { getItem: k => saved.get(k), setItem: (k, v) => saved.set(k, v), removeItem: k => saved.delete(k) };
  c.db = { auth: { getSession: async () => ({ data: { session: { user: { id: c.userId } } } }) },
    functions: { invoke: async (_, args) => { calls.push(['service', args.body.action]); return { data: { ready: options.ready !== false, projectId: 'manee-test', sent: true } }; } },
    rpc: async (_, args) => { calls.push(['rpc', args]); return options.rpc ? options.rpc(args) : { data: true }; } };
  const push = {
    checkPermissions: async () => ({ receive: options.permission || 'prompt' }),
    requestPermissions: async () => { calls.push(['permission']);return { receive: options.granted === false ? 'denied' : 'granted' }; },
    createChannel: async () => {},
    addListener: async (name, fn) => { listeners.set(name, fn);return { remove: async () => listeners.delete(name) }; },
    register: async () => { calls.push(['register']); if (!options.timeout) listeners.get('registration')({ value: 'AbCdEF:0123456789_TestTOKEN' }); },
    unregister: async () => { calls.push(['unregister']); }, removeAllDeliveredNotifications: async () => {},
  };
  const controller = createAndroidPush({ push, getContext: () => c, projectId: options.unconfigured ? null : 'manee-test', storage, timeoutMs: 10 });
  return { controller, calls, saved, listeners, switchUser: () => { c = { ...c, userId: 'u2' }; } };
}
test('unconfigured build and server not-ready never request permission or register', async () => {
  for (const options of [{ unconfigured: true }, { ready: false }]) {
    const h = harness(options);assert.equal((await h.controller.action('enable')).message, PUSH_NOT_READY);
    assert.equal(h.calls.some(c => ['permission', 'register', 'rpc'].includes(c[0])), false);
  }
});
test('registration preserves case and confirms database write before subscribed state', async () => {
  const h = harness();assert.equal((await h.controller.action('enable')).subscribed, true);
  assert.equal(h.calls.find(c => c[0] === 'rpc')[1].p_token, 'AbCdEF:0123456789_TestTOKEN');
  assert.equal(h.listeners.size, 0);assert.equal([...h.saved.values()][0], '1');
  await h.controller.action('disable');assert.equal(h.saved.size, 0);assert.ok(h.calls.some(c => c[0] === 'unregister'));
});
test('refusal, registration timeout and rejected save never report a connected device', async () => {
  const denied = harness({ granted: false });assert.equal((await denied.controller.action('enable')).subscribed, false);assert.equal(denied.calls.some(c => c[0] === 'register'), false);
  for (const options of [{ timeout: true }, { rpc: async () => ({ data: false }) }]) {
    const h = harness(options);await assert.rejects(h.controller.action('enable'));assert.equal(h.saved.size, 0);assert.equal(h.listeners.size, 0);
  }
});
test('refresh without consent does not prompt; saved consent refreshes without prompting', async () => {
  const h = harness({ permission: 'granted' });await h.controller.action('refresh');assert.equal(h.calls.some(c => c[0] === 'register'), false);
  await h.controller.action('enable');await h.controller.action('refresh');assert.equal(h.calls.filter(c => c[0] === 'register').length, 2);assert.equal(h.calls.some(c => c[0] === 'permission'), false);
});
test('logout cleans registered session; repeated enable coalesces; stale save cannot set new account consent', async () => {
  let resolve;const h = harness({ rpc: () => new Promise(r => { resolve = r; }) });
  const task = h.controller.action('enable');assert.equal(h.controller.action('enable'), task);
  await new Promise(r => setImmediate(r));h.switchUser();resolve({ data: true });await assert.rejects(task);assert.equal(h.saved.size, 0);
  const h2 = harness();await h2.controller.action('enable');await h2.controller.prepareLogout();assert.equal(h2.saved.size, 0);assert.equal(h2.calls.filter(c => c[0] === 'rpc').at(-1)[1].p_enabled, false);
});
