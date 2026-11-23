import test from 'node:test';
import assert from 'node:assert/strict';
import {createBillingClient} from '../src/billing.mjs';
function setup({fail=false,ready=true,pending=[],change=false,checkout=false,purchaseError,trial=false,price,purchased={},verified,restored,info={}}={}){
 let c={userId:'owner',storeId:'store',role:'storeOwner'},finished=[],purchases=0,calls=[];
 const client=createBillingClient({getContext:()=>c,storeKit:{
  products:async()=>({monthly:true,priceApproved:true,price,twoMonthsFree:trial}),pending:async()=>({transactions:pending.map(t=>({productId:'manee.store1.monthly',appAccountToken:'server-token',...t}))}),restore:async()=>({transactions:restored??[{transactionId:'1',signedTransaction:'signed',productId:'manee.store1.monthly',appAccountToken:'server-token'}]}),
  purchase:async selection=>{purchases++;if(purchaseError)throw purchaseError;assert.equal(selection.twoMonthsFree,trial);return {status:'purchased',transactionId:'1',signedTransaction:'signed',productId:'manee.store1.monthly',appAccountToken:'server-token',...purchased};},
  finish:async t=>finished.push(t.transactionId)},
 request:async(_c,_name,body)=>{calls.push(body.action);if(body.action==='verify'){
  if(fail)throw Error('verification_failed');if(change)c={...c,userId:'other'};
  return verified??{subscriptions:[{active:body.signedTransaction!=='expired'}]};
 }return {ready,appAccountToken:'server-token',subscriptions:[],...info,...(checkout&&body.action==='prepare'?{billingScope:'account',checkoutId:body.checkoutId}:{})};}});
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
 await assert.rejects(()=>h.client.purchase(),/다른 매니 계정/);
 assert.equal(h.purchases(),0);assert.deepEqual(h.finished,[]);assert.equal(h.calls.includes('verify'),false);
});
test('another product does not block this store and sync ignores foreign bindings',async()=>{
 const h=setup({pending:[{transactionId:'foreign',signedTransaction:'signed',productId:'manee.store2.monthly',appAccountToken:'other-store'}]});
 await h.client.sync();assert.deepEqual(h.finished,[]);
 await h.client.purchase();assert.equal(h.purchases(),1);assert.deepEqual(h.finished,['1']);
});
test('an iOS trial shown to the user cannot silently become an immediate paid checkout',async()=>{
 const h=setup();
 await assert.rejects(()=>h.client.purchase({twoMonthsFree:true}),/무료체험 대상이 변경/);
 assert.equal(h.purchases(),0);assert.deepEqual(h.finished,[]);
});
test('an expired unfinished transaction is saved and does not consume a new checkout',async()=>{
 const h=setup({checkout:true,pending:[{transactionId:'old',signedTransaction:'expired'}]});
 assert.equal((await h.client.purchase()).status,'purchased');
 assert.equal(h.purchases(),1);
 assert.deepEqual(h.finished,['old','1']);
 assert.deepEqual(h.calls,['prepare','verify','verify','release']);
});
test('a product failure before StoreKit opens releases the checkout immediately',async()=>{
 const h=setup({checkout:true,purchaseError:Object.assign(Error('상품을 불러오지 못했어요.'),{code:'storekit_not_started'})});
 await assert.rejects(()=>h.client.purchase(),/상품을 불러오지 못했어요/);
 assert.deepEqual(h.calls,['prepare','release']);
 assert.deepEqual(h.finished,[]);
});
test('the advertised trial is passed through to the last StoreKit product check',async()=>{
 const h=setup({trial:true});
 assert.equal((await h.client.purchase({twoMonthsFree:true})).status,'purchased');
 assert.equal(h.purchases(),1);
});

test('changed StoreKit price cannot start a purchase with the previous displayed price',async()=>{
 const f=setup({price:'$7.99'});await assert.rejects(f.client.purchase({price:'$6.99'}),/요금이 변경/);
});

