import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script,createContext} from 'node:vm';
import {openAndroidBilling} from '../src/android-billing-ui.mjs';
import {createSubscriptionStatusSheet,subscriptionButton,closeSubscriptionSheet,reuseSubscriptionSheet} from '../src/subscription-sheet.mjs';
import {subscriptionView} from '../src/store-subscription.mjs';

const settle=()=>new Promise(resolve=>setImmediate(resolve));
const phase={currency:'KRW',amountMicros:9900000000,price:'₩9,900',period:'P1M',recurrenceMode:1};
const product={productId:'manee.store1.monthly',offers:[{basePlanId:'monthly',offerId:'trial-60days',offerToken:'trial',phases:[{...phase,amountMicros:0,period:'P60D',cycles:1,recurrenceMode:2},phase]}]};

// HTMLDialogElement.close changes open synchronously but queues the close event.
// The former synchronous test double concealed dialog replacement failures.
function fakeDocument(){
 const top=[];let body;
 class Element{
  constructor(tag){this.tagName=tag;this.children=[];this.parent=null;this.style={};this.hidden=false;this.disabled=false;this.listeners={};this.dataset={};this.open=false;}
  get isConnected(){return this===body||Boolean(this.parent?.isConnected);}
  append(child){if(child.parent)child.parent.children=child.parent.children.filter(c=>c!==child);child.parent=this;this.children.push(child);}
  setAttribute(){}
  addEventListener(name,fn){(this.listeners[name]??=[]).push(fn);}
  showModal(){this.open=true;top.push(this);}
  close(){this.open=false;const i=top.indexOf(this);if(i>=0)top.splice(i,1);setImmediate(()=>this.listeners.close?.forEach(fn=>fn()));}
  focus(){}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(c=>c!==this);this.parent=null;const i=top.indexOf(this);if(i>=0)top.splice(i,1);}
 }
 body=new Element('body');
 return {body,top,createElement:tag=>new Element(tag),getElementById:id=>body.children.find(c=>c.id===id)};
}
function fixture(overrides={}){
 const document=fakeDocument();let purchaseCount=0,productCount=0;
 const billing={status:async()=>({ready:true,testOnly:false,billingScope:'account',productId:product.productId}),products:async()=>{productCount++;return {products:[product]};},purchase:async()=>{purchaseCount++;return {status:'cancelled'};},restore:async()=>({status:'empty'}),isBusy:()=>false,...overrides};
 let context={userId:'owner',storeId:'store',role:'storeOwner',storeName:'테스트 매장',db:{rpc:async()=>({data:{enforced:true,canWrite:false},error:null})}};
 const window={};
 const vm=createContext({window,document,localStorage:{},ANDROID_PAID_BILLING:true,ANDROID_PRODUCTION:true,ANDROID_FIREBASE_PROJECT:'',
  registerPlugin:()=>({}),PushNotifications:{},Geolocation:{},createAndroidBillingClient:()=>billing,
  createAndroidPush:()=>({}),createAndroidGeolocation:()=>({}),createNotificationNavigation:()=>({start:async()=>{},flush:async()=>{}}),createSignupCheckout:()=>async()=>{},
  openAndroidBilling,createSubscriptionStatusSheet,subscriptionButton,closeSubscriptionSheet,reuseSubscriptionSheet,subscriptionView,
 });
 const code=readFileSync(new URL('../src/native-android.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'');
 new Script(code).runInContext(vm);
 window.MANEE_NATIVE.configure(()=>context);
 const descendants=e=>e.children.flatMap(c=>[c,...descendants(c)]);
 const button=(id,label)=>descendants(document.getElementById(id)).find(e=>e.tagName==='button'&&e.textContent===label);
 return {document,billing,native:window.MANEE_NATIVE,button,getContext:()=>context,setContext:c=>context=c,purchases:()=>purchaseCount,products:()=>productCount};
}

test('the actual account-status button opens the offer sheet',async()=>{
 const f=fixture();f.native.subscriptionDenied();await settle();
 await f.button('manee-subscription-status','무료체험·구독 확인').onclick();await settle();
 assert.equal(f.document.top.at(-1)?.id,'manee-android-billing');
 assert.equal(f.document.getElementById('manee-subscription-status'),undefined);
 assert.equal(f.purchases(),1,'explicit eligible-trial action reaches native checkout');
});
test('a delayed write denial cannot cover checkout with the same account-status prompt',async()=>{
 const f=fixture();f.native.subscriptionDenied();await settle();
 await f.button('manee-subscription-status','무료체험·구독 확인').onclick();await settle();
 f.native.subscriptionDenied();await settle();
 assert.equal(f.document.top.at(-1)?.id,'manee-android-billing');
 assert.equal(f.document.getElementById('manee-subscription-status'),undefined);
});
test('retry opens a fresh offer sheet before the old asynchronous close event runs',async()=>{
 let queries=0;
 const f=fixture({products:async()=>{if(++queries===1)throw Object.assign(Error('offline'),{code:'PLAY_2'});return {products:[product]};}});
 openAndroidBilling({billing:f.billing,document:f.document,getContext:f.getContext});await settle();
 await f.button('manee-android-billing','요금·혜택 다시 확인').onclick();await settle();
 assert.equal(f.document.top.at(-1)?.id,'manee-android-billing');assert.equal(queries,2);
});
test('opening checkout after signup does not start a purchase without the explicit action',async()=>{
 const f=fixture();openAndroidBilling({billing:f.billing,document:f.document,getContext:f.getContext});await settle();assert.equal(f.purchases(),0);
});
test('the direct action never silently switches a missing trial to paid checkout',async()=>{
 const f=fixture({products:async()=>({products:[{...product,offers:[{basePlanId:'monthly',offerToken:'paid',phases:[phase]}]}]})});
 f.native.subscriptionDenied();await settle();await f.button('manee-subscription-status','무료체험·구독 확인').onclick();await settle();
 assert.equal(f.purchases(),0);assert.ok(f.button('manee-android-billing','무료체험 없는 구독 요금 확인'));
});
test('a failed product lookup stays on the checkout error and never triggers a purchase',async()=>{
 const f=fixture({products:async()=>{throw Object.assign(Error('Play unavailable'),{code:'PLAY_3'});}});
 f.native.subscriptionDenied();await settle();await f.button('manee-subscription-status','무료체험·구독 확인').onclick();await settle();
 f.native.subscriptionDenied();await settle();assert.equal(f.purchases(),0);assert.equal(f.document.top.at(-1)?.id,'manee-android-billing');
 assert.ok(f.button('manee-android-billing','요금·혜택 다시 확인'));
});
test('rapid repeated status actions cannot launch duplicate purchases',async()=>{
 const f=fixture();f.native.subscriptionDenied();await settle();
 const button=f.button('manee-subscription-status','무료체험·구독 확인');button.onclick();button.onclick();await settle();
 assert.equal(f.purchases(),1);assert.equal(f.document.top.length,1);
});
