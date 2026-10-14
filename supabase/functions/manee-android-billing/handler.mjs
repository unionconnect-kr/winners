import {createPurchaseVerifier} from './purchase.mjs';
import {binding} from './google-play.mjs';
const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
export const PRODUCT = 'manee.store1.monthly';
export const BASE_PLAN = 'monthly';
// Environment-specific eligibility is checked again after the Google lookup.
// Production eligibility defaults to false, independent of sandbox access.
export function createHandler({client, api, service=null, testAccess=async()=>false,
  productionAccess=async()=>false}) {
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
      try { if(raw.length > 8192) throw Error(); body = JSON.parse(raw); }
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
      const permitted=async environment=>await (environment==='Production'?productionAccess:testAccess)(
        {user,userId:auth.data.user.id,storeId:body.storeId})===true;
      const sandboxEligible=!!api && !!service && await permitted('Sandbox');
      const paidEligible=!!api && !!service && await permitted('Production');
      const eligible=sandboxEligible||paidEligible;
      let productId=PRODUCT;
      if(eligible){
        const allocation=await user.rpc('manee_android_billing_product',{p_store_id:body.storeId});
        if(allocation.error)throw Error('billing_allocation_unavailable');
        productId=allocation.data;
        if(!productId){
          if(body.action!=='status')return reply(503,{error:'additional_store_not_ready'});
          return reply(200,{ready:false,catalogReady:false,reason:'additional_store_not_ready'});
        }
        if(!/^manee\.store[1-9][0-9]*\.monthly$/.test(productId))throw Error('billing_allocation_invalid');
      }
      if(body.action === 'verify' && eligible) {
        const verify=createPurchaseVerifier({api,service,productId,
          allowEnvironment:environment=>environment==='Sandbox'||environment==='Production',
          authorize:async environment=>{
          const current=await authorize();
          if(current.error || current.data!==true) throw Error('owner_access_denied');
          if(environment && !await permitted(environment)) throw Error('billing_not_ready');
        }});
        return reply(200, await verify({userId:auth.data.user.id,storeId:body.storeId,purchaseToken:body.purchaseToken}));
      }
      if(body.action !== 'status' && !(body.action==='prepare' && eligible)) return reply(503, {error:'billing_not_ready'});
      // Use the caller's JWT, never service-role access, for the store snapshot.
      // The RPC checks live ownership and strips receipt tokens at the database.
      const snapshot=await user.rpc('manee_android_billing_status',{p_store_id:body.storeId});
      if(snapshot.error || !Array.isArray(snapshot.data?.subscriptions)) throw Error('billing_status_unavailable');
      const subscriptions=snapshot.data.subscriptions;
      const entitlement={active:subscriptions.some(s=>s.environment==='Production'&&s.active===true),
        testActive:subscriptions.some(s=>s.environment==='Sandbox'&&s.testActive===true)};
      if(!api) return reply(200, {ready:false, catalogReady:false,...entitlement});
      const product = await api.product(productId);
      const plan = product?.basePlans?.find(p => p.basePlanId === BASE_PLAN);
      const catalogReady = product?.packageName === 'kr.co.manee.app' && product.productId === productId &&
        plan?.state === 'ACTIVE' && plan.autoRenewingBasePlanType?.billingPeriodDuration === 'P1M' &&
        plan.regionalConfigs?.some(r => r.regionCode === 'KR' && r.newSubscriberAvailability === true) === true;
      const recheck = await authorize();
      if(recheck.error || recheck.data !== true) return reply(403, {error:'owner_access_denied'});
      const readySandbox=eligible && !!catalogReady && await permitted('Sandbox');
      const readyPaid=eligible && !!catalogReady && await permitted('Production');
      const ready=readySandbox||readyPaid;
      if(body.action==='prepare' && !ready)return reply(503,{error:'billing_not_ready'});
      return reply(200, {ready, catalogReady:!!catalogReady, productId, basePlanId:BASE_PLAN,...entitlement,
        ...(ready?{testOnly:readySandbox,...(body.action==='prepare'?binding(auth.data.user.id,body.storeId):{})}:{})});
    } catch { return reply(503, {error:'billing_unavailable'}); }
  };
}
