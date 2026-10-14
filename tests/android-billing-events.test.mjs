import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPair,SignJWT,jwtVerify} from 'jose';
import {createPushAuthenticator} from '../supabase/functions/manee-play-notifications/auth.mjs';
import {createNotificationHandler} from '../supabase/functions/manee-play-notifications/handler.mjs';
import {createRefreshHandler} from '../supabase/functions/manee-billing-refresh/handler.mjs';
import {binding} from '../supabase/functions/manee-android-billing/google-play.mjs';
const audience='https://example.com/notification',email='push@example.iam.gserviceaccount.com';
const {publicKey,privateKey}=await generateKeyPair('RS256');
const auth=createPushAuthenticator({email,audience,verifyJwt:(token,options)=>jwtVerify(token,publicKey,options)});
const signed=(changes={})=>new SignJWT({email,email_verified:true,...changes}).setProtectedHeader({alg:'RS256'}).setIssuer('https://accounts.google.com').setAudience(audience).setSubject('123').setIssuedAt().setExpirationTime('1h').sign(privateKey);
test('push identity uses signature, audience, expiry and verified email',async()=>{
 assert.equal(await auth(await signed()),true);
 for(const claims of [{email:'wrong@example.com'},{email_verified:false},{exp:1}])await assert.rejects(auth(await signed(claims).then(async token=>claims.exp?new SignJWT({email,email_verified:true}).setProtectedHeader({alg:'RS256'}).setIssuer('https://accounts.google.com').setAudience(audience).setSubject('123').setIssuedAt().setExpirationTime(1).sign(privateKey):token)));
 const wrong=await new SignJWT({email,email_verified:true}).setProtectedHeader({alg:'RS256'}).setIssuer('https://accounts.google.com').setAudience('wrong').setSubject('123').setIssuedAt().setExpirationTime('1h').sign(privateKey);
 await assert.rejects(auth(wrong));await assert.rejects(auth('forged.jwt.value'));
});
const subscription='projects/test/subscriptions/events';
const event={packageName:'kr.co.manee.app',subscriptionNotification:{purchaseToken:'receipt',notificationType:3}};
const request=(data=event,sub=subscription)=>new Request(audience,{method:'POST',headers:{authorization:'Bearer token'},body:JSON.stringify({subscription:sub,message:{messageId:'12345',data:btoa(JSON.stringify(data))}})});
test('notifications enqueue tokens only; bad identity/package/subscription and DB failures fail closed',async()=>{
 const calls=[];let dbError=false;
 const handler=createNotificationHandler({authenticate:async()=>true,subscription,client:{rpc:async(name,args)=>{calls.push({name,args});return dbError?{error:{}}:{data:true};}}});
 assert.equal((await handler(request())).status,200);assert.deepEqual(calls[0],{name:'manee_billing_enqueue',args:{p_message_id:'12345',p_token:'receipt'}});
 assert.equal((await handler(request({...event,packageName:'wrong'}))).status,400);
 assert.equal((await handler(request(event,'wrong'))).status,400);
 const testEvent=await handler(request({packageName:'kr.co.manee.app',testNotification:{version:'1'}}));assert.equal(testEvent.status,200);assert.equal(calls.length,1);
 dbError=true;assert.equal((await handler(request())).status,503);
 const denied=createNotificationHandler({authenticate:async()=>{throw Error();},subscription,client:null});assert.equal((await denied(request())).status,401);
});
const user='11111111-1111-4111-8111-111111111111',store='22222222-2222-4222-8222-222222222222',ids=binding(user,store);
const job={purchase_token:'receipt',user_id:user,store_id:store,lease_id:'lease',product_id:'manee.store1.monthly',environment:'Sandbox'};
const google={testPurchase:{},subscriptionState:'SUBSCRIPTION_STATE_EXPIRED',acknowledgementState:'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED',externalAccountIdentifiers:{obfuscatedExternalAccountId:ids.accountId,obfuscatedExternalProfileId:ids.profileId},lineItems:[{productId:'manee.store1.monthly',offerDetails:{basePlanId:'monthly'},autoRenewingPlan:{},expiryTime:new Date(Date.now()-1000).toISOString()}]};
const refreshRequest=()=>new Request('https://example.com',{method:'POST',headers:{authorization:'Bearer '+'a'.repeat(64)}});
test('refresh queries Google afresh; expired subscriptions persist without acknowledgement',async()=>{
 const calls=[];const handler=createRefreshHandler({api:{get:async()=>{calls.push('google');return google;},acknowledge:async()=>{throw Error('must not ack');}},client:{rpc:async(name,args)=>{calls.push(name);if(name==='manee_billing_claim')return {data:[job]};if(name==='manee_android_billing_save')assert.equal(args.p_record.active,false);return {data:true};}}});
 assert.deepEqual(await (await handler(refreshRequest())).json(),{claimed:1,refreshed:1,retry:0,unrecorded:0});assert.deepEqual(calls,['manee_billing_claim','google','manee_android_billing_save','manee_billing_finish']);
});
test('invalid scheduler cannot query Google and transient failures are retried',async()=>{
 let queried=0,finished;
 const api={get:async()=>{queried++;throw Error('outage');}};
 const denied=createRefreshHandler({api,client:{rpc:async()=>({error:{code:'42501'}})}});assert.equal((await denied(refreshRequest())).status,403);assert.equal(queried,0);
 const retry=createRefreshHandler({api,client:{rpc:async(name,args)=>{if(name==='manee_billing_claim')return {data:[job]};finished=args.p_success;return {data:true};}}});
 assert.equal((await (await retry(refreshRequest())).json()).retry,1);assert.equal(finished,false);
});
test('renewal worker verifies the persisted product of an additional store',async()=>{
 const resource=structuredClone(google);resource.lineItems[0].productId='manee.store2.monthly';let saved;
 const handler=createRefreshHandler({api:{get:async()=>resource},client:{rpc:async(name,args)=>{
 if(name==='manee_billing_claim')return{data:[{...job,product_id:'manee.store2.monthly'}]};
 if(name==='manee_android_billing_save')saved=args.p_record.productId;
 return{data:true};
 }}});
 assert.equal((await(await handler(refreshRequest())).json()).refreshed,1);assert.equal(saved,'manee.store2.monthly');
});

test('production renewal is refreshed only when the claimed environment matches Google',async()=>{
 const paid=structuredClone(google);delete paid.testPurchase;
 paid.subscriptionState='SUBSCRIPTION_STATE_ACTIVE';paid.acknowledgementState='ACKNOWLEDGEMENT_STATE_PENDING';
 paid.lineItems[0].expiryTime=new Date(Date.now()+86400000).toISOString();
 let saved=0,ack=0,lastSuccess;
 const handler=createRefreshHandler({api:{get:async()=>paid,acknowledge:async()=>{assert.equal(saved,1);ack++;}},client:{rpc:async(name,args)=>{
  if(name==='manee_billing_claim')return{data:[{...job,environment:'Production'}]};
  if(name==='manee_android_billing_save'){assert.equal(args.p_record.environment,'Production');saved++;return{data:true};}
  lastSuccess=args.p_success;return{data:true};
 }}});
 assert.equal((await(await handler(refreshRequest())).json()).refreshed,1);assert.equal(lastSuccess,true);assert.equal(ack,1);
 paid.testPurchase={};saved=0;ack=0;
 assert.equal((await(await handler(refreshRequest())).json()).retry,1);assert.equal(saved,0);assert.equal(ack,0);assert.equal(lastSuccess,false);
});
