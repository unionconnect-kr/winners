import {createPurchaseVerifier} from './purchase.mjs';
import {binding} from './google-play.mjs';
const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
export const PRODUCT = 'manee.store1.monthly';
export const BASE_PLAN = 'monthly';
const ACTIONS = new Set(['status','prepare','verify','release']);
const DIAGNOSTIC_STAGES = new Set(['request','authentication','authorization','checkout_release',
  'eligibility','allocation','verify_product_lookup','verify_allocation','verify_receipt',
  'checkout_gate','snapshot','catalog','authorization_recheck','checkout_claim']);
const DIAGNOSTIC_ERRORS = new Set(['origin_denied','method_not_allowed','authentication_required',
  'invalid_request','owner_access_denied','billing_unavailable','additional_store_not_ready',
  'billing_not_ready','billing_allocation_unavailable','billing_allocation_invalid',
  'purchase_mismatch','billing_status_unavailable','subscription_unavailable','save_failed',
  'checkout_in_progress']);
const DIAGNOSTIC_REASONS = new Set(['account_binding_mismatch','profile_binding_mismatch',
  'subscription_shape_mismatch','product_plan_mismatch','subscription_expiry_invalid',
  'acknowledgement_state_invalid','linked_token_invalid']);
const RECEIPT_STATES = new Set(['unknown','SUBSCRIPTION_STATE_PENDING','SUBSCRIPTION_STATE_ACTIVE',
  'SUBSCRIPTION_STATE_PAUSED','SUBSCRIPTION_STATE_IN_GRACE_PERIOD','SUBSCRIPTION_STATE_ON_HOLD',
  'SUBSCRIPTION_STATE_CANCELED','SUBSCRIPTION_STATE_EXPIRED','SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED']);
