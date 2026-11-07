const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store',
  'Pragma': 'no-cache', 'X-Content-Type-Options': 'nosniff' };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers });

// Naver wraps its subject in response.id. GoTrue expects a top-level sub.
// Return only that stable subject: no email matching, personal data or tokens.
export function createHandler({ fetch: requestNaver = fetch } = {}) {
  return async request => {
    if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405);
    const authorization = request.headers.get('authorization') || '';
    if (!/^Bearer [A-Za-z0-9._~+/=-]{1,4096}$/i.test(authorization)) {
      return json({ error: 'invalid_token' }, 401);
    }
    try {
      const response = await requestNaver('https://openapi.naver.com/v1/nid/me', {
        headers: { Authorization: authorization, Accept: 'application/json' },
        redirect: 'error', signal: AbortSignal.timeout(8000)
      });
      if (response.status === 401 || response.status === 403) return json({ error: 'invalid_token' }, 401);
      if (!response.ok) return json({ error: 'provider_unavailable' }, 502);
      const text = await response.text();
      if (text.length > 65536) return json({ error: 'invalid_provider_response' }, 502);
      const profile = JSON.parse(text);
      const sub = profile?.response?.id;
      if (profile?.resultcode !== '00' || typeof sub !== 'string' || !sub.length ||
          sub.length > 255 || /[\s\u0000-\u001f\u007f]/.test(sub)) {
        return json({ error: 'invalid_provider_response' }, 502);
      }
      return json({ sub });
    } catch {
      // Never echo upstream errors: they may contain tokens or profile details.
      return json({ error: 'provider_unavailable' }, 502);
    }
  };
}

