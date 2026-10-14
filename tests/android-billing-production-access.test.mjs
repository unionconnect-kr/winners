import test from 'node:test';
import assert from 'node:assert/strict';
import {createProductionAccess} from '../supabase/functions/manee-android-billing/production-access.mjs';
const url='https://bhwuuxcrzxespkjlmqxr.supabase.co';
const owner='11111111-1111-4111-8111-111111111111';
const store='22222222-2222-4222-8222-222222222222';
const pair={userId:owner,storeId:store};

test('paid receipts are closed with missing, incomplete or wrong-project configuration',async()=>{
 for(const config of [{}, {url,enabled:'yes-2026-launch'}, {url,pairs:owner+':'+store},
  {url:'https://obpkzecgswnfuyhwvncd.supabase.co',enabled:'yes-2026-launch',pairs:owner+':'+store}]) {
  assert.equal(await createProductionAccess(config)(pair),false);
 }
});
test('an exact server-only owner/store pair cannot expand to another owner or store',async()=>{
 const allowed=createProductionAccess({url,enabled:'yes-2026-launch',
  pairs:'*,bad-id,'+owner.toUpperCase()+':'+store.toUpperCase()});
 assert.equal(await allowed(pair),true);
 assert.equal(await allowed({...pair,userId:'33333333-3333-4333-8333-333333333333'}),false);
 assert.equal(await allowed({...pair,storeId:'44444444-4444-4444-8444-444444444444'}),false);
 assert.equal(await allowed({userId:undefined,storeId:store}),false);
});
