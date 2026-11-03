import test from 'node:test';
import assert from 'node:assert/strict';
import {createBillingClient} from '../src/billing.mjs';
function setup({fail=false,ready=true,pending=[],change=false}={}){
 let c={userId:'owner',storeId:'store',role:'storeOwner'},finished=[],purchases=0,calls=[];
 const client=createBillingClient({getContext:()=>c,storeKit:{
  products:async()=>({monthly:true,priceApproved:true}),pending:async()=>({transactions:pending.map(t=>({productId:'manee.store1.monthly',appAccountToken:'server-token',...t}))}),restore:async()=>({transactions:[{transactionId:'1',signedTransaction:'signed',productId:'manee.store1.monthly',appAccountToken:'server-token'}]}),
  purchase:async()=>{purchases++;return {status:'purchased',transactionId:'1',signedTransaction:'signed'};},
  finish:async t=>finished.push(t.transactionId)},
 request:async(_c,_name,body)=>{calls.push(body.action);if(body.action==='verify'){
  if(fail)throw Error('verification_failed');if(change)c={...c,userId:'other'};
  return {subscriptions:[{active:true}]};
 }return {ready,appAccountToken:'server-token',subscriptions:[]};}});
 return {client,finished,calls,purchases:()=>purchases};
}
test('server verification must succeed before StoreKit transaction is finished',async()=>{
 const good=setup();await good.client.purchase();assert.deepEqual(good.calls,['prepare','verify']);assert.deepEqual(good.finished,['1']);
 const bad=setup({fail:true});await assert.rejects(()=>bad.client.purchase(),/verification_failed/);assert.deepEqual(bad.finished,[]);
});
test('configuration failure and interrupted purchases prevent new charges',async()=>{
 const missing=setup({ready:false});await assert.rejects(()=>missing.client.purchase());assert.equal(missing.purchases(),0);
 const old=setup({pending:[{transactionId:'old',signedTransaction:'signed'}]});await old.client.purchase();assert.equal(old.purchases(),0);assert.deepEqual(old.finished,['old']);
});
test('restore verifies server state and account changes cannot finish a transaction',async()=>{
 const restored=setup();await restored.client.restore();assert.deepEqual(restored.finished,['1']);
 const switched=setup({change:true});await assert.rejects(()=>switched.client.purchase(),/계정/);assert.deepEqual(switched.finished,[]);
});
test('purchases bound to another store are neither finished nor charged again',async()=>{
 const h=setup({pending:[{transactionId:'foreign',signedTransaction:'signed',productId:'manee.store1.monthly',appAccountToken:'other-store'}]});
 await assert.rejects(()=>h.client.purchase(),/다른 매장/);
 assert.equal(h.purchases(),0);assert.deepEqual(h.finished,[]);assert.equal(h.calls.includes('verify'),false);
});
test('another product does not block this store and sync ignores foreign bindings',async()=>{
 const h=setup({pending:[{transactionId:'foreign',signedTransaction:'signed',productId:'manee.store2.monthly',appAccountToken:'other-store'}]});
 await h.client.sync();assert.deepEqual(h.finished,[]);
 await h.client.purchase();assert.equal(h.purchases(),1);assert.deepEqual(h.finished,['1']);
});
