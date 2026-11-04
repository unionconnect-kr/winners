import test from 'node:test';
import assert from 'node:assert/strict';
import {createBillingClient} from '../src/billing.mjs';
import {createAndroidBillingClient} from '../src/android-billing.mjs';
const first='manee.store1.monthly',second='manee.store2.monthly';
const transaction=(productId=second,appAccountToken='old-token')=>({transactionId:'old',signedTransaction:'signed',productId,appAccountToken});
function ios({pending=[],restore=[],result='purchased',failVerify=false,switchContext=false,overrides={},failProduct=false}={}){
 let current={userId:'owner',storeId:'selected-store',role:'storeOwner'},purchases=0,finished=[],calls=[];
 const client=createBillingClient({getContext:()=>current,request:async(c,n,body)=>{
  calls.push(body);
  if(body.action==='verify'){
   if(failVerify)throw Error('offline');
   if(switchContext)current.userId='other';
   return {subscriptions:[{active:true}]};
  }
  if(body.action==='release')return {released:true};
  return {ready:true,billingScope:'account',productId:first,appAccountToken:'primary',bindings:[{productId:first,appAccountToken:'primary'},{productId:second,appAccountToken:'old-token'}],
   subscriptions:[],checkoutId:body.checkoutId,...overrides};
 },storeKit:{pending:async()=>({transactions:pending}),restore:async()=>({transactions:restore}),
  products:async()=>({monthly:!failProduct,priceApproved:true}),
  purchase:async()=>{purchases++;return {status:result,...transaction(first,'primary')};},finish:async t=>finished.push(t.transactionId)}});
 return {client,calls,finished,purchases:()=>purchases};
}
test('iOS restores legacy bindings across stores, but not another owner token',async()=>{
 const h=ios({restore:[transaction(),transaction(first,'foreign')]});
 assert.equal((await h.client.restore()).status,'restored');
 assert.deepEqual(h.finished,['old']);
 assert.deepEqual(h.calls.filter(c=>c.action==='verify').map(c=>[c.productId,c.appAccountToken]),[[second,'old-token']]);
});
test('iOS recovers an owned additional-store receipt before opening a new checkout',async()=>{
 const h=ios({pending:[transaction()]});
 assert.equal((await h.client.purchase()).status,'restored');assert.equal(h.purchases(),0);
 assert.deepEqual(h.calls.map(c=>c.action),['prepare','verify','release']);
});
test('iOS account checkout releases the exact lease on cancellation and saved purchases',async()=>{
 for(const result of ['cancelled','purchased']){
  const h=ios({result});assert.equal((await h.client.purchase()).status,result);
  assert.deepEqual(h.calls.map(c=>c.action),result==='cancelled'?['prepare','release']:['prepare','verify','release']);
  assert.equal(h.calls[0].checkoutId,h.calls.at(-1).checkoutId);
 }
});
test('iOS pending and failed verification retain the lease and never finish unverified purchases',async()=>{
 const pending=ios({result:'pending'});assert.equal((await pending.client.purchase()).status,'pending');
 assert.deepEqual(pending.calls.map(c=>c.action),['prepare']);assert.deepEqual(pending.finished,[]);
 const failure=ios({failVerify:true});await assert.rejects(failure.client.purchase(),/offline/);
 assert.deepEqual(failure.finished,[]);assert.equal(failure.calls.some(c=>c.action==='release'),false);
});
test('iOS missing lease, another platform subscription and invalid catalog never purchase',async()=>{
 for(const options of [{overrides:{checkoutId:null}},{overrides:{otherPlatformActive:true}},{failProduct:true}]){
  const h=ios(options);await assert.rejects(h.client.purchase());assert.equal(h.purchases(),0);
  if(options.overrides?.checkoutId!==null)assert.equal(h.calls.at(-1).action,'release');
 }
});
test('iOS in-place account changes cannot finish or release another owner checkout',async()=>{
 const h=ios({switchContext:true});await assert.rejects(h.client.purchase(),/계정/);
 assert.deepEqual(h.finished,[]);assert.equal(h.calls.some(c=>c.action==='release'),false);
});
function android(purchases,overrides={}){
 const calls=[];let charges=0;
 const client=createAndroidBillingClient({allowPaid:true,getContext:()=>({userId:'owner',storeId:'selected',role:'storeOwner'}),
  request:async(c,n,b)=>{calls.push(b);return b.action==='verify'?{verified:true,active:true}:b.action==='release'?{released:true}:
   {ready:true,billingScope:'account',restoreProductIds:[first,second],productId:first,testOnly:false,accountId:'account',profileId:'original-store',checkoutId:b.checkoutId,...overrides};},
  playBilling:{purchases:async()=>({purchases}),purchase:async()=>{charges++;throw Error('unexpected charge');}}});
 return {client,calls,charges:()=>charges};
}
const purchase=(id,state='purchased')=>({productIds:[id],purchaseToken:id,state});
test('Android restores only all server-authorized account allocations',async()=>{
 const h=android([purchase(first),purchase(second),purchase('manee.store3.monthly')]);
 assert.equal((await h.client.restore()).status,'restored');
 assert.deepEqual(h.calls.filter(c=>c.action==='verify').map(c=>c.purchaseToken),[first,second]);
});
test('Android pending legacy purchase and another platform block duplicate checkout',async()=>{
 const h=android([purchase(second,'pending')]);assert.equal((await h.client.purchase({productId:first,offerToken:'offer'})).status,'pending');assert.equal(h.charges(),0);
 const cross=android([],{otherPlatformActive:true});assert.equal((await cross.client.purchase()).status,'alreadyActive');assert.equal(cross.charges(),0);
});
