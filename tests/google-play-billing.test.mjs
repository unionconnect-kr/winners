import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {binding,verifiedRecord,verifyAndPersist}=require('../netlify/functions/lib/google-play-billing.cjs');
const now=Date.parse('2026-10-14T00:00:00Z');
const context={...binding('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222'),productId:'manee.store1.monthly',basePlanId:'monthly'};
function resource(changes={}){return {subscriptionState:'SUBSCRIPTION_STATE_ACTIVE',acknowledgementState:'ACKNOWLEDGEMENT_STATE_PENDING',
 externalAccountIdentifiers:{obfuscatedExternalAccountId:context.accountId,obfuscatedExternalProfileId:context.profileId},
 lineItems:[{productId:context.productId,offerDetails:{basePlanId:'monthly'},autoRenewingPlan:{autoRenewEnabled:true},expiryTime:'2026-11-14T00:00:00Z'}],...changes};}
const record=r=>verifiedRecord(r,{...context,purchaseToken:'test-token'},now);
test('Play account/store binding is opaque and changes for each owner or store',()=>{
 assert.match(context.accountId,/^[a-f0-9]{64}$/);assert.match(context.profileId,/^[a-f0-9]{64}$/);
 const other=binding('11111111-1111-4111-8111-111111111111','33333333-3333-4333-8333-333333333333');
 assert.equal(other.accountId,context.accountId);assert.notEqual(other.profileId,context.profileId);
});
test('Google test purchases never activate production entitlement',()=>{
 assert.equal(record(resource()).active,true);
 const test=record(resource({testPurchase:{}}));assert.equal(test.active,false);assert.equal(test.testActive,true);
});
test('suspended, expired, paused and pending subscriptions cannot grant access',()=>{
 for(const state of ['ON_HOLD','EXPIRED','PAUSED','PENDING','PENDING_PURCHASE_CANCELED']){
  const r=record(resource({subscriptionState:'SUBSCRIPTION_STATE_'+state}));
  assert.equal(r.active,false);assert.equal(r.acknowledge,false);
 }
});
test('cancellation retains access only until expiry; grace period remains usable',()=>{
 for(const state of ['CANCELED','IN_GRACE_PERIOD'])assert.equal(record(resource({subscriptionState:'SUBSCRIPTION_STATE_'+state})).active,true);
 const expired=resource();expired.lineItems[0].expiryTime='2026-10-13T00:00:00Z';assert.equal(record(expired).active,false);
});
test('wrong store, account, product or base plan cannot claim a receipt',()=>{
 const candidates=[resource({externalAccountIdentifiers:{}}),resource(),resource()];
 candidates[1].lineItems[0].productId='other';candidates[2].lineItems[0].offerDetails.basePlanId='yearly';
 for(const r of candidates)assert.throws(()=>record(r),/purchase_mismatch/);
});
test('unknown state and malformed expiry fail closed',()=>{
 assert.throws(()=>record(resource({subscriptionState:'NEW_STATE'})),/purchase_mismatch/);
 const r=resource();r.lineItems[0].expiryTime='bad';assert.throws(()=>record(r),/purchase_mismatch/);
});
test('Google is queried afresh and acknowledgement follows durable persistence',async()=>{
 const calls=[];let current=resource();const api={get:async()=>{calls.push('google');return current;},acknowledge:async()=>calls.push('ack')};
 const args={api,context,purchaseToken:'token',now:()=>now,persist:async()=>{calls.push('persist');return true;}};
 assert.equal((await verifyAndPersist(args)).active,true);assert.deepEqual(calls,['google','persist','ack']);
 current=resource({subscriptionState:'SUBSCRIPTION_STATE_EXPIRED'});
 assert.equal((await verifyAndPersist(args)).active,false);assert.deepEqual(calls.slice(3),['google','persist']);
});
test('failed persistence never acknowledges and already acknowledged purchases are idempotent',async()=>{
 let acknowledgements=0;const api={get:async()=>resource(),acknowledge:async()=>acknowledgements++};
 await assert.rejects(verifyAndPersist({api,context,purchaseToken:'token',now:()=>now,persist:async()=>false}),/save_failed/);
 assert.equal(acknowledgements,0);
 api.get=async()=>resource({acknowledgementState:'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED'});
 await verifyAndPersist({api,context,purchaseToken:'token',now:()=>now,persist:async()=>true});assert.equal(acknowledgements,0);
});
test('slow verification retains its start timestamp for stale-write rejection',async()=>{
 let time=now;let saved;
 await verifyAndPersist({api:{get:async()=>{time+=30000;return resource();},acknowledge:async()=>{}},context,purchaseToken:'slow',now:()=>time,persist:async r=>{saved=r;return true;}});
 assert.equal(saved.checkedAt,new Date(now).toISOString());
});
