import test from 'node:test';
import assert from 'node:assert/strict';
import {binding,verifiedRecord} from '../supabase/functions/manee-android-billing/google-play.mjs';
import {createPurchaseVerifier} from '../supabase/functions/manee-android-billing/purchase.mjs';
const userId='11111111-1111-4111-8111-111111111111',storeId='22222222-2222-4222-8222-222222222222';
const ids=binding(userId,storeId);
const purchase={testPurchase:{},subscriptionState:'SUBSCRIPTION_STATE_ACTIVE',acknowledgementState:'ACKNOWLEDGEMENT_STATE_PENDING',externalAccountIdentifiers:{obfuscatedExternalAccountId:ids.accountId,obfuscatedExternalProfileId:ids.profileId},lineItems:[{productId:'manee.store1.monthly',offerDetails:{basePlanId:'monthly'},autoRenewingPlan:{},expiryTime:new Date(Date.now()+86400000).toISOString()}]};
function setup({save=true,production=false,revoke=false,allowEnvironment,resource=purchase}={}){const calls=[];let checks=0;
 const r=structuredClone(resource);if(production)delete r.testPurchase;
 return {calls,verify:createPurchaseVerifier({api:{get:async()=>{calls.push('google');return r;},acknowledge:async()=>calls.push('ack')},service:{rpc:async(name,args)=>{calls.push('save');assert.equal(name,'manee_android_billing_save');assert.equal(args.p_user_id,userId);assert.equal(args.p_store_id,storeId);return {data:save};}},authorize:async()=>{calls.push('owner');if(revoke&&++checks===2)throw Error('owner_access_denied');},allowEnvironment})};
}
const input={userId,storeId,purchaseToken:'test-token'};
test('sandbox receipt persists before acknowledgement and never activates production',async()=>{const s=setup();const r=await s.verify(input);assert.equal(r.active,false);assert.equal(r.testActive,true);assert.deepEqual(s.calls,['owner','google','owner','save','ack','owner']);});
test('database failure, stale token and revoked owner never acknowledge',async()=>{for(const option of [{save:false},{revoke:true}]){const s=setup(option);await assert.rejects(s.verify(input));assert.equal(s.calls.includes('ack'),false);}});
test('production purchases remain closed pending full entitlement integration',async()=>{const s=setup({production:true});await assert.rejects(s.verify(input),/billing_not_ready/);assert.equal(s.calls.includes('save'),false);assert.equal(s.calls.includes('ack'),false);});
test('an explicitly enabled production environment saves before acknowledgement',async()=>{
 const s=setup({production:true,allowEnvironment:environment=>environment==='Production'});
 const r=await s.verify(input);
 assert.equal(r.active,true);assert.equal(r.testActive,false);
 assert.deepEqual(s.calls,['owner','google','owner','save','ack','owner']);
});
test('a production-only verifier rejects sandbox receipts without saving or acknowledging',async()=>{
 const s=setup({allowEnvironment:environment=>environment==='Production'});
 await assert.rejects(s.verify(input),/billing_not_ready/);
 assert.equal(s.calls.includes('save'),false);assert.equal(s.calls.includes('ack'),false);
});

test('receipt rejection reasons are fixed categories and never contain receipt or identity values',async()=>{
 const cases=[
  ['account_binding_mismatch',r=>{r.externalAccountIdentifiers.obfuscatedExternalAccountId='upstream-private-account';}],
  ['profile_binding_mismatch',r=>{r.externalAccountIdentifiers.obfuscatedExternalProfileId='upstream-private-profile';}],
  ['subscription_shape_mismatch',r=>{r.subscriptionState='upstream-private-state';}],
  ['subscription_shape_mismatch',r=>{r.lineItems=null;}],
  ['subscription_shape_mismatch',r=>{r.lineItems=[];}],
  ['subscription_shape_mismatch',r=>{r.lineItems.push(structuredClone(r.lineItems[0]));}],
  ['product_plan_mismatch',r=>{r.lineItems[0].productId='upstream-private-product';}],
  ['product_plan_mismatch',r=>{r.lineItems[0].offerDetails.basePlanId='upstream-private-plan';}],
  ['product_plan_mismatch',r=>{delete r.lineItems[0].autoRenewingPlan;}],
  ['subscription_expiry_invalid',r=>{r.lineItems[0].expiryTime='upstream-private-expiry';}],
  ['acknowledgement_state_invalid',r=>{r.acknowledgementState='upstream-private-acknowledgement';}],
  ['linked_token_invalid',r=>{r.linkedPurchaseToken='upstream-private-token\n';}],
  ['linked_token_invalid',r=>{r.linkedPurchaseToken=input.purchaseToken;}],
 ];
 for(const [reason,change] of cases){
  const r=structuredClone(purchase);change(r);
  r.billingReason='untrusted-upstream-reason';
  const s=setup({resource:r});
  await assert.rejects(s.verify(input),error=>{
   assert.equal(error.message,'purchase_mismatch');
   assert.equal(error.billingReason,reason);
   assert.deepEqual(Object.keys(error),['billingReason']);
   assert.deepEqual(JSON.parse(JSON.stringify(error)),{billingReason:reason});
   const diagnostic=error.stack+JSON.stringify(error);
   for(const sensitive of [input.purchaseToken,userId,storeId,ids.accountId,ids.profileId,'upstream-private','untrusted-upstream-reason'])
    assert.equal(diagnostic.includes(sensitive),false);
   return true;
  });
  assert.deepEqual(s.calls,['owner','google'],'rejected receipts must never persist or acknowledge');
 }
});

