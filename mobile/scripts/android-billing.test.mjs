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
  return {calls,playBilling,setContext:c=>context=c,client:createAndroidBillingClient({playBilling,request,getContext:()=>context,allowPaid:overrides.allowPaid??true})};
}
test('internal build hides paid readiness and refuses a paid checkout before Play',async()=>{
 const seen=[];
 const s=setup({allowPaid:false,request:async(_c,_n,b)=>{
  seen.push(b.action);
  return b.action==='release'?{released:true}:{ready:true,testOnly:false,...selection,accountId:'a',profileId:'b',checkoutId:b.checkoutId};
 },playBilling:{products:async()=>{throw Error('must not query Play');},purchases:async()=>{throw Error('must not query Play');},purchase:async()=>{throw Error('must not charge');}}});
 assert.deepEqual(await s.client.status(),{ready:false,testOnly:false,...selection,accountId:'a',profileId:'b',checkoutId:undefined,reason:'app_update_required'});
 assert.deepEqual(await s.client.products(),{ready:false,products:[]});
 await assert.rejects(s.client.restore(),/업데이트/);
 await assert.rejects(s.client.purchase(selection),/업데이트/);
 assert.deepEqual(seen,['status','status','status','prepare','release']);
});
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
 const s=setup({request:async(_c,_n,b)=>b.action==='verify'?{verified:true}:b.action==='release'?{released:true}:{ready:true,...selection,accountId:'a',profileId:'b',checkoutId:b.checkoutId,testOnly:false,testActive:true}});
 assert.equal((await s.client.purchase(selection)).status,'purchased');
});

test('a paid checkout releases its exact lease after verified purchase or explicit cancellation',async()=>{
 for(const checkoutStatus of ['purchased','cancelled']){
  const seen=[];
  const s=setup({request:async(_c,_n,b)=>{
   seen.push({action:b.action,checkoutId:b.checkoutId});
   if(b.action==='prepare')return{ready:true,...selection,accountId:'a',profileId:'b',testOnly:false,checkoutId:b.checkoutId};
   if(b.action==='verify')return{verified:true,active:true};
   return{released:true};
  },playBilling:{purchase:async()=>({status:checkoutStatus,purchases:[paid]})}});
  assert.equal((await s.client.purchase(selection)).status,checkoutStatus);
  assert.deepEqual(seen.map(x=>x.action),checkoutStatus==='purchased'?['prepare','verify','release']:['prepare','release']);
  assert.equal(seen[0].checkoutId,seen.at(-1).checkoutId);
 }
});
test('a pending or uncertain paid purchase keeps its lease for restoration',async()=>{
 for(const purchase of [async()=>({status:'pending'}),async()=>{throw Error('Play disconnected');}]){
  const seen=[];
  const s=setup({request:async(_c,_n,b)=>{
   seen.push(b.action);
   return{ready:true,...selection,accountId:'a',profileId:'b',testOnly:false,checkoutId:b.checkoutId};
  },playBilling:{purchase}});
  try{await s.client.purchase(selection);}catch{}
  assert.deepEqual(seen,['prepare']);
 }
});
test('Play item unavailable releases the checkout lease for a later attempt',async()=>{
 const seen=[];
 const s=setup({request:async(_c,_n,b)=>{
  seen.push({action:b.action,checkoutId:b.checkoutId});
  return {ready:true,...selection,accountId:'a',profileId:'b',testOnly:false,checkoutId:b.checkoutId};
 },playBilling:{purchase:async()=>{throw Object.assign(Error('구입하려는 항목을 찾을 수 없습니다.'),{code:'PLAY_4'});}}});
 await assert.rejects(s.client.purchase(selection),/항목을 찾을 수/);
 assert.deepEqual(seen.map(x=>x.action),['prepare','release']);
 assert.equal(seen[0].checkoutId,seen[1].checkoutId);
 assert.equal(s.client.isBusy(),false);
});
test('paid purchase cannot start when the server has not issued a lease',async()=>{
 const s=setup({request:async()=>({ready:true,...selection,accountId:'a',profileId:'b',testOnly:false})});
 await assert.rejects(s.client.purchase(selection),/다시 시도/);
 assert.deepEqual(s.calls,[]);
});

test('restore verifies only the selected store product while leaving other store receipts alone',async()=>{
 const seen=[];const second={...paid,purchaseToken:'second',productIds:['manee.store2.monthly']};
 const s=setup({playBilling:{purchases:async()=>({purchases:[paid,second]})},request:async(_c,_n,b)=>{
 if(b.action==='status')return{ready:true,productId:'manee.store2.monthly'};
 seen.push(b.purchaseToken);return{verified:true,testActive:true};
 }});
 assert.equal((await s.client.restore()).status,'restored');assert.deepEqual(seen,['second']);
});

test('account restore verifies all server-owned legacy products from any selected store',async()=>{
 const verified=[];
 const client=createAndroidBillingClient({allowPaid:true,getContext:()=>({userId:'owner',storeId:'third',role:'storeOwner'}),
  playBilling:{purchases:async()=>({purchases:[{state:'purchased',productIds:['manee.store2.monthly'],purchaseToken:'legacy'},
   {state:'purchased',productIds:['foreign.product'],purchaseToken:'foreign'}]})},
  request:async(c,name,b)=>{if(b.action==='verify'){verified.push(b);return {verified:true,active:true};}
   return {ready:true,testOnly:false,productId:'manee.store1.monthly',restoreProductIds:['manee.store1.monthly','manee.store2.monthly']};}});
 assert.equal((await client.restore()).status,'restored');assert.equal(verified.length,1);assert.equal(verified[0].productId,'manee.store2.monthly');
});
