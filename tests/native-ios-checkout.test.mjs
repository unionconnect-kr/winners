import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {checkoutPolicy}=require('../netlify/functions/lib/ios-checkout.cjs');
const store='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002';
const now=Date.parse('2026-10-16T12:00:00Z');
const env={IOS_PRIVACY_URL:'https://example.test/privacy',IOS_TERMS_URL:'https://example.test/terms',IOS_QA_STORE_IDS:store,IOS_QA_EXPIRES_AT:'2026-10-17T12:00:00Z'};
test('short TestFlight pilot permits only the named store without opening the public catalog',()=>{
 assert.deepEqual(checkoutPolicy(store,{catalogEnabled:false},env,now),{enabled:true,sandboxOnly:true});
 assert.deepEqual(checkoutPolicy(other,{catalogEnabled:false},env,now),{enabled:false,sandboxOnly:false});
 for(const changes of [{IOS_QA_STORE_IDS:'*'},{IOS_QA_STORE_IDS:store+',bad'},{IOS_QA_EXPIRES_AT:'bad'},
  {IOS_QA_EXPIRES_AT:'2026-10-16T12:00:00Z'},{IOS_QA_EXPIRES_AT:'2026-10-24T12:00:00Z'},
  {IOS_TERMS_URL:''},{IOS_PRIVACY_URL:'http://example.test/privacy'}]){
  assert.equal(checkoutPolicy(store,{catalogEnabled:false},{...env,...changes},now).enabled,false);
 }
});
test('public checkout still requires both rollout and catalog gates plus legal links',()=>{
 assert.equal(checkoutPolicy(other,{catalogEnabled:true},env,now).enabled,false);
 assert.equal(checkoutPolicy(other,{catalogEnabled:false},{...env,IOS_PURCHASES_ENABLED:'true'},now).enabled,false);
 assert.deepEqual(checkoutPolicy(other,{catalogEnabled:true},{...env,IOS_PURCHASES_ENABLED:'true'},now),{enabled:true,sandboxOnly:false});
});

const nativePath=require.resolve('../netlify/functions/lib/native-request.cjs');
const applePath=require.resolve('../netlify/functions/lib/apple-billing.cjs');
const actualNative=require(nativePath),actualApple=require(applePath);
let authenticated=true,owned=store,crossPlatform=false,attempted=[],saved=[];
require.cache[nativePath].exports={...actualNative,preflight:()=>undefined,
 authenticate:async()=>{if(!authenticated)throw Error('authentication_required');return {user:{rpc:async()=>({data:{status:'claimed'}})},service:{rpc:async(name,args)=>{saved.push(args.p_record);return {data:true};}}};},
 ownerContext:async(user,id)=>{if(id!==owned)throw Error('owner_access_denied');return {appAccountToken:store,productId:'manee.store1.monthly',catalogEnabled:false,subscriptions:[],otherPlatformActive:crossPlatform};}};
require.cache[applePath].exports={...actualApple,configured:()=>true,apple:(env,environment)=>({environment}),
 verifyPurchase:async(api,signed)=>{attempted.push(api.environment);if(signed!==api.environment)throw Error('purchase_mismatch');return {environment:api.environment,status:1,revoked:false,expiresAt:new Date(Date.now()+86400000).toISOString()};}};
const {handler}=require('../netlify/functions/ios-billing.js');
require.cache[nativePath].exports=actualNative;require.cache[applePath].exports=actualApple;
test('endpoint authenticates and authorizes before pilot use, and accepts only sandbox proof for the pilot',async()=>{
 const keys=[...Object.keys(env),'IOS_PURCHASES_ENABLED'];
 const before=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 Object.assign(process.env,{...env,IOS_QA_EXPIRES_AT:new Date(Date.now()+86400000).toISOString()});delete process.env.IOS_PURCHASES_ENABLED;
 const call=async(action,id=store,signedTransaction)=>handler({httpMethod:'POST',headers:{},body:JSON.stringify({action,storeId:id,signedTransaction})});
 try{
  authenticated=false;assert.equal((await call('prepare')).statusCode,401);authenticated=true;
  assert.equal((await call('prepare',other)).statusCode,403);
  owned=other;assert.equal((await call('prepare',other)).statusCode,503);owned=store;
  crossPlatform=true;assert.equal((await call('prepare')).statusCode,409);crossPlatform=false;
  assert.equal(JSON.parse((await call('prepare')).body).ready,true);
  attempted=[];saved=[];
  assert.equal((await call('verify',store,'Production')).statusCode,409);
  assert.deepEqual(attempted,['Sandbox']);assert.equal(saved.length,0);
  const verified=await call('verify',store,'Sandbox');assert.equal(verified.statusCode,200);
  const subscription=JSON.parse(verified.body).subscriptions[0];
  assert.equal(subscription.testActive,true);assert.equal(subscription.active,false);assert.equal(saved.length,1);
  process.env.IOS_QA_EXPIRES_AT=new Date(Date.now()-1).toISOString();
  assert.equal((await call('prepare')).statusCode,503);assert.equal((await call('verify',store,'Sandbox')).statusCode,503);
 }finally{for(const [key,value] of Object.entries(before)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
});
