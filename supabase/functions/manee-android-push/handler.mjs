const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function createHandler({ client, credentials, send, staging }) {
  return async req => {
    const origin = req.headers.get('origin');
    const allowed = !origin || origin === 'https://localhost';
    const reply = (status, data) => new Response(JSON.stringify(data), { status, headers: {
      'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Vary': 'Origin',
      ...(allowed && origin ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'authorization,apikey,content-type,x-client-info', 'Access-Control-Allow-Methods': 'POST,OPTIONS' } : {}),
    } });
    if (!allowed) return reply(403, { error: 'origin_denied' });
    if (req.method === 'OPTIONS') return reply(200, {});
    if (req.method !== 'POST') return reply(405, { error: 'method_not_allowed' });
    if (!staging) return reply(503, { error: 'staging_only' });
    try {
      const bearer = req.headers.get('authorization');
      if (!/^Bearer [A-Za-z0-9._-]+$/.test(bearer || '')) return reply(401, { error: 'authentication_required' });
      const raw = await req.text();
      if (raw.length > 2048) return reply(400, { error: 'invalid_request' });
      const body = JSON.parse(raw);
      if (!['status', 'test'].includes(body.action) || !UUID.test(body.storeId || '')) return reply(400, { error: 'invalid_request' });
      const user = client(bearer);
      const { data: auth, error } = await user.auth.getUser(bearer.slice(7));
      if (error || !auth?.user) return reply(401, { error: 'authentication_required' });
      const context = await user.rpc('manee_android_push_context', { p_store_id: body.storeId });
      if (context.error || context.data !== true) return reply(403, { error: 'owner_access_denied' });
      const ready = !!credentials && body.projectId === credentials.project;
      if (body.action === 'status' || !ready) return reply(200, { ready, projectId: ready ? credentials.project : null });
      const target = await user.rpc('manee_android_push_test_target', { p_store_id: body.storeId });
      if (target.error || typeof target.data !== 'string') return reply(429, { error: 'test_unavailable' });
      // The recipient is resolved from the authenticated session, never the request.
      const result = await send(target.data, body.storeId);
      if (result.expired) await user.rpc('manee_android_push', { p_store_id: body.storeId, p_token: null, p_enabled: false });
      return reply(result.sent ? 200 : 503, { sent: result.sent });
    } catch { return reply(503, { error: 'push_unavailable' }); }
  };
}