test('binding and input rejection order remains safe for null and missing Google data',()=>{
 const context={...ids,...input,productId:'manee.store1.monthly',basePlanId:'monthly'};
 const reject=(resource,changes,reason)=>assert.throws(()=>verifiedRecord(resource,{...context,...changes}),error=>{
  assert.equal(error.message,'purchase_mismatch');assert.equal(error.billingReason,reason);return true;
 });
 reject(null,{},'account_binding_mismatch');
 reject({}, {},'account_binding_mismatch');
 reject({...purchase,externalAccountIdentifiers:null},{},'account_binding_mismatch');
 reject({...purchase,externalAccountIdentifiers:{obfuscatedExternalAccountId:ids.accountId}},{},'profile_binding_mismatch');
 // Both identifier formats were checked before comparing the returned binding.
 reject(null,{profileId:'invalid'},'profile_binding_mismatch');
 reject(null,{accountId:'invalid',profileId:'invalid'},'account_binding_mismatch');
 assert.throws(()=>verifiedRecord(null,{...context,purchaseToken:'invalid token'}),error=>{
  assert.equal(error.message,'invalid_request');assert.equal(error.billingReason,undefined);return true;
 });
});

const diagnosticNow=Date.parse('2026-11-06T00:00:00Z');
function mismatchFacts(resource,now=diagnosticNow){
 let failure;
 assert.throws(()=>verifiedRecord(resource,{...ids,...input,accountId:'invalid',productId:'manee.store1.monthly',basePlanId:'monthly'},now),error=>{
  failure=error;return error.message==='purchase_mismatch'&&error.billingReason==='account_binding_mismatch';
 });
 const descriptor=Object.getOwnPropertyDescriptor(failure,'receiptFacts');
 assert.deepEqual({enumerable:descriptor.enumerable,writable:descriptor.writable,configurable:descriptor.configurable},
  {enumerable:false,writable:false,configurable:false});
 assert.equal(Object.isFrozen(failure.receiptFacts),true);
 assert.deepEqual(Object.keys(failure),['billingReason']);
 assert.equal(JSON.stringify(failure),'{"billingReason":"account_binding_mismatch"}');
 return failure.receiptFacts;
}
test('mismatch facts classify receipt presence, environment, state and expiry using server time',()=>{
 const resource=structuredClone(purchase);resource.lineItems[0].expiryTime='2026-11-07T00:00:00Z';
 assert.deepEqual(mismatchFacts(resource),{accountBinding:'present',profileBinding:'present',environment:'Sandbox',
  state:'SUBSCRIPTION_STATE_ACTIVE',expiry:'future',outOfAppResubscription:'absent',orderReference:'unknown'});
 for(const [expiryTime,expected]of [[undefined,'missing'],[null,'missing'],['','missing'],['not-a-date','invalid'],
  [{toString(){throw Error('PRIVATE_COERCION');}},'invalid'],['2026-11-06T00:00:00Z','past'],['2026-11-05T23:59:59Z','past']]){
  resource.lineItems[0].expiryTime=expiryTime;assert.equal(mismatchFacts(resource).expiry,expected);
 }
 for(const state of ['SUBSCRIPTION_STATE_PENDING','SUBSCRIPTION_STATE_ACTIVE','SUBSCRIPTION_STATE_PAUSED',
  'SUBSCRIPTION_STATE_IN_GRACE_PERIOD','SUBSCRIPTION_STATE_ON_HOLD','SUBSCRIPTION_STATE_CANCELED',
  'SUBSCRIPTION_STATE_EXPIRED','SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED']){
  resource.subscriptionState=state;assert.equal(mismatchFacts(resource).state,state);
 }
 assert.deepEqual(mismatchFacts(null),{accountBinding:'missing',profileBinding:'missing',environment:'Production',
  state:'unknown',expiry:'missing',outOfAppResubscription:'absent',orderReference:'unknown'});
 for(const value of [null,undefined,'private-context',{},[]])
  assert.equal(mismatchFacts({outOfAppPurchaseContext:value}).outOfAppResubscription,
   value!==null&&typeof value==='object'?'present':'absent');
 for(const value of [undefined,null,'',42,{}]){
  const facts=mismatchFacts({externalAccountIdentifiers:{obfuscatedExternalAccountId:value,obfuscatedExternalProfileId:value}});
  assert.equal(facts.accountBinding,'missing');assert.equal(facts.profileBinding,'missing');
 }
});
test('Google official GPA order and renewal examples share only a hashed base-order reference',()=>{
 // Official Play Console report example: GPA.1234-1234-1234-12345, ..0, ..1.
 // https://support.google.com/googleplay/android-developer/answer/6135870?hl=en
 const base='GPA.1234-1234-1234-12345',expected='fa4c0a43cbffdc5a';
 for(const suffix of ['','..0','..1','..12345']){
  const resource=structuredClone(purchase);resource.lineItems[0].latestSuccessfulOrderId=base+suffix;
  resource.latestOrderId='GPA.9999-9999-9999-99999';
  assert.equal(mismatchFacts(resource).orderReference,expected,'v2 line item takes precedence');
  delete resource.lineItems[0].latestSuccessfulOrderId;resource.latestOrderId=base+suffix;
  assert.equal(mismatchFacts(resource).orderReference,expected,'legacy fallback has the same family');
 }
 for(const invalid of [null,{},123,base+'..',base+'..-1',base+'..1\n',' '+base,base+'secret',
  'GPA.1234-1234-1234-1234','GPA.1234-1234-1234-123456',base+'..'+'1'.repeat(200)]){
  assert.equal(mismatchFacts({lineItems:[{latestSuccessfulOrderId:invalid}]}).orderReference,'unknown');
 }
 const facts=mismatchFacts({...purchase,latestOrderId:base});
 for(const raw of [base,input.purchaseToken,userId,storeId,ids.accountId,ids.profileId])
  assert.equal(JSON.stringify(facts).includes(raw),false);
});
test('diagnostic receipt getters are read once and cannot coerce objects or change rejection',()=>{
 const counts={};const once=(key,value)=>({get(){counts[key]=(counts[key]??0)+1;return counts[key]===1?value:'PRIVATE_SECOND_READ';}});
 const identifiers={};Object.defineProperties(identifiers,{
  obfuscatedExternalAccountId:once('account','PRIVATE_ACCOUNT'),obfuscatedExternalProfileId:once('profile','PRIVATE_PROFILE')});
 const line={};Object.defineProperties(line,{expiryTime:once('expiry','2026-11-07T00:00:00Z'),
  latestSuccessfulOrderId:once('order','GPA.1234-1234-1234-12345..0')});
 const resource={};Object.defineProperties(resource,{externalAccountIdentifiers:once('identifiers',identifiers),
  lineItems:once('lines',[line]),subscriptionState:once('state','SUBSCRIPTION_STATE_ACTIVE')});
 const facts=mismatchFacts(resource);
 assert.deepEqual(counts,{identifiers:1,lines:1,account:1,profile:1,state:1,expiry:1,order:1});
 assert.equal(facts.orderReference,'fa4c0a43cbffdc5a');assert.doesNotMatch(JSON.stringify(facts),/PRIVATE_/);
 const revoked=Proxy.revocable([],{});revoked.revoke();
 assert.equal(mismatchFacts({lineItems:revoked.proxy}).expiry,'missing');
 const hostile=new Proxy({},{get(){throw Error('PRIVATE_RECEIPT');},getOwnPropertyDescriptor(){throw Error('PRIVATE_RECEIPT');}});
 assert.equal(mismatchFacts(hostile).orderReference,'unknown');
});
