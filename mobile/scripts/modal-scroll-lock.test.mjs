import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
import {createModalScrollLock} from '../src/modal-scroll-lock.mjs';
import {createSubscriptionSheet,subscriptionButton,setSubscriptionOffer,createSubscriptionStatusSheet} from '../src/subscription-sheet.mjs';
import {subscriptionView} from '../src/store-subscription.mjs';
import {purchaseAccountMessage} from '../src/billing.mjs';

const settle=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(){
 const dom=new JSDOM('<!doctype html><body><main style="height:2400px">background</main></body>',{url:'https://localhost/',runScripts:'outside-only'});
 const {window}=dom,{document}=window;let restored=[];
 Object.defineProperties(window,{scrollX:{value:0,writable:true},scrollY:{value:428,writable:true}});
 window.scrollTo=(x,y)=>{restored.push([x,y]);window.scrollX=x;window.scrollY=y;};
 const lock=createModalScrollLock(window);
 const sheet=()=>{const el=document.createElement('dialog');el.style.overflowY='auto';document.body.append(el);el.open=true;return el;};
 function swipe(target,{x=0,y=-40,touches=1}={}){
  const points=(x,y)=>Array.from({length:touches},()=>({clientX:x,clientY:y}));
  const start=new window.Event('touchstart',{bubbles:true,cancelable:true});start.touches=points(50,100);target.dispatchEvent(start);
  const move=new window.Event('touchmove',{bubbles:true,cancelable:true});move.touches=points(50+x,100+y);target.dispatchEvent(move);return move.defaultPrevented;
 }
 const close=el=>{el.open=false;el.dispatchEvent(new window.Event('close'));el.remove();};
 return{dom,window,document,lock,sheet,swipe,close,restored};
}
function size(node,{height=800,viewport=300,width=200,visibleWidth=200}={}){
 for(const [property,value] of Object.entries({scrollHeight:height,clientHeight:viewport,scrollWidth:width,clientWidth:visibleWidth}))Object.defineProperty(node,property,{value,configurable:true});
}

test('a short dialog blocks backdrop and content swipes and restores the exact page offset and preexisting styles',()=>{
 const f=fixture();try{
  const {body,documentElement:root}=f.document;
  body.style.setProperty('position','relative','important');body.style.top='3px';body.style.color='green';root.style.scrollBehavior='smooth';
  const sheet=f.sheet(),text=f.document.createElement('p');sheet.append(text);size(sheet,{height:200,viewport:300});
  f.lock(sheet);
  assert.equal(body.style.position,'fixed');assert.equal(body.style.top,'-428px');assert.equal(root.style.overflow,'hidden');
  for(const target of [text,sheet,body,f.document.querySelector('main')]){
   assert.equal(f.swipe(target),true);assert.equal(f.swipe(target,{y:40}),true);
  }
  assert.equal(f.swipe(text,{touches:2}),false,'pinch zoom must remain available');
  body.style.background='white';
  f.close(sheet);
  assert.equal(body.style.position,'relative');assert.equal(body.style.getPropertyPriority('position'),'important');assert.equal(body.style.top,'3px');
  assert.equal(body.style.color,'green');assert.equal(body.style.background,'white');assert.equal(root.style.overflow,'');assert.equal(root.style.scrollBehavior,'smooth');
  assert.deepEqual(f.restored,[[0,428]]);assert.equal(f.swipe(body),false);
 }finally{f.dom.window.close();}
});
test('long dialog content can scroll in either direction, while its top and bottom do not chain to the page',()=>{
 const f=fixture();try{
  const sheet=f.sheet(),text=f.document.createElement('p');sheet.append(text);size(sheet);f.lock(sheet);
  sheet.scrollTop=0;assert.equal(f.swipe(text,{y:40}),true);assert.equal(f.swipe(text,{y:-40}),false);
  sheet.scrollTop=150;assert.equal(f.swipe(text,{y:40}),false);assert.equal(f.swipe(text,{y:-40}),false);
  sheet.scrollTop=500;assert.equal(f.swipe(text,{y:-40}),true);assert.equal(f.swipe(text,{y:40}),false);
  f.close(sheet);
 }finally{f.dom.window.close();}
});
test('nested scrollable fields and horizontal content retain their own scrolling',()=>{
 const f=fixture();try{
  const sheet=f.sheet(),field=f.document.createElement('textarea');sheet.append(field);size(sheet,{height:100,viewport:300});size(field);
  field.style.overflowY='auto';field.scrollTop=50;f.lock(sheet);assert.equal(f.swipe(field),false);
  field.scrollTop=500;assert.equal(f.swipe(field),true);
  field.style.overflowX='auto';size(field,{width:600,visibleWidth:200});field.scrollLeft=50;
  assert.equal(f.swipe(field,{x:-40,y:0}),false);
  f.close(sheet);
 }finally{f.dom.window.close();}
});
test('replacing a dialog before its queued close event keeps the page locked until the replacement closes',()=>{
 const f=fixture();try{
  const first=f.sheet();f.lock(first);first.open=false;first.remove();
  const next=f.sheet();f.lock(next);first.dispatchEvent(new f.window.Event('close'));
  assert.equal(f.document.body.style.position,'fixed');assert.equal(f.document.body.style.top,'-428px');assert.deepEqual(f.restored,[]);
  f.close(next);assert.equal(f.document.body.style.position,'');assert.deepEqual(f.restored,[[0,428]]);
 }finally{f.dom.window.close();}
});
test('direct navigation removal releases the page lock even without a dialog close event',async()=>{
 const f=fixture();try{
  const sheet=f.sheet();f.lock(sheet);sheet.remove();await settle();
  assert.equal(f.document.body.style.position,'');assert.equal(f.swipe(f.document.body),false);assert.deepEqual(f.restored,[[0,428]]);
 }finally{f.dom.window.close();}
});
test('reopening a dialog before its old close event does not release its lock',()=>{
 const f=fixture();try{
  const sheet=f.sheet();f.lock(sheet);sheet.open=false;sheet.open=true;sheet.dispatchEvent(new f.window.Event('close'));
  assert.equal(f.document.body.style.position,'fixed');f.close(sheet);assert.deepEqual(f.restored,[[0,428]]);
 }finally{f.dom.window.close();}
});

