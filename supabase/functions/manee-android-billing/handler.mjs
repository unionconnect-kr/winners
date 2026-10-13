const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
export const PRODUCT = 'manee.store1.monthly';
export const BASE_PLAN = 'monthly';
// Status is a real app endpoint, but checkout stays closed until durable purchase
// storage, renewal processing and multi-store allocation are implemented.
export function createHandler({client, api}) {
  return async req => {
    const origin = req.headers.get('origin');
    const allowed = !origin || origin === 'https://localhost';
    const reply = (status, data) => new Response(JSON.stringify(data), {status, headers: {
      'Content-Type':'application/json', 'Cache-Control':'no-store', 'Vary':'Origin',
      ...(allowed && origin ? {'Access-Control-Allow-Origin':origin,
        'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info',
        'Access-Control-Allow-Methods':'POST,OPTIONS'} : {}),
    }});
    if (!allowed) return reply(403, {error:'origin_denied'});
    if (req.method === 'OPTIONS') return reply(200, {});
    if (req.method !== 'POST') return reply(405, {error:'method_not_allowed'});
    try {
      const bearer = req.headers.get('authorization');
      if (!/^Bearer [A-Za-z0-9._-]+$/.test(bearer || '')) return reply(401, {error:'authentication_required'});
      const raw = await req.text();
      let body;
      try { if(raw.length > 2048) throw Error(); body = JSON.parse(raw); }
      catch { return reply(400, {error:'invalid_request'}); }
      if (!body || !['status','prepare','verify'].includes(body.action) || !UUID.test(body.storeId || ''))
        return reply(400, {error:'invalid_request'});
      const user = client(bearer);
      const auth = await user.auth.getUser(bearer.slice(7));
      if (auth.error || !auth.data?.user) return reply(401, {error:'authentication_required'});
      // Existing RPC checks the live session, current owner membership, account
      // ban and archived store. Despite its historical name, it has no writes.
      const authorize = () => user.rpc('manee_android_push_context', {p_store_id:body.storeId});
      const context = await authorize();
      if(context.error || context.data !== true) return reply(403, {error:'owner_access_denied'});
      if(body.action !== 'status') return reply(503, {error:'billing_not_ready'});
      if(!api) return reply(200, {ready:false, catalogReady:false});
      const product = await api.product(PRODUCT);
      const plan = product?.basePlans?.find(p => p.basePlanId === BASE_PLAN);
      const catalogReady = product?.packageName === 'kr.co.manee.app' && product.productId === PRODUCT &&
        plan?.state === 'ACTIVE' && plan.autoRenewingBasePlanType?.billingPeriodDuration === 'P1M' &&
        plan.regionalConfigs?.some(r => r.regionCode === 'KR' && r.newSubscriberAvailability === true) === true;
      const recheck = await authorize();
      if(recheck.error || recheck.data !== true) return reply(403, {error:'owner_access_denied'});
      return reply(200, {ready:false, catalogReady:!!catalogReady, productId:PRODUCT, basePlanId:BASE_PLAN});
    } catch { return reply(503, {error:'billing_unavailable'}); }
  };
}
