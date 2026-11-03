import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {adaptIos139,adaptIos139Social} from './adapt-ios139.mjs';
import {createSocialNative} from '../src/ios-social.js';
const source=readFileSync(new URL('../release139/assets/index.html',import.meta.url),'utf8');
const html=adaptIos139(source);
function functionText(name,next){return html.slice(html.indexOf('  async function '+name+'('),html.indexOf('  '+next,html.indexOf('  async function '+name+'(')));}
test('complete packaged inline scripts parse after iOS adaptation',()=>{
  for(const m of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))if(m[1].trim())new vm.Script(m[1]);
  assert.throws(()=>adaptIos139(html),/anchor mismatch/);
});
test('an unavailable iOS file bridge rejects instead of claiming a download',async()=>{
  const context={window:{Capacitor:{getPlatform:()=> 'ios'}}};vm.createContext(context);
  vm.runInContext(functionText('saveReportFile','async function downloadReport'),context);
  await assert.rejects(context.saveReportFile(new Uint8Array([1]),'보고서.pdf','application/pdf'),/unavailable/);
});
test('native save preserves bytes, Korean filename, type and cancellation',async()=>{
  let input;const context={window:{MANEE_NATIVE:{saveFile:async v=>{input=v;return{status:'cancelled'};}}}};vm.createContext(context);
  vm.runInContext(functionText('saveReportFile','async function downloadReport'),context);
  const bytes=new Uint8Array([3,7,9]);const result=await context.saveReportFile(bytes,'매니_월간리포트.csv','text/csv');
  assert.equal(result.status,'cancelled');assert.equal(input.bytes,bytes);assert.equal(input.mimeType,'text/csv');assert.equal(input.filename,'매니_월간리포트.csv');
});
function notificationContext(rpc){
  const context={state:{loading:false,splashDone:true,authProfile:{user_id:'u'},role:'staff',crew:[{id:'c',isManager:false}],myCrewId:'c'},currentStoreId:()=> 's',db:{rpc},render(){},window:{scrollTo(){}}};
  vm.createContext(context);vm.runInContext(functionText('openNativeNotification','function ownerNavigateFromOverview'),context);return context;
}
test('staff notification checks live iOS membership before opening personal notifications',async()=>{
  let call;const c=notificationContext(async(...args)=>{call=args;return{data:true};});
  assert.equal(await c.openNativeNotification({kind:'test',storeId:'s'}),'handled');assert.equal(call[0],'manee_ios_push_context');assert.equal(c.state.staffView,'me');assert.equal(c.state.teamPage,'notifications');
});
test('manager notification opens their More screen',async()=>{
  const c=notificationContext(async()=>({data:true}));c.state.crew[0].isManager=true;
  assert.equal(await c.openNativeNotification({kind:'test',storeId:'s'}),'handled');assert.equal(c.state.staffView,'more');
});
test('staff cannot open another store, unsupported event or revoked membership',async()=>{
  let calls=0;const c=notificationContext(async()=>{calls++;return{data:false};});
  for(const data of [{kind:'test',storeId:'other'},{kind:'report_closed',storeId:'s'},{kind:'test',storeId:'s'}])assert.equal(await c.openNativeNotification(data),'rejected');
  assert.equal(calls,1);assert.equal(c.state.teamPage,undefined);
});
test('stale notification authorization cannot open a screen after role changes',async()=>{
  let resolve;const c=notificationContext(()=>new Promise(r=>resolve=r));const pending=c.openNativeNotification({kind:'test',storeId:'s'});c.state.role='storeOwner';resolve({data:true});assert.equal(await pending,'rejected');
});
function social(launch){
  const state={opened:[],closed:0,handled:[],receive:null};
  const native=createSocialNative({scheme:'kr.co.manee.app.staging',origin:'https://obpkzecgswnfuyhwvncd.supabase.co',
    app:{async addListener(name,fn){assert.equal(name,'appUrlOpen');state.receive=fn;return{remove:async()=>{}};},async getLaunchUrl(){return launch?{url:launch}:undefined;}},
    browser:{async open(v){state.opened.push(v);},async close(){state.closed++;}}});
  return {native,state};
}
test('OAuth only opens the configured backend authorization endpoint',async()=>{
  const {native,state}=social();await native.open('https://obpkzecgswnfuyhwvncd.supabase.co/auth/v1/authorize?provider=kakao');
  for(const bad of ['https://evil.test/auth/v1/authorize','https://obpkzecgswnfuyhwvncd.supabase.co/rest/v1/data','javascript:alert(1)'])await assert.rejects(native.open(bad));
  assert.equal(state.opened.length,1);
});
test('OAuth handles both cold launch and an existing app; unrelated links are ignored',async()=>{
  const first='kr.co.manee.app.staging://auth/callback?manee_auth=callback&code=a';const {native,state}=social(first);
  await native.listen(async url=>state.handled.push(url));
  await state.receive({url:'https://evil.test/auth/callback'});await state.receive({url:'kr.co.manee.app.staging://evil/callback'});
  await state.receive({url:first.replace('code=a','code=b')});assert.equal(state.closed,2);assert.equal(state.handled.length,2);
});

