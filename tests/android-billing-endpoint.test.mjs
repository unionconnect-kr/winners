import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import google from '../netlify/functions/lib/google-play-billing.cjs';
import {createHandler,PRODUCT} from '../supabase/functions/manee-android-billing/handler.mjs';
const storeId='22222222-2222-4222-8222-222222222222';
const checkoutId='33333333-3333-4333-8333-333333333333';
const product={packageName:'kr.co.manee.app',productId:PRODUCT,basePlans:[{basePlanId:'monthly',state:'ACTIVE',autoRenewingBasePlanType:{billingPeriodDuration:'P1M'},regionalConfigs:[{regionCode:'KR',newSubscriberAvailability:true}]}]};
const req=(body={action:'status',storeId},headers={authorization:'Bearer test-token'})=>new Request('https://example.com',{method:'POST',headers,body:JSON.stringify(body)});
function setup({auth=true,owner=true,resource=product}={}){
 let calls=0,checks=0;
 const handler=createHandler({client:()=>({auth:{getUser:async()=>({data:{user:auth?{id:'user'}:null}})},rpc:async name=>({data:name==='manee_android_billing_status'?{subscriptions:[]}:typeof owner==='function'?owner(++checks):owner})}),api:{product:async()=>{calls++;return resource;}}});
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
 const options={client:()=>({auth:{getUser:async()=>({data:{user:{id:userId}}})},rpc:async name=>({data:name==='manee_android_billing_product'?PRODUCT:name==='manee_android_billing_status'?{subscriptions:[]}:true})}),api:{get:async()=>resource,acknowledge:async()=>acks++},service:{rpc:async()=>{saves++;return {data:true};}}};
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
 const options={client:()=>({auth:{getUser:async()=>({data:{user:{id:userId}}})},
  rpc:async name=>({data:name==='manee_android_billing_product'?PRODUCT:name==='manee_android_billing_status'?{subscriptions:[]}:name==='manee_android_billing_checkout_claim'?{status:'claimed'}:true})}),
  api:{product:async()=>product,get:async()=>resource,acknowledge:async()=>acks++},
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
  if(name==='manee_android_billing_product')return{data:PRODUCT};
  if(name==='manee_android_billing_status')return{data:{subscriptions:[]}};
  if(name==='manee_android_billing_checkout_claim')return{data:{status}};
  if(name==='manee_android_billing_checkout_release'){
   released=args.p_checkout_id===checkoutId;return{data:released};
  }
  return{data:true};
 };
 const handler=createHandler({client:()=>({auth:{getUser:async()=>({data:{user:{id:userId}}})},rpc}),
  api:{product:async()=>product},service:{},productionAccess:async()=>true});
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

test('test readiness and prepare are scoped to the approved store and rechecked after Google',async()=>{
 const userId='11111111-1111-4111-8111-111111111111';let access=true,checks=0;
 const options={client:()=>({auth:{getUser:async()=>({data:{user:{id:userId}}})},rpc:async name=>({data:name==='manee_android_billing_product'?PRODUCT:name==='manee_android_billing_status'?{subscriptions:[]}:true})}),
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
 calls.push({name,args});return name==='manee_android_billing_product'?{data:PRODUCT}:name==='manee_android_billing_status'?{data:{subscriptions},error:failed?{}:null}:{data:true};
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
 const h=createHandler({client:()=>({auth:{getUser:async()=>({data:{user:{id:'11111111-1111-4111-8111-111111111111'}}})},rpc:async name=>({data:name==='manee_android_billing_product'?sku:name==='manee_android_billing_status'?{subscriptions:[]}:true})}),api:{product:async id=>{queried=id;return {...product,productId:id};}},service:{},testAccess:async()=>true});
 const r=await(await h(req({action:'prepare',storeId,productId:'attacker'}))).json();assert.equal(r.productId,sku);assert.equal(queried,sku);
 sku=null;assert.equal((await(await h(req())).json()).reason,'additional_store_not_ready');
 assert.equal((await h(req({action:'prepare',storeId}))).status,503);
});