test('opening subscription status detects a foreign Apple purchase without verifying or finishing it',async()=>{
 const f=setup({pending:[{transactionId:'foreign',appAccountToken:'another-account'}]});
 assert.equal((await f.client.status()).accountConflict,true);
 assert.deepEqual(f.calls,['status']);assert.deepEqual(f.finished,[]);assert.equal(f.purchases(),0);
});
test('a purchase returned for another account after the preflight is not verified, finished or reported purchased',async()=>{
 const f=setup({checkout:true,purchased:{appAccountToken:'another-account'}});
 await assert.rejects(f.client.purchase(),{code:'purchase_account_mismatch'});
 assert.deepEqual(f.calls,['prepare','release']);assert.deepEqual(f.finished,[]);
});
test('a purchase with missing token or wrong product cannot activate the current account',async()=>{
 for(const purchased of [{appAccountToken:undefined},{productId:'manee.store2.monthly'}]){
  const f=setup({purchased});await assert.rejects(f.client.purchase(),{code:'purchase_account_mismatch'});
  assert.equal(f.calls.includes('verify'),false);assert.deepEqual(f.finished,[]);
 }
});
test('a saved but expired purchase is not returned as a successful subscription',async()=>{
 const f=setup({checkout:true,verified:{subscriptions:[{active:false,testActive:false}]}});
 await assert.rejects(f.client.purchase(),/활성 구독을 확인하지 못/);
 assert.deepEqual(f.calls,['prepare','verify','release']);
});
test('verified Sandbox purchases remain test subscriptions rather than production access',async()=>{
 const f=setup({verified:{subscriptions:[{active:false,testActive:true}]}});
 const result=await f.client.purchase();assert.equal(result.status,'purchased');
 assert.equal(result.subscriptions[0].active,false);assert.equal(result.subscriptions[0].testActive,true);
});
test('restore cannot claim another account purchase and never finishes it',async()=>{
 const f=setup({restored:[{transactionId:'foreign',productId:'manee.store1.monthly',appAccountToken:'another-account'}]});
 await assert.rejects(f.client.restore(),{code:'purchase_account_mismatch'});
 assert.deepEqual(f.calls,['status']);assert.deepEqual(f.finished,[]);
});
test('restoring an expired record after an active record retains the active account result',async()=>{
 const f=setup({restored:[
  {transactionId:'active',signedTransaction:'signed',productId:'manee.store1.monthly',appAccountToken:'server-token'},
  {transactionId:'expired',signedTransaction:'expired',productId:'manee.store1.monthly',appAccountToken:'server-token'},
 ]});
 assert.equal((await f.client.restore()).subscriptions[0].active,true);
 assert.deepEqual(f.finished,['active','expired']);
});
test('account bindings still allow restoration from another store owned by the same account',async()=>{
 const f=setup({checkout:true,info:{billingScope:'account',bindings:[{productId:'manee.store1.monthly',appAccountToken:'legacy-token'}]},
  pending:[{transactionId:'legacy',signedTransaction:'signed',appAccountToken:'LEGACY-TOKEN'}]});
 assert.equal((await f.client.status()).accountConflict,undefined);
 assert.equal((await f.client.purchase()).status,'restored');assert.equal(f.purchases(),0);
});
test('native account mismatch before StoreKit starts releases the checkout lease',async()=>{
 const f=setup({checkout:true,purchaseError:Object.assign(Error('다른 매니 계정'),{code:'purchase_account_mismatch'})});
 await assert.rejects(f.client.purchase(),{code:'purchase_account_mismatch'});
 assert.deepEqual(f.calls,['prepare','release']);assert.deepEqual(f.finished,[]);
});

test('subscription management serializes native presentation without claiming a checkout or verifying transactions',async()=>{
 let finish,calls=0;
 const c={userId:'owner',storeId:'store',role:'storeOwner'};
 const client=createBillingClient({getContext:()=>c,storeKit:{manageSubscriptions:()=>{calls++;return new Promise(resolve=>finish=resolve);}},request:()=>{throw Error('management must not mutate billing');}});
 const opening=client.manage();
 assert.equal(client.isBusy(),true);
 await assert.rejects(client.manage(),/처리 중/);
 assert.equal(calls,1);finish({status:'closed'});await opening;
 assert.equal(client.isBusy(),false);
});

test('subscription management rejects changed owners and releases the busy state on native failure',async()=>{
 let c={userId:'owner',storeId:'store',role:'storeOwner'},fail=false;
 const client=createBillingClient({getContext:()=>c,storeKit:{manageSubscriptions:async()=>{if(fail)throw Error('native_management_failed');c={...c,userId:'other'};}},request:()=>{throw Error('unexpected server call');}});
 await assert.rejects(client.manage(),/계정 또는 매장이 바뀌/);assert.equal(client.isBusy(),false);
 fail=true;await assert.rejects(client.manage(),/native_management_failed/);assert.equal(client.isBusy(),false);
 c={...c,role:'staff'};await assert.rejects(client.manage(),/사장님/);
});