function socialController({apple=true,kakao=true,naver=true}={}){
  const context={window:{},URL,AbortSignal};
  const script=adaptIos139Social(readFileSync(new URL('../release139/assets/social-auth.js',import.meta.url),'utf8'));
  vm.runInNewContext(script,context);
  const api=context.window.MANEE_SOCIAL_AUTH,calls=[],opened=[],saved=new Map();
  const user={id:'existing-user',identities:[{provider:'apple'},{provider:'kakao'}]};
  const db={auth:{getSession:async()=>({data:{session:{user}}}),getUser:async()=>({data:{user}})}};
  const controller=api.createController({
    supabase:{createClient:()=>({auth:{signInWithOAuth:async input=>{calls.push(input);return{data:{url:'https://example.supabase.co/auth/v1/authorize?provider='+input.provider}};}}})},
    db,config:{projectRef:'test',supabaseUrl:'https://example.supabase.co',publishableKey:'public-test',socialProviders:{naver}},
    platform:'ios',nativeScheme:'kr.co.manee.app.staging',getLocation:()=> 'capacitor://localhost',
    storage:{getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,v),removeItem:k=>saved.delete(k)},
    random:()=> 'test-flow',open:async url=>opened.push(url),
    fetch:async()=>({ok:true,json:async()=>({external:{apple,kakao}})})
  });
  return {api,controller,calls,opened};
}
test('iPhone exposes Kakao and Naver independently of the Apple server setting',async()=>{
  for(const apple of [true,false]){
    const {api,controller}=socialController({apple});
    assert.deepEqual(Array.from(api.PROVIDERS),['kakao','naver']);
    assert.equal(JSON.stringify(await controller.providers()),JSON.stringify({kakao:true,naver:true}));
  }
  assert.equal(JSON.stringify(await socialController({kakao:false}).controller.providers()),JSON.stringify({kakao:false,naver:true}));
  assert.equal(JSON.stringify(await socialController({naver:false}).controller.providers()),JSON.stringify({kakao:true,naver:false}));
});
test('Kakao and Naver retain the native callback, provider mapping and selected role',async()=>{
  for(const provider of ['kakao','naver'])for(const role of ['owner','staff']){
    const {controller,calls,opened}=socialController({apple:false});
    const pending=await controller.begin(provider,{role});
    assert.equal(calls[0].provider,provider==='naver'?'custom:naver':'kakao');
    assert.equal(pending.role,role);
    assert.equal(pending.redirectTo,'kr.co.manee.app.staging://auth/callback?manee_auth=callback&flow=test-flow');
    assert.equal(calls[0].options.skipBrowserRedirect,true);
    if(provider==='kakao')assert.equal(calls[0].options.queryParams.scope,'profile_nickname');
    assert.equal(opened.length,1);
  }
});
test('Apple cannot start sign-in or account linking and is absent from linked account choices',async()=>{
  const {api,controller,calls,opened}=socialController();
  for(const intent of ['signin','link'])await assert.rejects(controller.begin('apple',{intent}),{code:'invalid_request'});
  assert.equal(calls.length,0);assert.equal(opened.length,0);
  const account=await controller.account('existing-user');
  assert.equal(JSON.stringify(account.linked),JSON.stringify({kakao:true,naver:false}));
  assert.equal(api.providerOf({identities:[{provider:'apple'}]},'apple'),false);
});
test('iPhone recovery help omits Apple login without changing the Android baseline',()=>{
  assert.ok(source.includes('카카오·네이버·Apple로 가입했다면'));
  assert.ok(html.includes('카카오·네이버로 가입했다면'));
  assert.ok(!html.includes('Apple로 가입했다면'));
  assert.ok(!html.includes("apple:'Apple'"));
});
