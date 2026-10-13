import { createPrivateKey, sign } from 'node:crypto';
export function firebaseCredentials(raw) {
  try {
    const c = JSON.parse(raw || '{}');
    if (c.type !== 'service_account' || !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(c.project_id || '') ||
        !/^[^@\s]+@[^@\s]+\.iam\.gserviceaccount\.com$/.test(c.client_email || '')) return null;
    const key = createPrivateKey(c.private_key);
    if (key.asymmetricKeyType !== 'rsa' || key.asymmetricKeyDetails.modulusLength < 2048) return null;
    return { project: c.project_id, email: c.client_email, key };
  } catch { return null; }
}
export function createFcmSender(credentials, fetcher = fetch) {
  let cached;
  async function accessToken() {
    const now = Math.floor(Date.now() / 1000);
    if (cached && cached.expires > now + 60) return cached.value;
    const b64 = value => Buffer.from(JSON.stringify(value)).toString('base64url');
    const input = b64({ alg: 'RS256', typ: 'JWT' }) + '.' + b64({ iss: credentials.email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 });
    const assertion = input + '.' + sign('RSA-SHA256', Buffer.from(input), credentials.key).toString('base64url');
    const response = await fetcher('https://oauth2.googleapis.com/token', { method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }), signal: AbortSignal.timeout(8000) });
    const result = await response.json();
    if (!response.ok || typeof result.access_token !== 'string' || !Number.isFinite(result.expires_in) || result.expires_in <= 0) throw Error('push_unavailable');
    cached = { value: result.access_token, expires: now + Math.min(result.expires_in, 3600) };
    return cached.value;
  }
  return async function send(token, storeId) {
    if (!/^[A-Za-z0-9_:\-]{20,4096}$/.test(token || '')) throw Error('invalid_device');
    const access = await accessToken();
    const response = await fetcher(`https://fcm.googleapis.com/v1/projects/${credentials.project}/messages:send`, {
      method: 'POST', headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(8000),
      body: JSON.stringify({ message: { token, notification: { title: '매니 테스트', body: '안드로이드 알림이 연결됐어요.' },
        data: { storeId, kind: 'test' }, android: { priority: 'high', ttl: '60s', restricted_package_name: 'kr.co.manee.app.staging',
          notification: { channel_id: 'manee_store', icon: 'ic_notification', sound: 'default', visibility: 'PRIVATE' } } } }),
    });
    const result = await response.json();
    if (response.status === 401) cached = null;
    return { sent: response.ok && typeof result.name === 'string', expired: result.error?.details?.some(d =>
      d['@type'] === 'type.googleapis.com/google.firebase.fcm.v1.FcmError' && d.errorCode === 'UNREGISTERED') === true };
  };
}
