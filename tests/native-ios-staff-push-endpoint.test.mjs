import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const request=require('../netlify/functions/lib/native-request.cjs');
test('pushContext checks linked membership separately from owner-only billing',async()=>{
 const store='00000000-0000-4000-8000-000000000101';let calls=[];
 await request.pushContext({rpc:async(name,args)=>{calls.push({name,args});return {data:true};}},store);
 assert.equal(calls[0].name,'manee_ios_push_context');assert.equal(calls[0].args.p_store_id,store);
 for(const result of [{data:false},{error:{code:'42501'}}])await assert.rejects(()=>request.pushContext({rpc:async()=>result},store),/push_access_denied/);
});
test('test endpoint ignores caller-supplied recipients and content',async()=>{
 const file=require.resolve('../netlify/functions/ios-push.js'),push=require('../netlify/functions/lib/native-push.cjs');
 const saved={...request},oldConfigured=push.configured,oldSend=push.sendNativePush;let sent,context;
 try{
  request.preflight=()=>null;request.authenticate=async()=>({user:{},service:{},userId:'caller'});
  request.pushContext=async(_,store)=>{context=store;};push.configured=()=>true;
  push.sendNativePush=async(_,args)=>{sent=args;return {sent:1};};delete require.cache[file];
  const result=await require(file).handler({httpMethod:'POST',headers:{},body:JSON.stringify({action:'test',storeId:'store',targetUserId:'victim',message:'private',kind:'monthly_costs'})});
  assert.equal(result.statusCode,200);assert.equal(context,'store');assert.deepEqual(sent,{storeId:'store',userId:'caller',kind:'test'});
 }finally{Object.assign(request,saved);push.configured=oldConfigured;push.sendNativePush=oldSend;delete require.cache[file];}
});
