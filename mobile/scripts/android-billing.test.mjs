import test from 'node:test';
import assert from 'node:assert/strict';
import {createAndroidBillingClient} from '../src/android-billing.mjs';
const selection={productId:'manee.store1.monthly',offerToken:'monthly-trial'};
const paid={state:'purchased',purchaseToken:'receipt',productIds:[selection.productId]};
function setup(overrides={}) {
  let context={userId:'owner',storeId:'store',role:'storeOwner'};
  const calls=[];
  const playBilling={
    purchases:async()=>({purchases:[]}),
    products:async()=>({products:[selection]}),
    purchase:async()=>{calls.push('checkout');return {status:'purchased',purchases:[paid]};},
    ...overrides.playBilling,
  };
  const request=overrides.request||(async(_c,_name,body)=>{
    calls.push(body.action);
    return body.action==='verify'?{verified:true,active:true}:{ready:true,...selection,accountId:'a'.repeat(64),profileId:'b'.repeat(64)};
  });
  return {calls,playBilling,setContext:c=>context=c,client:createAndroidBillingClient({playBilling,request,getContext:()=>context})};
}
test('purchase requires server readiness and verifies the receipt before success',async()=>{
  const s=setup();assert.equal((await s.client.purchase(selection)).status,'purchased');
  assert.deepEqual(s.calls,['prepare','checkout','verify']);
});
test('disabled checkout never calls Play',async()=>{
  const s=setup({request:async()=>({ready:false})});
  await assert.rejects(s.client.purchase(selection),/준비/);assert.deepEqual(s.calls,[]);
});
test('pending purchases cannot trigger a second charge or grant access',async()=>{
  const s=setup({playBilling:{purchases:async()=>({purchases:[{...paid,state:'pending'}]})}});
  assert.equal((await s.client.purchase(selection)).status,'pending');assert.deepEqual(s.calls,['prepare']);
});
test('interrupted paid purchases are restored before attempting another checkout',async()=>{
  const s=setup({playBilling:{purchases:async()=>({purchases:[paid]})}});
  assert.equal((await s.client.purchase(selection)).status,'restored');assert.deepEqual(s.calls,['prepare','verify']);
});
test('cancelled checkout never verifies or grants access',async()=>{
  const s=setup({playBilling:{purchase:async()=>({status:'cancelled'})}});
  assert.equal((await s.client.purchase(selection)).status,'cancelled');assert.deepEqual(s.calls,['prepare']);
});
test('failed server verification leaves purchase recoverable and releases busy state',async()=>{
  const s=setup({request:async(_c,_n,b)=>b.action==='verify'?{verified:false}:{ready:true,...selection,accountId:'a',profileId:'b'}});
  await assert.rejects(s.client.purchase(selection),/구매 확인/);assert.equal(s.client.isBusy(),false);
});
test('account switch during prepare prevents checkout',async()=>{
  let release;const s=setup({request:()=>new Promise(resolve=>release=resolve)});
  const pending=s.client.purchase(selection);s.setContext({userId:'other',storeId:'store',role:'storeOwner'});
  release({ready:true,...selection,accountId:'a',profileId:'b'});
  await assert.rejects(pending,/계정 또는 매장/);assert.deepEqual(s.calls,[]);
});
test('simultaneous checkout attempts cannot duplicate a payment',async()=>{
  let release;const s=setup({request:()=>new Promise(resolve=>release=resolve)});
  const pending=s.client.purchase(selection);
  await assert.rejects(s.client.purchase(selection),/처리 중/);
  release({ready:false});await assert.rejects(pending,/준비/);
});
test('staff cannot access owner billing and mismatched displayed products cannot charge',async()=>{
  const s=setup();s.setContext({userId:'staff',storeId:'store',role:'staff'});
  await assert.rejects(s.client.purchase(selection),/사장님/);
  s.setContext({userId:'owner',storeId:'store',role:'storeOwner'});
  await assert.rejects(s.client.purchase({...selection,productId:'another.product'}),/요금/);
  assert.deepEqual(s.calls,['prepare']);
});
test('restoring pending purchases does not verify them',async()=>{
  const s=setup({playBilling:{purchases:async()=>({purchases:[{...paid,state:'pending'}]})}});
  assert.equal((await s.client.restore()).status,'pending');assert.deepEqual(s.calls,['status']);
});

test('server-confirmed active subscription prevents another checkout even with empty device cache',async()=>{
 for(const state of [{active:true},{testOnly:true,testActive:true}]){
 const s=setup({request:async()=>({ready:true,...selection,accountId:'a',profileId:'b',...state}),playBilling:{purchases:async()=>{throw Error('must not query');}}});
 assert.equal((await s.client.purchase(selection)).status,'alreadyActive');assert.deepEqual(s.calls,[]);
 }
 const s=setup({request:async(_c,_n,b)=>b.action==='verify'?{verified:true}:{ready:true,...selection,accountId:'a',profileId:'b',testOnly:false,testActive:true}});
 assert.equal((await s.client.purchase(selection)).status,'purchased');
});

test('restore verifies only the selected store product while leaving other store receipts alone',async()=>{
 const seen=[];const second={...paid,purchaseToken:'second',productIds:['manee.store2.monthly']};
 const s=setup({playBilling:{purchases:async()=>({purchases:[paid,second]})},request:async(_c,_n,b)=>{
 if(b.action==='status')return{ready:true,productId:'manee.store2.monthly'};
 seen.push(b.purchaseToken);return{verified:true,testActive:true};
 }});
 assert.equal((await s.client.restore()).status,'restored');assert.deepEqual(seen,['second']);
});
