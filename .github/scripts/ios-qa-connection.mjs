import { createPrivateKey, sign } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const appId = '6820833544';
const bundleId = 'kr.co.manee.app';
const origin = 'https://api.appstoreconnect.apple.com';

export function makeToken(env, now = Math.floor(Date.now() / 1000)) {
  for (const name of ['ASC_KEY_ID', 'ASC_ISSUER_ID', 'ASC_PRIVATE_KEY']) {
    if (!env[name]?.trim()) throw new Error(`MISSING_${name}`);
  }
  const kid = env.ASC_KEY_ID.trim();
  const issuer = env.ASC_ISSUER_ID.trim();
  if (!/^[A-Z0-9]{10}$/.test(kid)) throw new Error('INVALID_ASC_KEY_ID');
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(issuer)) throw new Error('INVALID_ASC_ISSUER_ID');
  let key;
  try {
    key = createPrivateKey(env.ASC_PRIVATE_KEY.trim());
    if (key.asymmetricKeyType !== 'ec' || key.asymmetricKeyDetails?.namedCurve !== 'prime256v1') throw new Error();
  } catch { throw new Error('INVALID_ASC_PRIVATE_KEY_PEM'); }
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const payload = `${encode({ alg: 'ES256', kid, typ: 'JWT' })}.${encode({ iss: issuer, iat: now - 5, exp: now + 120, aud: 'appstoreconnect-v1' })}`;
  const signature = sign('sha256', Buffer.from(payload), { key, dsaEncoding: 'ieee-p1363' });
  return `${payload}.${signature.toString('base64url')}`;
}

export async function checkConnection(env, request = fetch) {
  const token = makeToken(env);
  async function get(path) {
    let response;
    try {
      response = await request(origin + path, {
        method: 'GET', redirect: 'error', signal: AbortSignal.timeout(20000),
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      });
    } catch { throw new Error('APPLE_NETWORK_ERROR'); }
    // Never log response bodies, signed tokens, PEM contents or arbitrary server text.
    if (!response.ok) return { status: response.status };
    try { return { status: response.status, data: await response.json() }; }
    catch { throw new Error('APPLE_INVALID_RESPONSE'); }
  }
  const app = await get(`/v1/apps/${appId}?fields%5Bapps%5D=bundleId`);
  if (app.status !== 200) throw new Error(`APPLE_APP_HTTP_${app.status}`);
  if (app.data?.data?.id !== appId || app.data?.data?.attributes?.bundleId !== bundleId) {
    throw new Error('APPLE_APP_IDENTITY_MISMATCH');
  }
  const certificates = await get('/v1/certificates?filter%5BcertificateType%5D=DISTRIBUTION,IOS_DISTRIBUTION&fields%5Bcertificates%5D=certificateType,expirationDate&limit=200');
  const rows = certificates.data?.data;
  return {
    appAccess: 'verified', appId, bundleId,
    distributionCertificateReadStatus: certificates.status,
    validDistributionCertificates: Array.isArray(rows) ? rows.filter(c => Date.parse(c.attributes?.expirationDate) > Date.now()).length : null,
    signingPrivateKeyAvailable: 'not_checked',
    uploaded: false,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { console.log(JSON.stringify(await checkConnection(process.env), null, 2)); }
  catch (error) {
    // Only our fixed error identifiers can reach logs.
    const safe = /^(MISSING_ASC_[A-Z_]+|INVALID_ASC_[A-Z_]+|APPLE_[A-Z_]+(?:_\d{3})?)$/.test(error.message) ? error.message : 'APPLE_CHECK_FAILED';
    console.error(safe);
    process.exitCode = 1;
  }
}
