import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import google from '../netlify/functions/lib/google-play-billing.cjs';
import {createHandler,PRODUCT} from '../supabase/functions/manee-android-billing/handler.mjs';
import {createProductionAccess} from '../supabase/functions/manee-android-billing/production-access.mjs';
const storeId='22222222-2222-4222-8222-222222222222';
const checkoutId='33333333-3333-4333-8333-333333333333';
const accountData=(productId=PRODUCT,billingStoreId=storeId)=>({productId,billingStoreId,restoreProductIds:productId?[productId]:[],otherPlatformActive:false});
const product={packageName:'kr.co.manee.app',productId:PRODUCT,basePlans:[{basePlanId:'monthly',state:'ACTIVE',autoRenewingBasePlanType:{billingPeriodDuration:'P1M'},regionalConfigs:[{regionCode:'KR',newSubscriberAvailability:true}]}]};
const req=(body={action:'status',storeId},headers={authorization:'Bearer test-token'})=>new Request('https://example.com',{method:'POST',headers,body:JSON.stringify(body)});
function setup({auth=true,owner=true,resource=product,diagnostic}={}){
 let calls=0,checks=0;
 const handler=createHandler({client:()=>({auth:{getUser:async()=>({data:{user:auth?{id:'user'}:null}})},rpc:async name=>({data:name==='manee_android_billing_status'?{subscriptions:[]}:typeof owner==='function'?owner(++checks):owner})}),api:{product:async()=>{calls++;return resource;}},diagnostic});
 return {handler,calls:()=>calls};
}
test('anonymous, invalid sessions and nonowners cannot query Google',async()=>{
 for(const options of [{auth:false},{owner:false}]){const s=setup(options);assert.ok([401,403].includes((await s.handler(req())).status));assert.equal(s.calls(),0);}
 const s=setup();assert.equal((await s.handler(req(undefined,{}))).status,401);assert.equal(s.calls(),0);
});
test('valid catalog never enables checkout; prepare and verify remain gated',async()=>{
 const s=setup();assert.deepEqual(await (await s.handler(req())).json(),{ready:false,catalogReady:true,productId:PRODUCT,basePlanId:'monthly',active:false,testActive:false});
 for(const action of ['prepare','verify'])assert.equal((await s.handler(req({action,storeId}))).status,503);
 assert.equal(s.calls(),1);
});
test('owner access is checked again after Google lookup',async()=>{
 const s=setup({owner:n=>n===1});assert.equal((await s.handler(req())).status,403);
});
test('wrong package, inactive plan and unavailable region are not ready',async()=>{
 for(const change of [r=>r.packageName='other',r=>r.basePlans[0].state='DRAFT',r=>r.basePlans[0].regionalConfigs[0].newSubscriberAvailability=false]){
 const r=structuredClone(product);change(r);assert.equal((await (await setup({resource:r}).handler(req())).json()).catalogReady,false);
 }
});
test('missing credentials, invalid bodies, unexpected origins fail closed',async()=>{
 const s=setup();assert.equal((await s.handler(req(null))).status,400);
 assert.equal((await s.handler(req(undefined,{authorization:'Bearer token',origin:'https://evil.example'}))).status,403);
 assert.equal(s.calls(),0);
});
test('Google catalog OAuth uses fixed audience/scope and caches its bearer without exposing it',async()=>{
 const {privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});const calls=[];
 const api=google.createGooglePlayApi({credentials:{client_email:'test@example.iam.gserviceaccount.com',private_key:privateKey.export({type:'pkcs8',format:'pem'})},fetcher:async(url,options)=>{
 calls.push(url);
 if(url==='https://oauth2.googleapis.com/token'){
 const claims=JSON.parse(Buffer.from(options.body.get('assertion').split('.')[1],'base64url'));
 assert.equal(claims.scope,'https://www.googleapis.com/auth/androidpublisher');assert.equal(claims.aud,url);
 return Response.json({access_token:'secret-bearer',expires_in:3600});}
 assert.equal(url,'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/kr.co.manee.app/subscriptions/'+PRODUCT);
 assert.equal(options.headers.Authorization,'Bearer secret-bearer');assert.equal(options.redirect,'error');return Response.json(product);
 }});
 assert.deepEqual(await api.product(PRODUCT),product);await api.product(PRODUCT);assert.equal(calls.length,3);
 await assert.rejects(api.product('../other'),/invalid_request/);
});
test('Edge deployment contains the same verification code as the tested server core',async()=>{
 const {readFile}=await import('node:fs/promises');
 const source=await readFile(new URL('../netlify/functions/lib/google-play-billing.cjs',import.meta.url),'utf8');
 const edge=await readFile(new URL('../supabase/functions/manee-android-billing/google-play.mjs',import.meta.url),'utf8');
 assert.equal(edge,source.replace("'use strict';\nconst {Buffer}=require('node:buffer');\nconst {createHash,createPrivateKey,sign}=require('node:crypto');","// Generated from netlify/functions/lib/google-play-billing.cjs; keep parity test passing.\nimport {Buffer} from 'node:buffer';\nimport {createHash,createPrivateKey,sign} from 'node:crypto';").replace('module.exports={PACKAGE,binding,createGooglePlayApi,verifiedRecord,verifyAndPersist};','export {PACKAGE,binding,createGooglePlayApi,verifiedRecord,verifyAndPersist};'));
});
test('only explicitly allowed owners can verify sandbox receipts through the endpoint',async()=>{
 const userId='11111111-1111-4111-8111-111111111111';const ids=google.binding(userId,storeId);let saves=0,acks=0;
 const resource={testPurchase:{},subscriptionState:'SUBSCRIPTION_STATE_ACTIVE',acknowledgementState:'ACKNOWLEDGEMENT_STATE_PENDING',externalAccountIdentifiers:{obfuscatedExternalAccountId:ids.accountId,obfuscatedExternalProfileId:ids.profileId},lineItems:[{productId:PRODUCT,offerDetails:{basePlanId:'monthly'},autoRenewingPlan:{},expiryTime:new Date(Date.now()+86400000).toISOString()}]};
 const options={client:()=>({auth:{getUser:async()=>({data:{user:{id:userId}}})},rpc:async name=>({data:name==='manee_android_account_context'?accountData():name==='manee_android_billing_status'?{subscriptions:[]}:true})}),api:{get:async()=>resource,acknowledge:async()=>acks++},service:{rpc:async()=>{saves++;return {data:true};}}};
 assert.equal((await createHandler(options)(req({action:'verify',storeId,purchaseToken:'test'}))).status,503);
 assert.equal(saves,0);assert.equal(acks,0);
 const handler=createHandler({...options,testAccess:async()=>true});
 const response=await handler(req({action:'verify',storeId,purchaseToken:'test'}));assert.equal(response.status,200);assert.equal((await response.json()).testActive,true);assert.equal(acks,1);
 delete resource.testPurchase;
 assert.equal((await handler(req({action:'verify',storeId,purchaseToken:'paid'}))).status,503);assert.equal(saves,1);assert.equal(acks,1);
});
test('production receipts require an exact owner/store permission and a live recheck',async()=>{
 const userId='11111111-1111-4111-8111-111111111111';
 const ids=google.binding(userId,storeId);
 let permitted=true,saves=0,acks=0;
 const resource={subscriptionState:'SUBSCRIPTION_STATE_ACTIVE',acknowledgementState:'ACKNOWLEDGEMENT_STATE_PENDING',
  externalAccountIdentifiers:{obfuscatedExternalAccountId:ids.accountId,obfuscatedExternalProfileId:ids.profileId},
  lineItems:[{productId:PRODUCT,offerDetails:{basePlanId:'monthly'},autoRenewingPlan:{},expiryTime:new Date(Date.now()+86400000).toISOString()}]};
 const paidProduct=structuredClone(product);
 paidProduct.basePlans[0].regionalConfigs[0].price={currencyCode:'KRW',units:'9900'};
 const options={client:()=>({auth:{getUser:async()=>({data:{user:{id:userId}}})},
  rpc:async name=>({data:name==='manee_android_account_context'?accountData():name==='manee_android_billing_status'?{subscriptions:[]}:name==='manee_android_billing_checkout_claim'?{status:'claimed'}:true})}),
  api:{product:async()=>paidProduct,get:async()=>resource,acknowledge:async()=>acks++},
  service:{rpc:async()=>{saves++;return{data:true};}},testAccess:async()=>false,
  productionAccess:async({userId:u,storeId:s})=>permitted&&u===userId&&s===storeId};
 const handler=createHandler(options);
 const status=await(await handler(req())).json();assert.equal(status.ready,true);assert.equal(status.testOnly,false);
 const prep=await(await handler(req({action:'prepare',storeId,checkoutId}))).json();
 assert.equal(prep.testOnly,false);assert.equal(prep.checkoutId,checkoutId);
 const response=await handler(req({action:'verify',storeId,purchaseToken:'paid'}));
 assert.equal(response.status,200);assert.equal((await response.json()).active,true);assert.equal(saves,1);assert.equal(acks,1);
 permitted=false;
 assert.equal((await handler(req({action:'verify',storeId,purchaseToken:'paid-again'}))).status,503);
 assert.equal(saves,1);assert.equal(acks,1);
 permitted=true;
 resource.testPurchase={};
 assert.equal((await handler(req({action:'verify',storeId,purchaseToken:'sandbox'}))).status,503);
 assert.equal(saves,1);assert.equal(acks,1);
 delete resource.testPurchase;
 options.api.get=async()=>{permitted=false;return resource;};
 assert.equal((await handler(req({action:'verify',storeId,purchaseToken:'revoked'}))).status,503);
 assert.equal(saves,1);assert.equal(acks,1);
});
test('paid prepare permits one checkout, returns conflict for another, and release checks its ID',async()=>{
 const userId='11111111-1111-4111-8111-111111111111';
 let status='claimed',released=false;
 const rpc=async(name,args)=>{
  if(name==='manee_android_account_context')return{data:accountData()};
  if(name==='manee_android_billing_status')return{data:{subscriptions:[]}};
  if(name==='manee_android_billing_checkout_claim')return{data:{status}};
  if(name==='manee_android_billing_checkout_release'){
   released=args.p_checkout_id===checkoutId;return{data:released};
  }
  return{data:true};
 };
 const paidProduct=structuredClone(product);
 paidProduct.basePlans[0].regionalConfigs[0].price={currencyCode:'KRW',units:'9900'};
 const handler=createHandler({client:()=>({auth:{getUser:async()=>({data:{user:{id:userId}}})},rpc}),
  api:{product:async()=>paidProduct},service:{},productionAccess:async()=>true});
 assert.equal((await handler(req({action:'prepare',storeId}))).status,400);
 const first=await(await handler(req({action:'prepare',storeId,checkoutId}))).json();
 assert.equal(first.checkoutId,checkoutId);
 status='in_progress';
 assert.equal((await handler(req({action:'prepare',storeId,checkoutId:'44444444-4444-4444-8444-444444444444'}))).status,409);
 assert.equal((await handler(req({action:'release',storeId,checkoutId}))).status,200);
 assert.equal(released,true);
 status='active';
 const active=await(await handler(req({action:'prepare',storeId,checkoutId}))).json();
 assert.equal(active.active,true);assert.equal(active.checkoutId,undefined);
});
test('paid preparation refuses wrong or missing Korean price while sandbox readiness is separate',async()=>{
 const userId='11111111-1111-4111-8111-111111111111';
 const catalog=structuredClone(product);
 let claims=0;
 const handler=createHandler({client:()=>({auth:{getUser:async()=>({data:{user:{id:userId}}})},
  rpc:async name=>({data:name==='manee_android_account_context'?accountData():
   name==='manee_android_billing_status'?{subscriptions:[]}:
   name==='manee_android_billing_checkout_claim'?(claims++,{status:'claimed'}):true})}),
  api:{product:async()=>catalog},service:{},productionAccess:async()=>true});
 for(const price of [undefined,{currencyCode:'KRW',units:'19800'},{currencyCode:'USD',units:'9900'},
  {currencyCode:'KRW',units:'9900',nanos:1}]){
  catalog.basePlans[0].regionalConfigs[0].price=price;
  assert.equal((await(await handler(req())).json()).ready,false);
  assert.equal((await handler(req({action:'prepare',storeId,checkoutId}))).status,503);
 }
 assert.equal(claims,0);
 catalog.basePlans[0].regionalConfigs[0].price={currencyCode:'KRW',units:'9900',nanos:0};
 assert.equal((await(await handler(req())).json()).ready,true);
});

