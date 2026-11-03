import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {adaptIos139} from './adapt-ios139.mjs';
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
