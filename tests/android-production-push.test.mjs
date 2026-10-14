import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {generateKeyPairSync} from 'node:crypto';
import {androidPushDeployment} from '../supabase/functions/manee-android-push/environment.mjs';
import {createHandler} from '../supabase/functions/manee-android-push/handler.mjs';
import {createDeliveryHandler} from '../supabase/functions/manee-android-delivery/handler.mjs';
import {createFcmSender} from '../supabase/functions/manee-android-push/fcm.mjs';
const environments=JSON.parse(readFileSync(new URL('../config/environments.json',import.meta.url)));
const firebase=JSON.parse(readFileSync(new URL('../config/android-firebase.json',import.meta.url)));
const credentials={project:firebase.production.projectId};
const deployment=androidPushDeployment(environments.production.supabaseUrl,credentials,true);
const storeId='00000000-0000-4000-8000-000000000101';
const req=body=>new Request('https://example.invalid',{method:'POST',headers:{authorization:'Bearer valid.jwt',origin:'https://localhost'},
 body:JSON.stringify({action:'test',storeId,projectId:firebase.production.projectId,...body})});
test('server mappings agree with the client and require an explicit production gate',()=>{
 for(const env of ['production','staging']){
  const d=androidPushDeployment(environments[env].supabaseUrl,{project:firebase[env].projectId},true);
  assert.equal(d.environment,env);assert.equal(d.projectId,firebase[env].projectId);assert.equal(d.packageName,firebase[env].packageName);
 }
 assert.equal(androidPushDeployment(environments.production.supabaseUrl,credentials),null);
 assert.equal(androidPushDeployment(environments.production.supabaseUrl,credentials,'true'),null);
 assert.equal(androidPushDeployment('https://attacker.invalid',credentials,true),null);
 assert.equal(androidPushDeployment(environments.production.supabaseUrl,{project:'manee-staging'},true),null);
 assert.equal(androidPushDeployment(environments.staging.supabaseUrl,credentials,true),null);
});
test('production test notification still requires live owner access and resolves its recipient on the server',async()=>{
 const calls=[];let allowed=true;
 const handler=createHandler({deployment,credentials,client:()=>({auth:{getUser:async()=>({data:{user:{id:'owner'}}})},
  rpc:async name=>({data:name==='manee_android_push_context'?allowed:'CurrentSessionToken'})}),
  send:async(...args)=>{calls.push(args);return {sent:true};}});
 assert.equal((await handler(req({token:'untrusted-recipient'}))).status,200);
 assert.deepEqual(calls,[['CurrentSessionToken',storeId]]);
 allowed=false;assert.equal((await handler(req())).status,403);assert.equal(calls.length,1);
});
test('wrong project or missing credentials cannot report readiness or send',async()=>{
 for(const c of [null,{project:'manee-staging'}]){
  let sent=0;
  const handler=createHandler({deployment,credentials:c,client:()=>({auth:{getUser:async()=>({data:{user:{id:'owner'}}})},rpc:async()=>({data:true})}),
   send:async()=>{sent++;return {sent:true};}});
  assert.equal((await (await handler(req())).json()).ready,false);assert.equal(sent,0);
 }
});
test('production scheduler rejects mismatched credentials before claiming jobs',async()=>{
 let claims=0;
 const request=()=>new Request('https://example.invalid',{method:'POST',headers:{authorization:'Bearer '+'a'.repeat(64)}});
 const client={rpc:async()=>{claims++;return {data:[]};}};
 const wrong=createDeliveryHandler({deployment,credentials:{project:'manee-staging'},client,send:async()=>({sent:true})});
 assert.equal((await wrong(request())).status,503);assert.equal(claims,0);
 const correct=createDeliveryHandler({deployment,credentials,client,send:async()=>({sent:true})});
 assert.equal((await correct(request())).status,200);assert.equal(claims,1);
});
test('production FCM payload targets only the release package and retains generic private content',async()=>{
 let message;
 const key=generateKeyPairSync('rsa',{modulusLength:2048}).privateKey;
 const send=createFcmSender({...credentials,key,email:'test@example.iam.gserviceaccount.com'},async(url,options)=>{
  if(url.includes('oauth2'))return Response.json({access_token:'fixture',expires_in:3600});
  assert.equal(url,`https://fcm.googleapis.com/v1/projects/${firebase.production.projectId}/messages:send`);
  message=JSON.parse(options.body).message;return Response.json({name:'fixture-message'});
 },deployment.packageName);
 await send('AbCdEF:0123456789_TestTOKEN',storeId);
 assert.equal(message.android.restricted_package_name,'kr.co.manee.app');
 assert.equal(message.notification.title,'매니 · 알림 연결');assert.equal(message.android.notification.visibility,'PRIVATE');
 assert.throws(()=>createFcmSender({project:'manee-staging'},fetch,'kr.co.manee.app'),/invalid_project/);
 assert.throws(()=>createFcmSender(credentials,fetch,'unrelated.package'),/invalid_package/);
});