test('test readiness and prepare are scoped to the approved store and rechecked after Google',async()=>{
 const userId='11111111-1111-4111-8111-111111111111';let access=true,checks=0;
 const options={client:()=>({auth:{getUser:async()=>({data:{user:{id:userId}}})},rpc:async name=>({data:name==='manee_android_account_context'?accountData():name==='manee_android_billing_status'?{subscriptions:[]}:true})}),
 api:{product:async()=>product},service:{},testAccess:async({storeId:s})=>{checks++;return access&&s===storeId;}};
 const h=createHandler(options);
 const ready=await(await h(req())).json();assert.equal(ready.ready,true);assert.equal(ready.testOnly,true);
 const prep=await(await h(req({action:'prepare',storeId}))).json();assert.deepEqual({accountId:prep.accountId,profileId:prep.profileId},google.binding(userId,storeId));
 assert.equal((await h(req({action:'prepare',storeId:'33333333-3333-4333-8333-333333333333'}))).status,503);
 access=false;assert.equal((await(await h(req())).json()).ready,false);
 access=true;options.api.product=async()=>{access=false;return product;};
 assert.equal((await h(req({action:'prepare',storeId}))).status,503);assert.ok(checks>4);
});

test('Edge OAuth works without the Node global Buffer', async()=>{
 const {spawnSync}=await import('node:child_process');
 const script=`
 import {createGooglePlayApi} from './supabase/functions/manee-android-billing/google-play.mjs';
 import {generateKeyPairSync} from 'node:crypto';
 const {privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
 let calls=0;
 const api=createGooglePlayApi({credentials:{client_email:'test@example.iam.gserviceaccount.com',private_key:privateKey.export({type:'pkcs8',format:'pem'})},fetcher:async()=>({ok:true,json:async()=>++calls===1?{access_token:'test',expires_in:3600}:{productId:'manee.store1.monthly'}})});
 globalThis.Buffer=undefined;
 const result=await api.product('manee.store1.monthly');
 if(result.productId!=='manee.store1.monthly'||calls!==2)throw Error('lookup failed');
 `;
 const result=spawnSync(process.execPath,['--input-type=module','-e',script],{cwd:new URL('..',import.meta.url),encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
});

test('store status is read with caller authorization and sandbox never becomes paid access',async()=>{
 let subscriptions=[{environment:'Sandbox',testActive:true,active:true,purchaseToken:'must-not-leak'}];
 let failed=false;const calls=[];
 const handler=createHandler({client:()=>({auth:{getUser:async()=>({data:{user:{id:'11111111-1111-4111-8111-111111111111'}}})},rpc:async(name,args)=>{
 calls.push({name,args});return name==='manee_android_account_context'?{data:accountData()}:name==='manee_android_billing_status'?{data:{subscriptions},error:failed?{}:null}:{data:true};
 }}),api:{product:async()=>product},service:{},testAccess:async()=>true});
 let r=await(await handler(req())).json();assert.equal(r.active,false);assert.equal(r.testActive,true);assert.ok(!JSON.stringify(r).includes('must-not-leak'));
 assert.ok(calls.some(c=>c.name==='manee_android_billing_status'&&c.args.p_store_id===storeId));
 subscriptions=[{environment:'Production',active:true,testActive:true}];
 r=await(await handler(req({action:'prepare',storeId}))).json();assert.equal(r.active,true);assert.equal(r.testActive,false);
 subscriptions=[{environment:'Sandbox',testActive:false}];
 r=await(await handler(req())).json();assert.equal(r.active,false);assert.equal(r.testActive,false);
 failed=true;assert.equal((await handler(req({action:'prepare',storeId}))).status,503);
});

test('catalog and preparation use server allocation, never a client-supplied product',async()=>{
 let sku='manee.store2.monthly';let queried;
 const h=createHandler({client:()=>({auth:{getUser:async()=>({data:{user:{id:'11111111-1111-4111-8111-111111111111'}}})},rpc:async name=>({data:name==='manee_android_account_context'?accountData(sku):name==='manee_android_billing_status'?{subscriptions:[]}:true})}),api:{product:async id=>{queried=id;return {...product,productId:id};}},service:{},testAccess:async()=>true});
 const r=await(await h(req({action:'prepare',storeId,productId:'attacker'}))).json();assert.equal(r.productId,sku);assert.equal(queried,sku);
 sku=null;assert.equal((await(await h(req())).json()).reason,'additional_store_not_ready');
 assert.equal((await h(req({action:'prepare',storeId}))).status,503);
});
test('public rollout still denies nonowners and rechecks ownership after catalog lookup',async()=>{
 const userId='11111111-1111-4111-8111-111111111111';
 const productionAccess=createProductionAccess({url:'https://bhwuuxcrzxespkjlmqxr.supabase.co',enabled:'yes-2026-launch',publicEnabled:'yes-2026-public-launch'});
 let owner=false,googleCalls=0;
 const options={client:()=>({auth:{getUser:async()=>({data:{user:{id:userId}}})},rpc:async name=>({data:name==='manee_android_push_context'?owner:name==='manee_android_account_context'?accountData('manee.store3.monthly'):name==='manee_android_billing_status'?{subscriptions:[]}:true})}),
  service:{},productionAccess,
  api:{product:async productId=>{googleCalls++;owner=false;return {...product,productId};}}};
 const handler=createHandler(options);
 assert.equal((await handler(req())).status,403);assert.equal(googleCalls,0);
 owner=true;assert.equal((await handler(req())).status,403);assert.equal(googleCalls,1);
});

test('account checkout keeps original Google profile binding when selected store changes',async()=>{
 const userId='11111111-1111-4111-8111-111111111111',billingStore='44444444-4444-4444-8444-444444444444';
 const ids=google.binding(userId,billingStore);let savedStore;
 const paidProduct=structuredClone(product);paidProduct.basePlans[0].regionalConfigs[0].price={currencyCode:'KRW',units:'9900'};
 const resource={subscriptionState:'SUBSCRIPTION_STATE_ACTIVE',acknowledgementState:'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED',externalAccountIdentifiers:{obfuscatedExternalAccountId:ids.accountId,obfuscatedExternalProfileId:ids.profileId},lineItems:[{productId:PRODUCT,offerDetails:{basePlanId:'monthly'},autoRenewingPlan:{},expiryTime:new Date(Date.now()+86400000).toISOString()}]};
 let owned=true;
 const handler=createHandler({client:()=>({auth:{getUser:async()=>({data:{user:{id:userId}}})},rpc:async(name,args)=>({data:name==='manee_android_push_context'?owned:name==='manee_android_account_context'?accountData(PRODUCT,billingStore):name==='manee_android_billing_status'?{subscriptions:[]}:name==='manee_android_billing_checkout_claim'?{status:'claimed'}:true})}),api:{product:async()=>paidProduct,get:async()=>resource},service:{rpc:async(name,args)=>{savedStore=args.p_store_id;return{data:true};}},productionAccess:async()=>true});
 const prepared=await(await handler(req({action:'prepare',storeId,checkoutId}))).json();
 assert.equal(prepared.billingScope,'account');assert.equal(prepared.profileId,ids.profileId);
 assert.equal((await handler(req({action:'verify',storeId,productId:PRODUCT,purchaseToken:'owned'}))).status,200);assert.equal(savedStore,billingStore);
 owned=false;assert.equal((await handler(req({action:'verify',storeId,productId:PRODUCT,purchaseToken:'owned'}))).status,403);
});

function diagnosticFixture({diagnostic,rpc:override=async()=>undefined,get,receipt,
 catalog,testAccess=async()=>true,productionAccess=async()=>false,save=true}={}){
 const userId='11111111-1111-4111-8111-111111111111';
 const ids=google.binding(userId,storeId);let saves=0,acks=0;
 const resource=receipt??{testPurchase:{},subscriptionState:'SUBSCRIPTION_STATE_ACTIVE',
  acknowledgementState:'ACKNOWLEDGEMENT_STATE_PENDING',
  externalAccountIdentifiers:{obfuscatedExternalAccountId:ids.accountId,obfuscatedExternalProfileId:ids.profileId},
  lineItems:[{productId:PRODUCT,offerDetails:{basePlanId:'monthly'},autoRenewingPlan:{},expiryTime:new Date(Date.now()+86400000).toISOString()}]};
 const paidProduct=structuredClone(product);paidProduct.basePlans[0].regionalConfigs[0].price={currencyCode:'KRW',units:'9900'};
 const handler=createHandler({diagnostic,testAccess,productionAccess,
  client:()=>({auth:{getUser:async()=>({data:{user:{id:userId}}})},rpc:async(name,args)=>{
   const result=await override(name,args);if(result!==undefined)return result;
   return{data:name==='manee_android_account_context'?accountData():
    name==='manee_android_billing_status'?{subscriptions:[]}:
    name==='manee_android_billing_checkout_claim'?{status:'claimed'}:true};
  }}),api:{get:get??(async()=>resource),product:catalog??(async()=>paidProduct),acknowledge:async()=>acks++},
  service:{rpc:async()=>{saves++;return{data:save};}}});
 return{handler,resource,saves:()=>saves,acks:()=>acks};
}

test('HTTP failures expose only fixed diagnostic fields and preserve guards and responses',async()=>{
 const cases=[
  {request:()=>req(undefined,{authorization:'Bearer secret-token',origin:'https://secret.example'}),status:403,error:'origin_denied',stage:'request',action:'unknown'},
  {request:()=>new Request('https://example.com',{method:'GET'}),status:405,error:'method_not_allowed',stage:'request',action:'unknown'},
  {request:()=>req(undefined,{}),status:401,error:'authentication_required',stage:'authentication',action:'unknown'},
  {request:()=>req({action:'secret-action',storeId,purchaseToken:'secret-receipt'}),status:400,error:'invalid_request',stage:'request',action:'unknown'},
  {request:()=>req(),options:{owner:false},status:403,error:'owner_access_denied',stage:'authorization',action:'status'},
 ];
 for(const c of cases){
  const events=[];const s=setup({...c.options,diagnostic:event=>events.push(event)});
  const response=await s.handler(c.request());
  assert.equal(response.status,c.status);assert.deepEqual(await response.json(),{error:c.error});
  assert.equal(response.headers.get('Cache-Control'),'no-store');
  assert.deepEqual(events,[{action:c.action,stage:c.stage,status:c.status,error:c.error,reason:'unknown'}]);
  assert.equal(Object.isFrozen(events[0]),true);assert.equal(s.calls(),0);
 }
 const events=[];const success=setup({diagnostic:event=>events.push(event)});
 assert.equal((await success.handler(req())).status,200);assert.deepEqual(events,[]);
});

test('billing failure diagnostics distinguish lookup, allocation, receipt and checkout boundaries',async()=>{
 const cases=[
  {action:'status',stage:'allocation',error:'billing_allocation_unavailable',options:{rpc:async name=>name==='manee_android_account_context'?{error:{message:'private-db-details'}}:undefined}},
  {action:'status',stage:'allocation',error:'billing_allocation_invalid',options:{rpc:async name=>name==='manee_android_account_context'?{data:accountData('private-product')}:undefined}},
  {action:'verify',stage:'verify_product_lookup',error:'subscription_unavailable',options:{get:async()=>{throw Error('subscription_unavailable');}}},
  {action:'verify',stage:'verify_allocation',error:'purchase_mismatch',options:{rpc:async(name,args)=>name==='manee_android_account_context'&&args.p_product_id?{data:accountData(PRODUCT,'private-store')}:undefined}},
  {action:'verify',stage:'verify_receipt',error:'save_failed',options:{save:false}},
  {action:'status',stage:'snapshot',error:'billing_status_unavailable',options:{rpc:async name=>name==='manee_android_billing_status'?{error:{message:'private-db-details'}}:undefined}},
  {action:'status',stage:'catalog',error:'unexpected',options:{catalog:async()=>{throw Error('private-provider-details');}}},
  {action:'prepare',stage:'checkout_gate',error:'billing_not_ready',options:{testAccess:async()=>false}},
  {action:'prepare',stage:'checkout_claim',error:'billing_unavailable',options:{testAccess:async()=>false,productionAccess:async()=>true,rpc:async name=>name==='manee_android_billing_checkout_claim'?{error:{message:'private-lock-details'}}:undefined}},
  {action:'prepare',stage:'checkout_claim',error:'checkout_in_progress',status:409,options:{testAccess:async()=>false,productionAccess:async()=>true,rpc:async name=>name==='manee_android_billing_checkout_claim'?{data:{status:'in_progress'}}:undefined}},
  {action:'release',stage:'checkout_release',error:'billing_unavailable',options:{rpc:async name=>name==='manee_android_billing_checkout_release'?{error:{message:'private-lock-details'}}:undefined}},
 ];
 for(const c of cases){
  const events=[];const fixture=diagnosticFixture({...c.options,diagnostic:event=>events.push(event)});
  const response=await fixture.handler(req({action:c.action,storeId,checkoutId,purchaseToken:'private-purchase-token'}));
  const status=c.status??503;
  assert.equal(response.status,status,c.stage);
  assert.deepEqual(await response.json(),{error:status===409?'checkout_in_progress':c.action==='prepare'&&c.error==='billing_not_ready'?'billing_not_ready':'billing_unavailable'},c.stage);
  assert.deepEqual(events,[{action:c.action,stage:c.stage,status,error:c.error,reason:'unknown'}]);
  assert.equal(fixture.acks(),0);assert.equal(fixture.saves(),c.error==='save_failed'?1:0);
 }
});

test('ordinary customer receipt mismatch logs keep exactly five fields without receipt data',async()=>{
 const changes=[
  ['account_binding_mismatch',r=>r.externalAccountIdentifiers.obfuscatedExternalAccountId='private-account-binding'],
  ['profile_binding_mismatch',r=>r.externalAccountIdentifiers.obfuscatedExternalProfileId='private-profile-binding'],
  ['subscription_shape_mismatch',r=>r.subscriptionState='private-state'],
  ['product_plan_mismatch',r=>r.lineItems[0].productId='private-product'],
  ['subscription_expiry_invalid',r=>r.lineItems[0].expiryTime='private-expiry'],
  ['acknowledgement_state_invalid',r=>r.acknowledgementState='private-ack'],
  ['linked_token_invalid',r=>r.linkedPurchaseToken='private-purchase-token'],
 ];
 for(const [reason,change]of changes){
  const events=[];const f=diagnosticFixture({diagnostic:event=>events.push(event),testAccess:async()=>false,productionAccess:async()=>true});change(f.resource);
  const response=await f.handler(req({action:'verify',storeId,productId:PRODUCT,purchaseToken:'private-purchase-token'}));
  const status=['account_binding_mismatch','profile_binding_mismatch'].includes(reason)?422:503;
  assert.equal(response.status,status);assert.deepEqual(await response.json(),{error:status===422?'purchase_binding_mismatch':'billing_unavailable'});
  assert.deepEqual(events,[{action:'verify',stage:'verify_receipt',status,error:'purchase_mismatch',reason}]);
  assert.equal(f.saves(),0);assert.equal(f.acks(),0);
  assert.doesNotMatch(JSON.stringify(events),/private-|11111111|22222222|manee\.store/);
 }
});

test('missing binding data is rejected without saving or acknowledging; matching bindings still verify',async()=>{
 for(const missing of ['account','profile']){
  const events=[];const f=diagnosticFixture({diagnostic:event=>events.push(event),testAccess:async()=>false,productionAccess:async()=>true});
  if(missing==='account')delete f.resource.externalAccountIdentifiers;
  else delete f.resource.externalAccountIdentifiers.obfuscatedExternalProfileId;
  const response=await f.handler(req({action:'verify',storeId,purchaseToken:'private-purchase-token'}));
  assert.equal(response.status,422);assert.deepEqual(await response.json(),{error:'purchase_binding_mismatch'});
  assert.deepEqual(events,[{action:'verify',stage:'verify_receipt',status:422,error:'purchase_mismatch',reason:missing+'_binding_mismatch'}]);
  assert.equal(f.saves(),0);assert.equal(f.acks(),0);
 }
 const events=[];const valid=diagnosticFixture({diagnostic:event=>events.push(event)});
 valid.resource.billingReason='account_binding_mismatch'; // Upstream fields cannot override real validation.
 const response=await valid.handler(req({action:'verify',storeId,purchaseToken:'private-purchase-token'}));
 assert.equal(response.status,200);
 const result=await response.json();assert.equal(result.verified,true);assert.equal(result.testActive,true);assert.equal(result.active,false);
 assert.equal(result.error,undefined);assert.equal(result.billingReason,undefined);
 assert.equal(valid.saves(),1);assert.equal(valid.acks(),1);assert.deepEqual(events,[]);
});

test('only verify with the exact mismatch message and binding reason receives the new response',async()=>{
 const cases=[
  {action:'verify',message:'save_failed',reason:'account_binding_mismatch'},
  {action:'verify',message:'purchase_mismatch',reason:'subscription_shape_mismatch'},
  {action:'verify',message:'purchase_mismatch',reason:'private-reason'},
  {action:'status',message:'purchase_mismatch',reason:'account_binding_mismatch'},
  {action:'prepare',message:'purchase_mismatch',reason:'profile_binding_mismatch'},
  {action:'release',message:'purchase_mismatch',reason:'account_binding_mismatch'},
 ];
 for(const c of cases){
  const cause=Object.assign(Error(c.message),{billingReason:c.reason});
  const fail=async()=>{throw cause;};
  const f=diagnosticFixture(c.action==='release'
   ? {rpc:async name=>name==='manee_android_billing_checkout_release'?fail():undefined}
   : c.action==='verify'?{get:fail}:{catalog:fail});
  const response=await f.handler(req({action:c.action,storeId,checkoutId,purchaseToken:'private-purchase-token'}));
  assert.equal(response.status,503,c.action+':'+c.message+':'+c.reason);
  assert.deepEqual(await response.json(),{error:'billing_unavailable'});
  assert.equal(f.saves(),0);assert.equal(f.acks(),0);
 }
 const denied=diagnosticFixture({rpc:async name=>name==='manee_android_push_context'?{data:false}:undefined});
 delete denied.resource.externalAccountIdentifiers;
 const response=await denied.handler(req({action:'verify',storeId,purchaseToken:'private-purchase-token'}));
 assert.equal(response.status,403);assert.deepEqual(await response.json(),{error:'owner_access_denied'});
 assert.equal(denied.saves(),0);assert.equal(denied.acks(),0);
});

test('untrusted errors, accessors and secret tokens never enter diagnostics or responses',async()=>{
 const secret='PRIVATE_TOKEN_RECEIPT_UID_STORE_DB_HEADERS_BODY';
 const hostile=Object.assign(Error(secret),{billingReason:secret,stack:secret,headers:{authorization:secret},body:secret});
 let reads=0;
 const changingReason={message:'purchase_mismatch',get billingReason(){return++reads===1?'account_binding_mismatch':secret;}};
 const cases=[
  {cause:hostile,error:'unexpected',reason:'unknown'},
  {cause:{message:'purchase_mismatch',billingReason:secret},error:'purchase_mismatch',reason:'unknown'},
  {cause:{get message(){throw Error(secret);},get billingReason(){throw Error(secret);}},error:'unexpected',reason:'unknown'},
  {cause:changingReason,error:'purchase_mismatch',reason:'account_binding_mismatch',status:422},
 ];
 for(const c of cases){
  const events=[];const f=diagnosticFixture({get:async()=>{throw c.cause;},diagnostic:event=>events.push(event)});
  const response=await f.handler(req({action:'verify',storeId,purchaseToken:secret},{authorization:'Bearer '+secret,'x-private-header':secret}));
  const status=c.status??503;
  const text=await response.text();assert.equal(response.status,status);assert.equal(text,JSON.stringify({error:status===422?'purchase_binding_mismatch':'billing_unavailable'}));
  assert.deepEqual(events,[{action:'verify',stage:'verify_product_lookup',status,error:c.error,reason:c.reason}]);
  assert.ok(!JSON.stringify(events).includes(secret));assert.ok(!text.includes(secret));assert.equal(f.saves(),0);assert.equal(f.acks(),0);
 }
 assert.equal(reads,1);
});

test('throwing or rejecting diagnostic callbacks cannot change failure responses or checkout locks',async()=>{
 for(const diagnostic of [()=>{throw Error('private-log-failure');},async()=>{throw Error('private-log-rejection');}]){
  let claims=0;
  const f=diagnosticFixture({diagnostic,testAccess:async()=>false,productionAccess:async()=>true,
   rpc:async name=>name==='manee_android_billing_checkout_claim'?(claims++,{data:{status:'in_progress'}}):undefined});
  const response=await f.handler(req({action:'prepare',storeId,checkoutId}));
  assert.equal(response.status,409);assert.deepEqual(await response.json(),{error:'checkout_in_progress'});
  assert.equal(claims,1);assert.equal(f.saves(),0);assert.equal(f.acks(),0);
 }
 await new Promise(resolve=>setImmediate(resolve));
});

const fixedReceiptFacts=()=>({accountBinding:'missing',profileBinding:'missing',environment:'Sandbox',
 state:'SUBSCRIPTION_STATE_ACTIVE',expiry:'future',outOfAppResubscription:'present',orderReference:'fa4c0a43cbffdc5a'});
test('only approved test owners get sanitized receipt facts; HTTP replies and receipt guards stay unchanged',async()=>{
 const base='GPA.1234-1234-1234-12345',privateValue='PRIVATE_PROVIDER_TOKEN_EMAIL_BINDING';
 for(const access of [true,false,undefined,'true',1]){
  const events=[];const f=diagnosticFixture({diagnostic:event=>events.push(event),testAccess:async()=>access,productionAccess:async()=>true});
  delete f.resource.externalAccountIdentifiers;
  f.resource.outOfAppPurchaseContext={expiredPurchaseToken:privateValue,obfuscatedExternalAccountId:privateValue};
  f.resource.lineItems[0].latestSuccessfulOrderId=base+'..1';
  f.resource.latestOrderId='GPA.9999-9999-9999-99999..2';
  const response=await f.handler(req({action:'verify',storeId,productId:PRODUCT,purchaseToken:privateValue}));
  const body=await response.text();assert.equal(response.status,422);assert.equal(body,'{"error":"purchase_binding_mismatch"}');
  const basic={action:'verify',stage:'verify_receipt',status:422,error:'purchase_mismatch',reason:'account_binding_mismatch'};
  assert.deepEqual(events,[{...basic,...(access===true?{receiptFacts:fixedReceiptFacts()}:{})}]);
  if(access===true)assert.equal(Object.isFrozen(events[0].receiptFacts),true);
  for(const sensitive of [privateValue,base,f.resource.latestOrderId,storeId,'11111111-1111-4111-8111-111111111111']){
   assert.equal(body.includes(sensitive),false);assert.equal(JSON.stringify(events).includes(sensitive),false);
  }
  assert.equal(f.saves(),0);assert.equal(f.acks(),0);
 }
 const events=[];const shape=diagnosticFixture({diagnostic:event=>events.push(event)});
 shape.resource.subscriptionState='PRIVATE_STATE';
 const response=await shape.handler(req({action:'verify',storeId,productId:PRODUCT,purchaseToken:privateValue}));
 assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:'billing_unavailable'});
 assert.equal(events[0].receiptFacts.state,'unknown');assert.equal(events[0].receiptFacts.outOfAppResubscription,'absent');
 assert.equal(shape.saves(),0);assert.equal(shape.acks(),0);
});
test('receipt fact allowlist snapshots hostile properties once and omits invalid or unrelated facts',async()=>{
 const secret='PRIVATE_RECEIPT_ORDER_UID_DB_VALUE';const counts={};
 const changing={};for(const [key,value]of Object.entries(fixedReceiptFacts()))
  Object.defineProperty(changing,key,{get(){counts[key]=(counts[key]??0)+1;return counts[key]===1?value:secret;}});
 changing.privateReceipt=secret;changing.toJSON=()=>secret;
 let factReads=0,messageReads=0,reasonReads=0;
 const cause={get message(){messageReads++;return messageReads===1?'purchase_mismatch':secret;},
  get billingReason(){reasonReads++;return reasonReads===1?'account_binding_mismatch':secret;},
  get receiptFacts(){factReads++;return factReads===1?changing:{privateReceipt:secret};}};
 const events=[];const f=diagnosticFixture({get:async()=>{throw cause;},diagnostic:event=>events.push(event)});
 const response=await f.handler(req({action:'verify',storeId,purchaseToken:secret}));
 assert.equal(response.status,422);assert.equal(await response.text(),'{"error":"purchase_binding_mismatch"}');
 assert.deepEqual(events,[{action:'verify',stage:'verify_product_lookup',status:422,error:'purchase_mismatch',
  reason:'account_binding_mismatch',receiptFacts:fixedReceiptFacts()}]);
 assert.deepEqual(Object.values(counts),[1,1,1,1,1,1,1]);
 assert.equal(factReads,1);assert.equal(messageReads,1);assert.equal(reasonReads,1);
 assert.equal(JSON.stringify(events).includes(secret),false);
 const invalid=[null,secret,new Proxy({},{get(){throw Error(secret);}})];
 for(const key of Object.keys(fixedReceiptFacts()))invalid.push({...fixedReceiptFacts(),[key]:secret});
 invalid.push({...fixedReceiptFacts(),orderReference:'fa4c0a43cbffdc5a\n'},
  {...fixedReceiptFacts(),orderReference:{toString(){throw Error(secret);}}});
 for(const facts of invalid){
  const logs=[];const fixture=diagnosticFixture({get:async()=>{throw{message:'purchase_mismatch',billingReason:'account_binding_mismatch',receiptFacts:facts};},diagnostic:event=>logs.push(event)});
  const failed=await fixture.handler(req({action:'verify',storeId,purchaseToken:secret}));
  assert.equal(failed.status,422);assert.equal(await failed.text(),'{"error":"purchase_binding_mismatch"}');
  assert.deepEqual(logs,[{action:'verify',stage:'verify_product_lookup',status:422,error:'purchase_mismatch',reason:'account_binding_mismatch'}]);
 }
 for(const access of [false,undefined,'true']){
  let reads=0;const logs=[];
  const fixture=diagnosticFixture({testAccess:async()=>access,productionAccess:async()=>true,diagnostic:event=>logs.push(event),
   get:async()=>{throw{message:'purchase_mismatch',billingReason:'account_binding_mismatch',get receiptFacts(){reads++;throw Error(secret);}};}});
  const failed=await fixture.handler(req({action:'verify',storeId,purchaseToken:secret}));
  assert.equal(failed.status,422);assert.equal(reads,0);assert.equal(Object.keys(logs[0]).length,5);
 }
 for(const [action,error]of [['status','purchase_mismatch'],['prepare','purchase_mismatch'],['release','purchase_mismatch'],['verify','save_failed']]){
  let reads=0;const failure={message:error,billingReason:'account_binding_mismatch',get receiptFacts(){reads++;return fixedReceiptFacts();}};
  const fail=async()=>{throw failure;};const logs=[];
  const fixture=diagnosticFixture({diagnostic:event=>logs.push(event),
   ...(action==='release'?{rpc:async name=>name==='manee_android_billing_checkout_release'?fail():undefined}:
    action==='verify'?{get:fail}:{catalog:fail})});
  const failed=await fixture.handler(req({action,storeId,checkoutId,purchaseToken:secret}));
  assert.equal(failed.status,503);assert.equal(reads,0);assert.equal(Object.keys(logs[0]).length,5);
 }
});
