import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import google from '../netlify/functions/lib/google-play-billing.cjs';
import {createHandler,PRODUCT} from '../supabase/functions/manee-android-billing/handler.mjs';
const storeId='22222222-2222-4222-8222-222222222222';
const product={packageName:'kr.co.manee.app',productId:PRODUCT,basePlans:[{basePlanId:'monthly',state:'ACTIVE',autoRenewingBasePlanType:{billingPeriodDuration:'P1M'},regionalConfigs:[{regionCode:'KR',newSubscriberAvailability:true}]}]};
const req=(body={action:'status',storeId},headers={authorization:'Bearer test-token'})=>new Request('https://example.com',{method:'POST',headers,body:JSON.stringify(body)});
function setup({auth=true,owner=true,resource=product}={}){
 let calls=0,checks=0;
 const handler=createHandler({client:()=>({auth:{getUser:async()=>({data:{user:auth?{id:'user'}:null}})},rpc:async()=>({data:typeof owner==='function'?owner(++checks):owner})}),api:{product:async()=>{calls++;return resource;}}});
 return {handler,calls:()=>calls};
}
test('anonymous, invalid sessions and nonowners cannot query Google',async()=>{
 for(const options of [{auth:false},{owner:false}]){const s=setup(options);assert.ok([401,403].includes((await s.handler(req())).status));assert.equal(s.calls(),0);}
 const s=setup();assert.equal((await s.handler(req(undefined,{}))).status,401);assert.equal(s.calls(),0);
});
test('valid catalog never enables checkout; prepare and verify remain gated',async()=>{
 const s=setup();assert.deepEqual(await (await s.handler(req())).json(),{ready:false,catalogReady:true,productId:PRODUCT,basePlanId:'monthly'});
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
 assert.equal(edge,source.replace("'use strict';\nconst {createHash,createPrivateKey,sign}=require('node:crypto');","// Generated from netlify/functions/lib/google-play-billing.cjs; keep parity test passing.\nimport {createHash,createPrivateKey,sign} from 'node:crypto';").replace('module.exports={PACKAGE,binding,createGooglePlayApi,verifiedRecord,verifyAndPersist};','export {PACKAGE,binding,createGooglePlayApi,verifiedRecord,verifyAndPersist};'));
});
test('only explicitly allowed owners can verify sandbox receipts through the endpoint',async()=>{
 const userId='11111111-1111-4111-8111-111111111111';const ids=google.binding(userId,storeId);let saves=0,acks=0;
 const resource={testPurchase:{},subscriptionState:'SUBSCRIPTION_STATE_ACTIVE',acknowledgementState:'ACKNOWLEDGEMENT_STATE_PENDING',externalAccountIdentifiers:{obfuscatedExternalAccountId:ids.accountId,obfuscatedExternalProfileId:ids.profileId},lineItems:[{productId:PRODUCT,offerDetails:{basePlanId:'monthly'},autoRenewingPlan:{},expiryTime:new Date(Date.now()+86400000).toISOString()}]};
 const options={client:()=>({auth:{getUser:async()=>({data:{user:{id:userId}}})},rpc:async()=>({data:true})}),api:{get:async()=>resource,acknowledge:async()=>acks++},service:{rpc:async()=>{saves++;return {data:true};}}};
 assert.equal((await createHandler(options)(req({action:'verify',storeId,purchaseToken:'test'}))).status,503);
 assert.equal(saves,0);assert.equal(acks,0);
 const handler=createHandler({...options,testAccess:async()=>true});
 const response=await handler(req({action:'verify',storeId,purchaseToken:'test'}));assert.equal(response.status,200);assert.equal((await response.json()).testActive,true);assert.equal(acks,1);
 delete resource.testPurchase;
 assert.equal((await handler(req({action:'verify',storeId,purchaseToken:'paid'}))).status,503);assert.equal(saves,1);assert.equal(acks,1);
});

test('test readiness and prepare are scoped to the approved store and rechecked after Google',async()=>{
 const userId='11111111-1111-4111-8111-111111111111';let access=true,checks=0;
 const options={client:()=>({auth:{getUser:async()=>({data:{user:{id:userId}}})},rpc:async()=>({data:true})}),
 api:{product:async()=>product},service:{},testAccess:async({storeId:s})=>{checks++;return access&&s===storeId;}};
 const h=createHandler(options);
 const ready=await(await h(req())).json();assert.equal(ready.ready,true);assert.equal(ready.testOnly,true);
 const prep=await(await h(req({action:'prepare',storeId}))).json();assert.deepEqual({accountId:prep.accountId,profileId:prep.profileId},google.binding(userId,storeId));
 assert.equal((await h(req({action:'prepare',storeId:'33333333-3333-4333-8333-333333333333'}))).status,503);
 access=false;assert.equal((await(await h(req())).json()).ready,false);
 access=true;options.api.product=async()=>{access=false;return product;};
 assert.equal((await h(req({action:'prepare',storeId}))).status,503);assert.ok(checks>4);
});
