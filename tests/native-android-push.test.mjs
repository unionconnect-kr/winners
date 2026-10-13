import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, verify } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createHandler } from '../supabase/functions/manee-android-push/handler.mjs';
import { firebaseCredentials, createFcmSender } from '../supabase/functions/manee-android-push/fcm.mjs';
const storeId='00000000-0000-4000-8000-000000000101';
const raw=JSON.stringify({type:'service_account',project_id:'manee-test',client_email:'push@manee-test.iam.gserviceaccount.com',private_key:generateKeyPairSync('rsa',{modulusLength:2048}).privateKey.export({format:'pem',type:'pkcs8'})});
const credentials=firebaseCredentials(raw);
test('business FCM content is fixed, expires, and uses a stable notification tag',async()=>{
 let message;
 const send=createFcmSender(credentials,async(url,request)=>{
  if(url.includes('oauth2'))return Response.json({access_token:'fake',expires_in:3600});
  message=JSON.parse(request.body).message;return Response.json({name:'projects/test/messages/2'});
 });
 await send('AbCdEF:0123456789_TestTOKEN',storeId,{id:storeId,kind:'reservation_created',ttl:100,title:'private customer'});
 assert.equal(message.notification.title,'매니 · 예약 등록');assert.equal(message.android.ttl,'100s');
 assert.equal(message.android.notification.tag,storeId);assert.equal(JSON.stringify(message).includes('private customer'),false);
 await assert.rejects(()=>send('AbCdEF:0123456789_TestTOKEN',storeId,{id:storeId,kind:'unknown',ttl:10}));
});
test('FCM signing works without a Node global Buffer in the Edge runtime',()=>{
 const script = `
  import { generateKeyPairSync } from 'node:crypto';
  import { firebaseCredentials, createFcmSender } from './supabase/functions/manee-android-push/fcm.mjs';
  const private_key=generateKeyPairSync('rsa',{modulusLength:2048}).privateKey.export({format:'pem',type:'pkcs8'});
  const c=firebaseCredentials(JSON.stringify({type:'service_account',project_id:'manee-test',client_email:'push@manee-test.iam.gserviceaccount.com',private_key}));
  globalThis.Buffer=undefined;
  let requests=0;
  const send=createFcmSender(c,async url=>{requests++;return {ok:true,status:200,json:async()=>url.includes('oauth2')?{access_token:'fake',expires_in:3600}:{name:'projects/test/messages/1'}};});
  const result=await send('AbCdEF:0123456789_TestTOKEN','00000000-0000-4000-8000-000000000101');
  if(!result.sent||requests!==2)throw Error('Expected OAuth and FCM delivery');
 `;
 execFileSync(process.execPath,['--input-type=module','-e',script],{cwd:new URL('../',import.meta.url),stdio:'pipe'});
});
function harness(options={}){
 const calls=[];
 const user={auth:{getUser:async()=>({data:options.noAuth?null:{user:{id:'u1'}}})},rpc:async(name,args)=>{
  calls.push([name,args]);
  return {data:name==='manee_android_push_test_target'?'OnlySelf:0123456789_AbCd':!options.denied,error:options.limited&&name==='manee_android_push_test_target'?{}:null};
 }};
 const handler=createHandler({staging:options.production!==true,credentials:options.unconfigured?null:credentials,client:()=>user,send:async(token,sid)=>{calls.push(['send',token,sid]);return {sent:true};}});
 const req=(body={},headers={})=>new Request('https://test.invalid',{method:'POST',headers:{authorization:'Bearer valid.jwt',...headers},body:JSON.stringify({action:'status',storeId,projectId:'manee-test',...body})});
 return {handler,calls,req};
}
test('push endpoint fails closed for missing auth, wrong origin, revoked owner and production',async()=>{
 for(const options of [{noAuth:true},{denied:true},{production:true}]){const h=harness(options);assert.ok((await h.handler(h.req({action:'test'}))).status>=400);assert.equal(h.calls.some(c=>c[0]==='send'),false);}
 const h=harness();assert.equal((await h.handler(h.req({}, {authorization:''}))).status,401);assert.equal((await h.handler(h.req({}, {origin:'https://attacker.invalid'}))).status,403);
});
test('not-ready and mismatched Firebase project do not claim readiness or send',async()=>{
 const h=harness({unconfigured:true});assert.equal((await (await h.handler(h.req())).json()).ready,false);
 const h2=harness();assert.equal((await (await h2.handler(h2.req({projectId:'other-project',action:'test'}))).json()).ready,false);
 assert.equal(h2.calls.some(c=>c[0]==='send'),false);
});
test('test recipient comes only from authenticated session RPC and observes cooldown',async()=>{
 const h=harness();const result=await h.handler(h.req({action:'test',token:'OtherToken',userId:'other',title:'ignore this'}));
 assert.equal(result.status,200);assert.deepEqual(h.calls.at(-1),['send','OnlySelf:0123456789_AbCd',storeId]);
 const limited=harness({limited:true});assert.equal((await limited.handler(limited.req({action:'test'}))).status,429);assert.equal(limited.calls.some(c=>c[0]==='send'),false);
});
test('FCM uses signed short-lived OAuth, fixed staging package and generic content; UNREGISTERED is distinguished',async()=>{
 assert.equal(firebaseCredentials('bad'),null);assert.equal(firebaseCredentials('{}'),null);
 const calls=[];let expired=false;
 const send=createFcmSender(credentials,async(url,request)=>{
  calls.push({url,request});
  if(url.includes('oauth2')){
   const [head,body,sig]=request.body.get('assertion').split('.');
   assert.ok(verify('RSA-SHA256',Buffer.from(head+'.'+body),credentials.key,Buffer.from(sig,'base64url')));
   const claim=JSON.parse(Buffer.from(body,'base64url'));assert.equal(claim.exp-claim.iat,3600);assert.equal(claim.scope,'https://www.googleapis.com/auth/firebase.messaging');
   return Response.json({access_token:'fake',expires_in:3600});
  }
  const message=JSON.parse(request.body).message;assert.equal(message.android.restricted_package_name,'kr.co.manee.app.staging');assert.equal(message.token,'AbCdEF:0123456789_TestTOKEN');
  assert.equal(message.notification.body,'안드로이드 알림이 연결됐어요.');
  return expired?Response.json({error:{details:[{'@type':'type.googleapis.com/google.firebase.fcm.v1.FcmError',errorCode:'UNREGISTERED'}]}},{status:404}):Response.json({name:'projects/test/messages/1'});
 });
 assert.equal((await send('AbCdEF:0123456789_TestTOKEN',storeId)).sent,true);expired=true;
 assert.equal((await send('AbCdEF:0123456789_TestTOKEN',storeId)).expired,true);assert.equal(calls.filter(c=>c.url.includes('oauth2')).length,1);
});
