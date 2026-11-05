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