test('actual iOS account status -> subscription -> close locks both sheets, retains details scrolling, and restores More position',async()=>{
 const f=fixture();try{
  const {window}=f,{document}=window;
  window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  // Match native dialog.close(): the event is delivered in a later task.
  window.HTMLDialogElement.prototype.close=function(){this.open=false;setImmediate(()=>this.dispatchEvent(new window.Event('close')));};
  const billing={status:async()=>({ready:true,appAccountToken:'token',subscriptions:[],termsUrl:'https://manee.example/terms',privacyUrl:'https://manee.example/privacy'}),products:async()=>({monthly:true,priceApproved:true,price:'9,900원',twoMonthsFree:true})};
  Object.assign(window,{createModalScrollLock,createSubscriptionSheet,subscriptionButton,setSubscriptionOffer,createSubscriptionStatusSheet,subscriptionView,purchaseAccountMessage,
   registerPlugin:()=>({addListener(){}}),Geolocation:{},PushNotifications:{},createNativeGeolocation:()=>({}),createIosPush:()=>({}),createSignupCheckout:()=>()=>{},
   createNotificationNavigation:()=>({start:async()=>{},flush:async()=>{}}),createBillingClient:()=>billing});
  new Script(readFileSync(new URL('../src/native.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'')).runInContext(f.dom.getInternalVMContext());
  window.MANEE_NATIVE.configure(()=>({userId:'owner',storeId:'review-store',role:'storeOwner',db:{rpc:async()=>({data:{enforced:true,canWrite:false}})}}));
  window.MANEE_NATIVE.openSubscriptionStatus();await settle();
  assert.equal(document.body.style.position,'fixed');const status=document.querySelector('#manee-subscription-status');
  assert.doesNotMatch(status.textContent,/사장님이 구독 상태/);assert.match(status.textContent,/더보기에서 구독 상태/);
  assert.equal(f.swipe(status),true);[...status.querySelectorAll('button')].find(b=>b.textContent==='구독 확인').click();await settle();
  const checkout=document.querySelector('#manee-ios-billing');assert.ok(checkout?.open);assert.equal(document.body.style.position,'fixed');assert.deepEqual(f.restored,[]);
  checkout.querySelector('details').open=true;size(checkout);checkout.scrollTop=150;
  assert.equal(f.swipe(checkout.querySelector('details p')),false,'expanded terms must remain scrollable');
  const cancel=new window.Event('cancel',{cancelable:true});checkout.dispatchEvent(cancel);assert.equal(document.body.style.position,'fixed','cancel event alone is not a close');
  [...checkout.querySelectorAll('button')].find(b=>b.textContent==='닫기').click();await settle();
  assert.equal(document.querySelector('dialog'),null);assert.equal(document.body.style.position,'');assert.deepEqual(f.restored,[[0,428]]);
 }finally{f.dom.window.close();}
});
