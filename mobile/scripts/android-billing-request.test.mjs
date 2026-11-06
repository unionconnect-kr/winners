import test from 'node:test';
import assert from 'node:assert/strict';
import {requestAndroidBilling,PURCHASE_BINDING_MISMATCH_MESSAGE} from '../src/android-billing-request.mjs';
import {createAndroidBillingClient} from '../src/android-billing.mjs';
const unavailable='결제 서버 연결 또는 이용 권한을 확인하지 못했어요.';
function context({sessionUser='owner',authError=null,invoke=async()=>({data:{ready:true}})}={}){
 const calls=[];
 return{calls,c:{userId:'owner',storeId:'store',role:'storeOwner',db:{auth:{getSession:async()=>({data:{session:{user:{id:sessionUser}}},error:authError})},
  functions:{invoke:async(name,options)=>{calls.push({name,options});return invoke(name,options);}}}}};
}
test('Android adapter keeps the live session guard and binds every request to the selected store',async()=>{
 const f=context();const data=await requestAndroidBilling(f.c,'ignored',{action:'status',storeId:'untrusted-store'});
 assert.deepEqual(data,{ready:true});assert.equal(f.calls.length,1);
 assert.equal(f.calls[0].name,'manee-android-billing');
 assert.deepEqual(f.calls[0].options.body,{action:'status',storeId:'store'});
 assert.ok(f.calls[0].options.signal instanceof AbortSignal);
 for(const options of [{sessionUser:'other'},{authError:Error('private-auth-message')}]){
  const denied=context(options);await assert.rejects(requestAndroidBilling(denied.c,'ignored',{}),{message:'다시 로그인해 주세요.'});
  assert.equal(denied.calls.length,0);
 }
});
test('only exact 422 binding rejection becomes the fixed Korean binding error and does not consume the response',async()=>{
 const response=Response.json({error:'purchase_binding_mismatch',receipt:'private-receipt',token:'private-token'},{status:422});
 const f=context({invoke:async()=>({error:{message:'private-upstream-message',context:response}})});
 await assert.rejects(requestAndroidBilling(f.c,'ignored',{action:'verify',purchaseToken:'private-purchase-token'}),error=>{
  assert.equal(error.code,'PURCHASE_BINDING_MISMATCH');assert.equal(error.message,PURCHASE_BINDING_MISMATCH_MESSAGE);
  assert.deepEqual(Object.keys(error),['code']);assert.doesNotMatch(JSON.stringify(error)+error.message,/private-/);return true;
 });
 assert.equal(response.bodyUsed,false);assert.equal((await response.json()).error,'purchase_binding_mismatch');
 assert.match(PURCHASE_BINDING_MISMATCH_MESSAGE,/현재 매니 아이디/);
 assert.match(PURCHASE_BINDING_MISMATCH_MESSAGE,/확인하거나 지원팀에 문의/);
});
test('401, 403, 503, invalid 422 JSON and other error bodies retain the common failure mapping',async()=>{
 const responses=[...[401,403,503].map(status=>Response.json({error:'purchase_binding_mismatch'},{status})),
  new Response('private-non-json',{status:422}),Response.json({error:'purchase_mismatch'},{status:422}),
  Response.json({error:'purchase_binding_mismatch_extra'},{status:422}),Response.json(['purchase_binding_mismatch'],{status:422}),
  Response.json(null,{status:422}),{status:422,clone(){throw Error('private-clone-error');}},
  {status:422},new Response(null,{status:422})];
 for(const response of responses){
  const f=context({invoke:async()=>({error:{message:'private-error',context:response}})});
  await assert.rejects(requestAndroidBilling(f.c,'ignored',{}),error=>{
   assert.equal(error.message,unavailable);assert.equal(error.code,undefined);assert.doesNotMatch(error.message,/private-/);return true;
  });
 }
});
test('409 keeps its distinct neutral checkout guidance and never parses the server body',async()=>{
 const f=context({invoke:async()=>({error:{context:{status:409,clone(){throw Error('must not parse');}}}})});
 await assert.rejects(requestAndroidBilling(f.c,'ignored',{}),error=>{
  assert.match(error.message,/이 계정의 이전 결제 처리/);assert.match(error.message,/기존 구독 복원/);
  assert.doesNotMatch(error.message,/다른 기기|private-|must not parse/);assert.equal(error.code,undefined);return true;
 });
});
test('fetch failures and thrown transport errors expose only the existing common connection guidance',async()=>{
 for(const invoke of [async()=>({error:{name:'FunctionsFetchError',message:'private-fetch-url-token'}}),async()=>{throw Error('private-fetch-url-token');}]){
  const f=context({invoke});await assert.rejects(requestAndroidBilling(f.c,'ignored',{}),{message:unavailable});
 }
});
test('binding rejection stops an existing receipt from falling through to another purchase and permits explicit restore',async()=>{
 const seen=[];let launches=0,queries=0;
 const productId='manee.store1.monthly';
 const f=context({invoke:async(_name,{body})=>{
  seen.push(body.action);
  if(body.action==='verify')return{error:{context:Response.json({error:'purchase_binding_mismatch'},{status:422})}};
  return{data:{ready:true,testOnly:true,productId,accountId:'a'.repeat(64),profileId:'b'.repeat(64)}};
 }});
 const billing=createAndroidBillingClient({getContext:()=>f.c,request:requestAndroidBilling,allowPaid:true,
  playBilling:{purchases:async()=>{queries++;return{purchases:[{state:'purchased',productIds:[productId],purchaseToken:'private-receipt'}]};},
   purchase:async()=>{launches++;throw Error('must not buy');}}});
 for(const operation of [()=>billing.purchase({productId,offerToken:'trial'}),()=>billing.restore()]){
  await assert.rejects(operation(),{code:'PURCHASE_BINDING_MISMATCH',message:PURCHASE_BINDING_MISMATCH_MESSAGE});
  assert.equal(billing.isBusy(),false);
 }
 assert.deepEqual(seen,['prepare','verify','status','verify']);assert.equal(queries,2);assert.equal(launches,0);
});
