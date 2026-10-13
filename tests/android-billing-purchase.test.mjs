import test from 'node:test';
import assert from 'node:assert/strict';
import {binding} from '../supabase/functions/manee-android-billing/google-play.mjs';
import {createPurchaseVerifier} from '../supabase/functions/manee-android-billing/purchase.mjs';
const userId='11111111-1111-4111-8111-111111111111',storeId='22222222-2222-4222-8222-222222222222';
const ids=binding(userId,storeId);
const purchase={testPurchase:{},subscriptionState:'SUBSCRIPTION_STATE_ACTIVE',acknowledgementState:'ACKNOWLEDGEMENT_STATE_PENDING',externalAccountIdentifiers:{obfuscatedExternalAccountId:ids.accountId,obfuscatedExternalProfileId:ids.profileId},lineItems:[{productId:'manee.store1.monthly',offerDetails:{basePlanId:'monthly'},autoRenewingPlan:{},expiryTime:new Date(Date.now()+86400000).toISOString()}]};
function setup({save=true,production=false,revoke=false}={}){const calls=[];let checks=0;
 const r=structuredClone(purchase);if(production)delete r.testPurchase;
 return {calls,verify:createPurchaseVerifier({api:{get:async()=>{calls.push('google');return r;},acknowledge:async()=>calls.push('ack')},service:{rpc:async(name,args)=>{calls.push('save');assert.equal(name,'manee_android_billing_save');assert.equal(args.p_user_id,userId);assert.equal(args.p_store_id,storeId);return {data:save};}},authorize:async()=>{calls.push('owner');if(revoke&&++checks===2)throw Error('owner_access_denied');}})};
}
const input={userId,storeId,purchaseToken:'test-token'};
test('sandbox receipt persists before acknowledgement and never activates production',async()=>{const s=setup();const r=await s.verify(input);assert.equal(r.active,false);assert.equal(r.testActive,true);assert.deepEqual(s.calls,['owner','google','owner','save','ack','owner']);});
test('database failure, stale token and revoked owner never acknowledge',async()=>{for(const option of [{save:false},{revoke:true}]){const s=setup(option);await assert.rejects(s.verify(input));assert.equal(s.calls.includes('ack'),false);}});
test('production purchases remain closed pending full entitlement integration',async()=>{const s=setup({production:true});await assert.rejects(s.verify(input),/billing_not_ready/);assert.equal(s.calls.includes('save'),false);assert.equal(s.calls.includes('ack'),false);});
