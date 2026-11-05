import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHandler as social} from '../../supabase/functions/manee-social-auth/handler.mjs';
import {createHandler as naver} from '../../supabase/functions/manee-naver-userinfo/handler.mjs';
import {isManeeProjectUrl,sendSms} from '../../supabase/functions/manee-sms-auth/core.ts';

test('SMS is limited to the two approved MANEE projects',()=>{
 assert.equal(isManeeProjectUrl('https://bhwuuxcrzxespkjlmqxr.supabase.co'),true);
 assert.equal(isManeeProjectUrl('https://obpkzecgswnfuyhwvncd.supabase.co'),true);
 for(const value of ['',undefined,'https://attacker.supabase.co','https://bhwuuxcrzxespkjlmqxr.supabase.co.attacker.test'])assert.equal(isManeeProjectUrl(value),false);
});
test('SMS delivery requires one explicitly successful provider result',async()=>{
 const config={key:'test',secret:'test',sender:'0212345678'};
 assert.equal(await sendSms(config,'+821012345678','123456',async()=>Response.json({failedMessageList:[],messageList:[{statusCode:'2000'}]})),true);
 assert.equal(await sendSms(config,'+821012345678','123456',async()=>Response.json({failedMessageList:[],messageList:[{statusCode:'4000'}]})),false);
});
test('Social handler rejects a missing token before accessing the backend',async()=>{
 const r=await social({admin:{}})(new Request('https://example.test',{method:'POST',body:'{"action":"context"}'}));assert.equal(r.status,401);
});
function admin({user,profile,error}={}){return {auth:{getUser:async()=>({data:{user},error})},from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:profile,error:null})})})})};}
const request=body=>new Request('https://example.test',{method:'POST',headers:{authorization:'Bearer test-token'},body:JSON.stringify(body)});
test('Social signup requires an identity verified by the auth server',async()=>{
 const r=await social({admin:admin({user:{id:'account-a',identities:[{provider:'email'}]}})})(request({action:'signup',provider:'kakao',userId:'account-b'}));assert.equal(r.status,403);
});
test('Social context returns only the authenticated account',async()=>{
 const r=await social({admin:admin({user:{id:'account-a',identities:[{provider:'kakao'}]},profile:{user_id:'account-a',status:'active',display_name:'QA'}})})(request({action:'context',userId:'account-b'}));const b=await r.json();assert.equal(r.status,200);assert.equal(b.userId,'account-a');assert.equal(b.registered,true);
});
test('Social context blocks inactive accounts',async()=>{
 const r=await social({admin:admin({user:{id:'account-a',identities:[]},profile:{user_id:'account-a',status:'disabled'}})})(request({action:'context'}));assert.equal(r.status,403);
});
test('Naver rejects absent credentials without contacting the provider',async()=>{
 let called=false;const r=await naver({fetch:async()=>{called=true;throw Error('must not run');}})(new Request('https://example.test'));assert.equal(r.status,401);assert.equal(called,false);
});
test('Naver adapter exposes only the stable subject',async()=>{
 const r=await naver({fetch:async()=>Response.json({resultcode:'00',response:{id:'subject-123',email:'private@example.test',name:'Private'}})})(new Request('https://example.test',{headers:{authorization:'Bearer token'}}));assert.deepEqual(await r.json(),{sub:'subject-123'});
});
test('Naver refuses an invalid subject',async()=>{
 const r=await naver({fetch:async()=>Response.json({resultcode:'00',response:{id:'bad subject'}})})(new Request('https://example.test',{headers:{authorization:'Bearer token'}}));assert.equal(r.status,502);
});