function diagnosticError(cause) {
  try {
    const code = typeof cause === 'string' ? cause : cause?.message;
    return DIAGNOSTIC_ERRORS.has(code) ? code : 'unexpected';
  } catch { return 'unexpected'; }
}
function diagnosticReason(cause) {
  try {
    const reason=cause?.billingReason;
    return DIAGNOSTIC_REASONS.has(reason) ? reason : 'unknown';
  }
  catch { return 'unknown'; }
}
function diagnosticReceiptFacts(cause) {
  try {
    // Snapshot each untrusted property once. Copy literal primitives only;
    // never pass through the provider/error object, getters or extra fields.
    const facts=cause?.receiptFacts;
    if(!facts || typeof facts!=='object')return null;
    const {accountBinding,profileBinding,environment,state,expiry,outOfAppResubscription,orderReference}=facts;
    if(!['missing','present'].includes(accountBinding)||!['missing','present'].includes(profileBinding)||
      !['Sandbox','Production'].includes(environment)||!RECEIPT_STATES.has(state)||
      !['past','future','missing','invalid'].includes(expiry)||!['present','absent'].includes(outOfAppResubscription)||
      typeof orderReference!=='string'||!(orderReference==='unknown'||
        (orderReference.length===16&&/^[a-f0-9]{16}$/.test(orderReference))))return null;
    return Object.freeze({accountBinding,profileBinding,environment,state,expiry,outOfAppResubscription,orderReference});
  } catch { return null; }
}
// Environment-specific eligibility is checked again after the Google lookup.
// Production eligibility defaults to false, independent of sandbox access.
export function createHandler({client, api, service=null, testAccess=async()=>false,
  productionAccess=async()=>false, diagnostic=()=>{}}) {
  return async req => {
    let action='unknown', stage='request', receiptDiagnosticsAllowed=false;
    const origin = req.headers.get('origin');
    const allowed = !origin || origin === 'https://localhost';
    const reply = (status, data, cause=data?.error, receiptFacts=null) => {
      if(status>=400 && typeof diagnostic==='function') {
        // Only literal enum values leave this handler. Never pass the request,
        // identity, receipt, provider/DB error object, message or stack to logs.
        const error=diagnosticError(cause);
        const event=Object.freeze({action:ACTIONS.has(action)?action:'unknown',
          stage:DIAGNOSTIC_STAGES.has(stage)?stage:'request',status,error,
          reason:diagnosticReason(cause),
          ...(receiptDiagnosticsAllowed && action==='verify' && error==='purchase_mismatch' && receiptFacts?{receiptFacts}:{})});
        try { Promise.resolve(diagnostic(event)).catch(()=>{}); } catch { /* Diagnostics cannot alter billing. */ }
      }
      return new Response(JSON.stringify(data), {status, headers: {
      'Content-Type':'application/json', 'Cache-Control':'no-store', 'Vary':'Origin',
      ...(allowed && origin ? {'Access-Control-Allow-Origin':origin,
        'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info',
        'Access-Control-Allow-Methods':'POST,OPTIONS'} : {}),
      }});
    };
    if (!allowed) return reply(403, {error:'origin_denied'});
    if (req.method === 'OPTIONS') return reply(200, {});
    if (req.method !== 'POST') return reply(405, {error:'method_not_allowed'});
    try {
      stage='authentication';
      const bearer = req.headers.get('authorization');
      if (!/^Bearer [A-Za-z0-9._-]+$/.test(bearer || '')) return reply(401, {error:'authentication_required'});
      stage='request';
      const raw = await req.text();
      let body;
      try { if(raw.length > 8192) throw Error(); body = JSON.parse(raw); }
      catch { return reply(400, {error:'invalid_request'}); }
      if(body && ACTIONS.has(body.action))action=body.action;
      if (!body || !ACTIONS.has(body.action) || !UUID.test(body.storeId || '') ||
        (body.action==='release' && !UUID.test(body.checkoutId || '')))
        return reply(400, {error:'invalid_request'});
      stage='authentication';
      const user = client(bearer);
      const auth = await user.auth.getUser(bearer.slice(7));
      if (auth.error || !auth.data?.user) return reply(401, {error:'authentication_required'});
      // Existing RPC checks the live session, current owner membership, account
      // ban and archived store. Despite its historical name, it has no writes.
      const authorize = () => user.rpc('manee_android_push_context', {p_store_id:body.storeId});
      stage='authorization';
      const context = await authorize();
      if(context.error || context.data !== true) return reply(403, {error:'owner_access_denied'});
      if(body.action==='release'){
        stage='checkout_release';
        const released=await user.rpc('manee_android_billing_checkout_release',{
          p_store_id:body.storeId,p_checkout_id:body.checkoutId});
        if(released.error || typeof released.data!=='boolean')return reply(503,{error:'billing_unavailable'});
        return reply(200,{released:released.data});
      }
      const permitted=async environment=>await (environment==='Production'?productionAccess:testAccess)(
        {user,userId:auth.data.user.id,storeId:body.storeId})===true;
      stage='eligibility';
      const sandboxEligible=!!api && !!service && await permitted('Sandbox');
      const paidEligible=!!api && !!service && await permitted('Production');
      receiptDiagnosticsAllowed=sandboxEligible;
      const eligible=sandboxEligible||paidEligible;
      let productId=PRODUCT, billingStoreId=body.storeId, accountContext={};
      if(eligible){
        stage='allocation';
        const allocation=await user.rpc('manee_android_account_context',{p_store_id:body.storeId});
        if(allocation.error || !allocation.data || typeof allocation.data!=='object')throw Error('billing_allocation_unavailable');
        accountContext=allocation.data;productId=accountContext.productId;billingStoreId=accountContext.billingStoreId;
        if(productId && !UUID.test(billingStoreId||''))throw Error('billing_allocation_invalid');
        if(!productId){
          if(body.action!=='status')return reply(503,{error:'additional_store_not_ready'});
          return reply(200,{ready:false,catalogReady:false,reason:'additional_store_not_ready'});
        }
        if(!/^manee\.store[1-9][0-9]*\.monthly$/.test(productId))throw Error('billing_allocation_invalid');
      }
      if(body.action === 'verify' && eligible) {
        // Resolve the original allocation for legacy additional-store receipts.
        // The Google verifier still checks both immutable obfuscated IDs.
        let restoreProduct=body.productId;
        if(!restoreProduct){stage='verify_product_lookup';const resource=await api.get(body.purchaseToken);restoreProduct=resource?.lineItems?.[0]?.productId;}
        stage='verify_allocation';
        const original=await user.rpc('manee_android_account_context',{p_store_id:body.storeId,p_product_id:restoreProduct});
        if(original.error || !UUID.test(original.data?.billingStoreId||'') || original.data?.productId!==restoreProduct)throw Error('purchase_mismatch');
        const verify=createPurchaseVerifier({api,service,productId:original.data.productId,
          allowEnvironment:environment=>environment==='Sandbox'||environment==='Production',
          authorize:async environment=>{
          const current=await authorize();
          if(current.error || current.data!==true) throw Error('owner_access_denied');
          if(environment && !await permitted(environment)) throw Error('billing_not_ready');
        }});
        stage='verify_receipt';
        return reply(200, await verify({userId:auth.data.user.id,storeId:original.data.billingStoreId,purchaseToken:body.purchaseToken}));
      }
      stage='checkout_gate';
      if(body.action !== 'status' && !(body.action==='prepare' && eligible)) return reply(503, {error:'billing_not_ready'});
      // Use the caller's JWT, never service-role access, for the store snapshot.
      // The RPC checks live ownership and strips receipt tokens at the database.
      stage='snapshot';
      const snapshot=await user.rpc('manee_android_billing_status',{p_store_id:body.storeId});
      if(snapshot.error || !Array.isArray(snapshot.data?.subscriptions)) throw Error('billing_status_unavailable');
      const subscriptions=snapshot.data.subscriptions;
      const entitlement={active:accountContext.otherPlatformActive===true||subscriptions.some(s=>s.environment==='Production'&&s.active===true),
        testActive:subscriptions.some(s=>s.environment==='Sandbox'&&s.testActive===true)};
      if(!api) return reply(200, {ready:false, catalogReady:false,...entitlement});
      stage='catalog';
      const product = await api.product(productId);
      const plan = product?.basePlans?.find(p => p.basePlanId === BASE_PLAN);
      const krPlan=plan?.regionalConfigs?.find(r=>r.regionCode==='KR' && r.newSubscriberAvailability===true);
      const catalogReady = product?.packageName === 'kr.co.manee.app' && product.productId === productId &&
        plan?.state === 'ACTIVE' && plan.autoRenewingBasePlanType?.billingPeriodDuration === 'P1M' &&
        !!krPlan;
      // Play's regional base-plan Money is the authoritative paid price.
      const paidPriceReady=krPlan?.price?.currencyCode==='KRW' &&
        String(krPlan.price.units)==='9900' && (krPlan.price.nanos??0)===0;
      stage='authorization_recheck';
      const recheck = await authorize();
      if(recheck.error || recheck.data !== true) return reply(403, {error:'owner_access_denied'});
      const readySandbox=eligible && !!catalogReady && await permitted('Sandbox');
      const readyPaid=eligible && !!catalogReady && paidPriceReady && await permitted('Production');
      const ready=readySandbox||readyPaid;
      stage='checkout_gate';
      if(body.action==='prepare' && !ready)return reply(503,{error:'billing_not_ready'});
      let checkout={};
      if(body.action==='prepare' && readyPaid && !readySandbox && !entitlement.active){
        stage='checkout_claim';
        if(!UUID.test(body.checkoutId || ''))return reply(400,{error:'invalid_request'});
        const claim=await user.rpc('manee_android_billing_checkout_claim',{
          p_store_id:body.storeId,p_product_id:productId,p_checkout_id:body.checkoutId});
        if(claim.error || !['claimed','in_progress','active'].includes(claim.data?.status))
          return reply(503,{error:'billing_unavailable'});
        if(claim.data.status==='in_progress')return reply(409,{error:'checkout_in_progress'});
        checkout=claim.data.status==='active'?{active:true}:{checkoutId:body.checkoutId};
      }
      return reply(200, {ready, catalogReady:!!catalogReady, productId, basePlanId:BASE_PLAN,...entitlement,
        ...(eligible?{billingScope:'account',restoreProductIds:accountContext.restoreProductIds,otherPlatformActive:accountContext.otherPlatformActive===true}:{}),
        ...checkout,...(ready?{testOnly:readySandbox,...(body.action==='prepare'?binding(auth.data.user.id,billingStoreId):{})}:{})});
    } catch (cause) {
      // Read untrusted fields once so response classification and diagnostics
      // use the same fixed categories, without retaining receipt/binding data.
      const failure={message:diagnosticError(cause),billingReason:diagnosticReason(cause)};
      const receiptFacts=receiptDiagnosticsAllowed && action==='verify' && failure.message==='purchase_mismatch'
        ? diagnosticReceiptFacts(cause) : null;
      const bindingMismatch=action==='verify' && failure.message==='purchase_mismatch' &&
        (failure.billingReason==='account_binding_mismatch' || failure.billingReason==='profile_binding_mismatch');
      return bindingMismatch
        ? reply(422, {error:'purchase_binding_mismatch'},failure,receiptFacts)
        : reply(503, {error:'billing_unavailable'},failure,receiptFacts);
    }
  };
}
