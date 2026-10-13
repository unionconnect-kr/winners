import { createPrivateKey, sign } from 'node:crypto';
import { Buffer } from 'node:buffer';
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
  return async function send(token, storeId, event) {
    if (!/^[A-Za-z0-9_:\-]{20,4096}$/.test(token || '')) throw Error('invalid_device');
    const messages = {
      attendance_in: ['매니 · 출근', '새 출근 기록이 있어요. 앱에서 확인해 주세요.'],
      attendance_out: ['매니 · 퇴근', '새 퇴근 기록이 있어요. 앱에서 확인해 주세요.'],
      reservation_created: ['매니 · 예약 등록', '새 예약이 등록됐어요. 앱에서 확인해 주세요.'],
      reservation_cancelled: ['매니 · 예약 취소', '예약이 취소됐어요. 앱에서 확인해 주세요.'],
      reservation_due: ['매니 · 예약시간 안내', '예약 손님이 오실 시간이에요. 예약 내용을 확인해 주세요.'],
      reservation_upcoming: ['매니 · 예약 예정', '30분 이내에 예정된 예약이 있어요. 앱에서 확인해 주세요.'],
      report_closed: ['매니 · 월말 보고서', '월말 보고서가 확정됐어요. 앱에서 확인해 주세요.'],
      monthly_costs: ['매니 · 월말 비용 확인', '월말 보고서 비용 확인이 필요해요. 앱에서 확인해 주세요.'],
    };
    if (event && (!Object.hasOwn(messages,event.kind) || !/^[0-9a-f-]{36}$/.test(event.id || '') || !Number.isFinite(event.ttl) || event.ttl<1)) throw Error('invalid_event');
    const [title,body]=event?messages[event.kind]:['매니 테스트','안드로이드 알림이 연결됐어요.'];
    const access = await accessToken();
    const response = await fetcher(`https://fcm.googleapis.com/v1/projects/${credentials.project}/messages:send`, {
      method: 'POST', headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(8000),
      body: JSON.stringify({ message: { token, notification: { title, body },
        data: { storeId, kind: event?.kind || 'test', ...(event?{eventId:event.id}:{}),
          ...(/^\d{4}-(0[1-9]|1[0-2])$/.test(event?.monthKey||'')?{monthKey:event.monthKey}:{}),
          ...(/^\d{4}-\d{2}-\d{2}$/.test(event?.eventDate||'')?{eventDate:event.eventDate}:{}) }, android: { priority: 'high', ttl: event?`${Math.min(7200,Math.floor(event.ttl))}s`:'60s', restricted_package_name: 'kr.co.manee.app.staging',
          notification: { channel_id: 'manee_store', icon: 'ic_notification', sound: 'default', visibility: 'PRIVATE', ...(event?{tag:event.id}:{}) } } } }),
    });
    const result = await response.json();
    if (response.status === 401) cached = null;
    return { sent: response.ok && typeof result.name === 'string', expired: result.error?.details?.some(d =>
      d['@type'] === 'type.googleapis.com/google.firebase.fcm.v1.FcmError' && d.errorCode === 'UNREGISTERED') === true };
  };
}
