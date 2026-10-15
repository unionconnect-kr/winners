import test from 'node:test';
import assert from 'node:assert/strict';
import { localApiConfig } from '../security/deletion-api-rehearsal.mjs';

const fixture = { API_URL: 'http://127.0.0.1:54321', ANON_KEY: 'synthetic-key-not-for-use'.repeat(2), SERVICE_ROLE_KEY: 'synthetic-key-not-for-use'.repeat(2) };
test('API rehearsal accepts only the explicit disposable local target', () => {
  assert.equal(localApiConfig(fixture, 'disposable-local-only'), fixture);
  for (const API_URL of ['https://bhwuuxcrzxespkjlmqxr.supabase.co', 'https://obpkzecgswnfuyhwvncd.supabase.co', 'http://127.0.0.1:54321@external.example', 'http://127.0.0.1:54321/redirect', 'http://localhost:54321']) {
    assert.throws(() => localApiConfig({ ...fixture, API_URL }, 'disposable-local-only'));
  }
  assert.throws(() => localApiConfig(fixture, undefined));
  assert.throws(() => localApiConfig({ ...fixture, SERVICE_ROLE_KEY: '' }, 'disposable-local-only'));
});
