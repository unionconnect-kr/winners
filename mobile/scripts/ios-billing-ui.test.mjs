import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script,createContext} from 'node:vm';
import {createSubscriptionSheet,subscriptionButton,setSubscriptionOffer,setSubscriptionPromotion,createSubscriptionStatusSheet} from '../src/subscription-sheet.mjs';
import {subscriptionView} from '../src/store-subscription.mjs';

const settle=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(overrides={},access=null){
 let body,purchases=0;
 class Element{
  constructor(tag){this.tagName=tag;this.children=[];this.parent=null;this.style={cssText:''};this.dataset={};this.listeners={};this.hidden=false;this.disabled=false;}
  get isConnected(){return this===body||Boolean(this.parent?.isConnected);}
  append(child){child.remove();child.parent=this;this.children.push(child);}
  setAttribute(){}
  addEventListener(name,fn){(this.listeners[name]??=[]).push(fn);}
  showModal(){assert.equal(this.isConnected,true,'native dialog must be attached before showModal');this.open=true;}
  close(){this.open=false;this.listeners.close?.forEach(fn=>fn());}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(c=>c!==this);this.parent=null;}
 }
 body=new Element('body');
 const document={body,createElement:tag=>new Element(tag),getElementById:id=>body.children.find(c=>c.id===id)};
 const billing={status:async()=>({ready:true,appAccountToken:'token',subscriptions:[]}),products:async()=>({monthly:true,priceApproved:true,price:'9,900원',twoMonthsFree:false}),purchase:async()=>{purchases++;return {status:'cancelled'};},restore:async()=>({status:'empty'}),...overrides};
 const window={};const c={userId:'owner',storeId:'store',role:'storeOwner',db:{rpc:async()=>({data:access})}};
 const context=createContext({window,document,localStorage:{},registerPlugin:()=>({addListener:()=>{}}),Geolocation:{},PushNotifications:{},
  createBillingClient:()=>billing,createAndroidGeolocation:()=>({}),createNativeGeolocation:()=>({}),createIosPush:()=>({}),createNotificationNavigation:()=>({start:async()=>{},flush:async()=>{}}),createSignupCheckout:()=>()=>{},
  createSubscriptionSheet,subscriptionButton,setSubscriptionOffer,setSubscriptionPromotion,createSubscriptionStatusSheet,subscriptionView});
 new Script(readFileSync(new URL('../src/native.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'')).runInContext(context);
 window.MANEE_NATIVE.configure(()=>c);
 const descendants=e=>e.children.flatMap(child=>[child,...descendants(child)]);
 const button=label=>descendants(body).find(e=>e.tagName==='button'&&e.textContent===label);
 const text=e=>[e.textContent||'',...e.children.map(text)].join(' ');
 return{native:window.MANEE_NATIVE,billing,button,purchases:()=>purchases,text:()=>text(body)};
}
test('iOS paid-only price replaces the trial promotion and needs two explicit actions before StoreKit',async()=>{
 const f=fixture();await f.native.openSettings();
 assert.match(f.text(),/월 9,900원/);assert.match(f.text(),/무료체험 미적용 · 오늘 9,900원 결제/);
 assert.doesNotMatch(f.text(),/2개월 무료체험/);assert.equal(f.purchases(),0);
 await f.button('무료체험 없는 구독 요금 확인').onclick();assert.equal(f.purchases(),0);
 await f.button('오늘 9,900원 결제하고 구독하기').onclick();assert.equal(f.purchases(),1);
 assert.match(f.text(),/구매를 취소했어요/);
 assert.equal(f.button('오늘 9,900원 결제하고 구독하기').hidden,false);
});
test('iOS rapid confirmed-purchase clicks cannot dispatch StoreKit twice',async()=>{
 let finish,calls=0;const f=fixture({purchase:()=>{calls++;return new Promise(resolve=>finish=resolve);}});await f.native.openSettings();
 await f.button('무료체험 없는 구독 요금 확인').onclick();
 const button=f.button('오늘 9,900원 결제하고 구독하기');
 const first=button.onclick();const second=button.onclick();await settle();
 assert.equal(typeof finish,'function');assert.equal(calls,1);finish({status:'cancelled'});await Promise.all([first,second]);
 assert.equal(button.disabled,false);
});
test('iOS restore while product loading cannot show a new purchase button for an active subscription',async()=>{
 let finish;const f=fixture({products:()=>new Promise(resolve=>finish=resolve),restore:async()=>({subscriptions:[{active:true}]})});
 const opening=f.native.openSettings();await settle();
 await f.button('기존 구독 복원').onclick();
 finish({monthly:true,priceApproved:true,price:'9,900원',twoMonthsFree:false});await opening;
 assert.equal(f.purchases(),0);assert.equal(f.button('월 구독 시작').hidden,true);
});
test('iOS active account status offers management and restoration without starting a purchase',async()=>{
 const f=fixture({}, {enforced:true,canWrite:true});
 f.native.openSubscriptionStatus();await settle();
 assert.equal(f.button('구독 관리·복원').hidden,false);
 f.button('구독 관리·복원').onclick();await settle();
 assert.ok(f.button('기존 구독 복원'));
 assert.equal(f.purchases(),0);
});
