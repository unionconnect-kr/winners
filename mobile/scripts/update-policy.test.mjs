import test from 'node:test';
import assert from 'node:assert/strict';
import {createUpdateController,compareVersions,validUpdatePolicy,installNativeUpdatePolicy} from '../src/update-policy.mjs';
import {JSDOM} from 'jsdom';
const policy=(changes={})=>({platform:'android',enabled:true,minimum_version:'1.61',minimum_build:'62',available_version:'1.61',available_build:'62',published_at:'2026-01-01T00:00:00Z',...changes});
function harness({info={version:'1.60',build:'61'},row=policy(),cached,fail=false}={}){
 const storage=new Map(),events=[];if(cached)storage.set('manee-public-update-policy:android',JSON.stringify(cached));
 const c=createUpdateController({platform:'android',getInfo:async()=>info,readPolicy:async()=>{if(fail)throw Error('offline');return row;},storage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},hide:()=>events.push({type:'hide'}),showRequired:v=>events.push({type:'required',...v}),showNotes:v=>events.push({type:'notes',...v}),openStore:async()=>events.push({type:'store'})});
 return {c,events,storage};
}
test('version comparison handles marketing and three-part iOS builds numerically',()=>{assert.equal(compareVersions('1.9','1.10'),-1);assert.equal(compareVersions('157.5.1','157.4.9'),1);assert.equal(compareVersions('1.61','1.61.0'),0);assert.throws(()=>compareVersions('1.61-beta','1'));});
test('unknown platform, unconfirmed publication and unavailable minimum cannot activate a block',()=>{
 for(const row of [policy({platform:'ios'}),policy({published_at:null}),policy({available_version:'1.60'}),policy({published_at:'2999-01-01'}),policy({minimum_version:'99999999999999999999'})])assert.equal(validUpdatePolicy(row,'android'),null);
});
test('old versions are blocked and the update action opens only the native store helper',async()=>{const h=harness();await h.c.check();assert.equal(h.c.isBlocked(),true);const popup=h.events.findLast(e=>e.type==='required');assert.ok(popup);assert.equal(h.events.some(e=>e.type==='notes'),false);await popup.update();assert.equal(h.events.at(-1).type,'store');});
test('cached mandatory policy remains active during a network failure',async()=>{const h=harness({cached:policy(),fail:true});await h.c.check();assert.equal(h.c.isBlocked(),true);assert.equal(h.events.some(e=>e.type==='notes'),false);});
test('temporary policy failure without a cache does not lock out store staff',async()=>{const h=harness({fail:true});await h.c.check();assert.equal(h.c.isBlocked(),false);assert.ok(h.events.find(e=>e.type==='notes'));});
test('new app shows release notes once and records acknowledgement only on confirmation',async()=>{
 const h=harness({info:{version:'1.61',build:'62'}});await h.c.check();let notes=h.events.findLast(e=>e.type==='notes');assert.ok(notes);assert.equal([...h.storage.keys()].some(k=>k.startsWith('manee-update-ack:')),false);notes.confirm();h.events.length=0;await h.c.check();assert.equal(h.events.some(e=>e.type==='notes'),false);assert.equal(h.c.isBlocked(),false);
});
test('disabling the server policy can release an older cached mandatory gate',async()=>{const h=harness({cached:policy(),row:policy({enabled:false})});await h.c.check();assert.equal(h.c.isBlocked(),false);assert.ok(h.events.find(e=>e.type==='notes'));});
test('parallel foreground checks use one server request',async()=>{let n=0,resolve;const c=createUpdateController({platform:'android',getInfo:async()=>({version:'1.60',build:'61'}),readPolicy:()=>{n++;return new Promise(r=>{resolve=r;});},storage:{getItem:()=>null,setItem(){}},hide(){},showRequired(){},showNotes(){},openStore(){}});const a=c.check(),b=c.check();await new Promise(r=>setImmediate(r));assert.equal(n,1);resolve(policy());await Promise.all([a,b]);});
test('runtime blocks and rechecks on foreground without requiring AbortSignal.timeout',async()=>{
 const dom=new JSDOM('<body><main id="app"><button id="work">저장</button></main></body>',{url:'https://manee.example'}),w=dom.window;
 const beforeWindow=globalThis.window,beforeDocument=globalThis.document,beforeSignal=globalThis.AbortSignal;globalThis.window=w;globalThis.document=w.document;globalThis.AbortSignal=undefined;
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
 let foreground,checks=0,opened=0,work=0;const native={configure(){},refresh(){}};
 const q={select:()=>q,eq:()=>q,single:()=>q,abortSignal:async()=>{checks++;return {data:policy()};}};
 try{
  installNativeUpdatePolicy({App:{getInfo:async()=>({version:'1.60',build:'61'}),addListener:async(_,fn)=>{foreground=fn;}},native,platform:'android',store:{openStore:async()=>{opened++;}}});
  // Match the compiled app's order: configure() precedes `let state = ...`.
  native.configure(()=>({db:{from:()=>q},storeId:bootState.storeId}));
  let bootState={storeId:'store'};
  await new Promise(r=>setImmediate(r));
  const dialog=w.document.getElementById('manee-update-dialog');assert.ok(dialog);const cancel=new w.Event('cancel',{cancelable:true});dialog.dispatchEvent(cancel);assert.equal(cancel.defaultPrevented,true);
  w.document.getElementById('work').onclick=()=>{work++;};w.document.getElementById('work').click();assert.equal(work,0);
  [...dialog.querySelectorAll('button')].find(b=>b.textContent==='업데이트하기').click();await new Promise(r=>setImmediate(r));assert.equal(opened,1);
  foreground({isActive:true});await new Promise(r=>setImmediate(r));assert.ok(checks>=2);
 }finally{globalThis.window=beforeWindow;globalThis.document=beforeDocument;globalThis.AbortSignal=beforeSignal;dom.window.close();}
});
