import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, verify } from 'node:crypto';
import { makeToken, checkConnection } from './check-apple-connection.mjs';

const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const env = { ASC_KEY_ID: 'TESTKEY123', ASC_ISSUER_ID: '00000000-0000-0000-0000-000000000001',
  ASC_PRIVATE_KEY: privateKey.export({ type: 'pkcs8', format: 'pem' }) };

test('token uses verifiable ES256 and short expiry', () => {
  const [header, payload, signature] = makeToken(env, 1000).split('.');
  const claims = JSON.parse(Buffer.from(payload, 'base64url'));
  assert.equal(claims.aud, 'appstoreconnect-v1');
  assert.equal(claims.exp - claims.iat, 125);
  assert.ok(verify('sha256', Buffer.from(`${header}.${payload}`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(signature, 'base64url')));
  assert.throws(() => makeToken({}), /MISSING_ASC_KEY_ID/);
  assert.throws(() => makeToken({ ...env, ASC_PRIVATE_KEY: 'not-a-key' }), /^Error: INVALID_ASC_PRIVATE_KEY_PEM$/);
});

test('checks only Apple GET endpoints and reports no secrets or certificate contents', async () => {
  const paths = [];
  const result = await checkConnection(env, async (url, options) => {
    assert.equal(new URL(url).origin, 'https://api.appstoreconnect.apple.com');
    assert.equal(options.method, 'GET');
    assert.equal(options.redirect, 'error');
    paths.push(url);
    return { ok: true, status: 200, json: async () => url.includes('/apps/') ?
      { data: { id: '6820833544', attributes: { bundleId: 'kr.co.manee.app' } } } :
      { data: [{ attributes: { expirationDate: '2099-01-01', certificateContent: 'DO_NOT_LOG' } }] } };
  });
  assert.equal(paths.length, 2);
  assert.equal(result.validDistributionCertificates, 1);
  assert.equal(result.uploaded, false);
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE KEY|DO_NOT_LOG|Bearer/);
});

test('wrong credentials and wrong app identity fail without server text', async () => {
  await assert.rejects(checkConnection(env, async () => ({ ok: false, status: 401 })), /^Error: APPLE_APP_HTTP_401$/);
  await assert.rejects(checkConnection(env, async () => ({ ok: true, status: 200, json: async () => ({ data: { id: 'wrong' } }) })), /APPLE_APP_IDENTITY_MISMATCH/);
});
