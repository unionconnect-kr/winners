import test from 'node:test';import assert from 'node:assert/strict';
import {testOffers,openAndroidBilling} from '../src/android-billing-ui.mjs';
import {PURCHASE_BINDING_MISMATCH_MESSAGE} from '../src/android-billing-request.mjs';
const phase={currency:'KRW',amountMicros:9900000000,price:'₩9,900',period:'P1M',recurrenceMode:1};
const product={productId:'manee.store1.monthly',offers:[{basePlanId:'monthly',offerToken:'paid',phases:[phase]},{basePlanId:'monthly',offerId:'trial-60days',offerToken:'trial',phases:[{...phase,amountMicros:0,period:'P60D',cycles:1,recurrenceMode:2},phase]}]};
test('only eligible fixed monthly offers use the actual Play price and free phase',()=>{
 const offers=testOffers([product]);assert.equal(offers.length,1);assert.equal(offers[0].label,'무료 (60일) → ₩9,900 (1개월)');assert.equal(offers[0].offerToken,'trial');
 for(const change of [p=>p.productId='wrong',p=>p.offers.forEach(o=>o.basePlanId='annual'),p=>p.offers.forEach(o=>o.phases.at(-1).period='P1Y'),p=>p.offers.forEach(o=>o.phases.at(-1).currency='USD'),p=>p.offers.forEach(o=>o.phases.at(-1).amountMicros=19900000000)]){const p=structuredClone(product);change(p);assert.deepEqual(testOffers([p]),[]);}
});
test('trial offer requires exactly sixty free days before the monthly price',()=>{
 for(const change of [p=>p.offers[1].phases[0].period='P1W',p=>p.offers[1].phases[0].period='P1M',p=>p.offers[1].phases[0].period='P2M',p=>p.offers[1].phases[0].recurrenceMode=1,
  p=>p.offers[1].phases[0].cycles=2,p=>p.offers[1].phases[0].amountMicros=1000000,
  p=>p.offers[1].phases.splice(1,0,{...phase,amountMicros:0,period:'P60D',cycles:1,recurrenceMode:2})]){
  const p=structuredClone(product);change(p);
  assert.deepEqual(testOffers([p]).map(o=>o.offerToken),['paid']);
 }
});
test('renamed Console offer IDs preserve an eligible exact 60-day trial and duplicate offers create one choice',()=>{
 const p=structuredClone(product);
 p.offers[1].offerId='welcome-2026';p.offers.push({...p.offers[1],offerToken:'second-trial'});
 assert.deepEqual(testOffers([p]).map(o=>({token:o.offerToken,days:o.trialDays})),[{token:'trial',days:60}]);
 p.offers=p.offers.filter(o=>o.phases.length===1);
 p.offers.push({...p.offers[0],offerId:'regular-price',offerToken:'same-price'});
 assert.deepEqual(testOffers([p]).map(o=>o.offerToken),['paid']);
});
test('the live catalog can contain both old one-month and new sixty-day offers without selecting the old trial',()=>{
 const p=structuredClone(product);
 const oldTrial={...structuredClone(p.offers[1]),offerId:'trial-1month',offerToken:'old-trial'};
 oldTrial.phases[0].period='P1M';p.offers.unshift(oldTrial);
 assert.deepEqual(testOffers([p]).map(o=>[o.offerToken,o.trialDays]),[['trial',60]]);
 // Play omits the sixty-day offer for an ineligible account. Never advertise
 // the remaining one-month offer as sixty days or silently choose that token.
 p.offers=p.offers.filter(o=>o.offerToken!=='trial');
 assert.deepEqual(testOffers([p]).map(o=>[o.offerToken,o.trialDays]),[['paid',0]]);
 p.offers=p.offers.filter(o=>o.offerToken!=='paid');assert.deepEqual(testOffers([p]),[]);
});
test('calendar-month or repeated free phases cannot be labeled as the exact sixty-day offer',()=>{
 for(const [period,cycles] of [['P2M',1],['P1M',2],['P60D',2]]){
  const p=structuredClone(product);p.offers[1].phases[0].period=period;p.offers[1].phases[0].cycles=cycles;
  assert.deepEqual(testOffers([p]).map(o=>[o.offerToken,o.trialDays]),[['paid',0]]);
 }
});
test('offers follow the server allocated store product',()=>{
 const second={...product,productId:'manee.store2.monthly'};
 assert.equal(testOffers([product,second],'manee.store2.monthly')[0].productId,'manee.store2.monthly');
 assert.deepEqual(testOffers([second],'arbitrary-product'),[]);
});

function fakeDocument() {
 class Element {
  constructor(tag){this.tagName=tag;this.children=[];this.parent=null;this.style={};this.hidden=false;this.disabled=false;this.listeners={};this.dataset={};}
  get isConnected(){return this===body||Boolean(this.parent?.isConnected);}
  append(child){if(child.parent)child.parent.children=child.parent.children.filter(c=>c!==child);child.parent=this;this.children.push(child);}
  setAttribute(){}
  addEventListener(name,fn){this.listeners[name]=fn;}
  showModal(){}
  close(){this.listeners.close?.();}
  remove(){this.parent.children=this.parent.children.filter(c=>c!==this);this.parent=null;}
 }
 const body=new Element('body');
 return {body,createElement:tag=>new Element(tag),getElementById:id=>body.children.find(c=>c.id===id)};
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function dialogFixture(overrides={}){
 const document=fakeDocument();
 const billing={
  status:async()=>({ready:true,testOnly:true,productId:product.productId}),
  products:async()=>({products:[product]}),
  purchase:async()=>({status:'purchased',results:[{verified:true,testActive:true}]}),
  restore:async()=>({status:'restored',results:[{verified:true,testActive:true}]}),
  ...overrides
 };
 openAndroidBilling({billing,document,getContext:()=>({userId:'owner',storeId:'store',role:'storeOwner'})});
 const descendants=e=>e.children.flatMap(c=>[c,...descendants(c)]);
 const buttons=()=>descendants(document.body.children[0]).filter(e=>e.tagName==='button');
 return {billing,document,buttons,visibleOffers:()=>buttons().filter(e=>!e.hidden&&e.dataset.purchase==='true')};
}
test('successful checkout immediately hides all offers but keeps close and restore usable',async()=>{
 const f=dialogFixture();await settle();assert.equal(f.visibleOffers().length,1);
 await f.visibleOffers()[0].onclick();
 assert.equal(f.visibleOffers().length,0);
 for(const label of ['닫기','기존 구독 복원'])assert.equal(f.buttons().find(b=>b.textContent===label).disabled,false);
});
test('cancelled and pending checkout keep offers while server-confirmed existing subscription hides them',async()=>{
 const f=dialogFixture();await settle();
 for(const status of ['cancelled','pending']){
  f.billing.purchase=async()=>({status});
  await f.visibleOffers()[0].onclick();assert.equal(f.visibleOffers().length,1);
 }
 f.billing.purchase=async()=>({status:'alreadyActive',testActive:true});
 await f.visibleOffers()[0].onclick();assert.equal(f.visibleOffers().length,0);
});
test('restoration before product loading finishes cannot reintroduce purchase buttons',async()=>{
 let release;
 const f=dialogFixture({products:()=>new Promise(resolve=>release=resolve)});
 await settle();
 await f.buttons().find(b=>b.textContent==='기존 구독 복원').onclick();
 release({products:[product]});await settle();
 assert.equal(f.visibleOffers().length,0);
});
test('paid dialog shows billing and cancellation terms only for a paid-ready store',async()=>{
 const f=dialogFixture({status:async()=>({ready:true,testOnly:false,testActive:true,active:false,productId:product.productId}),
  purchase:async()=>({status:'purchased',results:[{verified:true,active:true}]})});
 await settle();
 const content=e=>[e.textContent||'',...e.children.map(content)].join(' ');const copy=content(f.document.body.children[0]);
 assert.match(copy,/매장 이용권 구독/);
 assert.match(copy,/60일 무료체험/);
 assert.match(copy,/월 9,900원/);
 assert.match(copy,/Play 스토어 구독 관리/);
 assert.match(copy,/출퇴근을 포함한 업무 입력·수정이 제한/);
 assert.match(copy,/기존 기록 조회와 구독 복원은 가능/);
 assert.equal(f.visibleOffers().length,1);
 assert.match(f.visibleOffers()[0].textContent,/60일 무료체험 후 월 9,900원 구독$/);
 await f.visibleOffers()[0].onclick();
 assert.equal(f.visibleOffers().length,0);
});
test('paid checkout is absent unless the server explicitly reports readiness and mode',async()=>{
 for(const response of [{ready:false,testOnly:false,productId:product.productId},
  {ready:true,productId:product.productId}]){
  const f=dialogFixture({status:async()=>response});await settle();
  assert.equal(f.visibleOffers().length,0);
 }
});

test('a paid-only offer requires reviewing immediate payment before a purchase button appears',async()=>{
 let purchased=0;
 const f=dialogFixture({status:async()=>({ready:true,testOnly:false,billingScope:'account',productId:product.productId}),products:async()=>({products:[{...product,offers:[product.offers[0]]}]}),purchase:async()=>{purchased++;return {status:'cancelled'};}});await settle();
 assert.equal(f.visibleOffers().length,0);
 const text=e=>[e.textContent||'',...e.children.map(text)].join(' ');
 assert.match(text(f.document.body),/월 9,900원/);
 assert.doesNotMatch(text(f.document.body),/60일 무료체험 후/);
 const review=f.buttons().find(b=>b.textContent==='무료체험 없는 구독 요금 확인');
 assert.match(review.style.cssText,/background:#16774c/,'paid review is the primary action');
 assert.match(text(f.document.body),/무료체험 미적용 · 오늘 9,900원 결제/);
 await review.onclick();
 assert.equal(purchased,0);assert.equal(f.visibleOffers()[0].textContent,'오늘 9,900원 결제하고 구독하기');
 await f.visibleOffers()[0].onclick();assert.equal(purchased,1);
 assert.equal(f.buttons().find(b=>b.textContent==='기존 구독 복원').parent.tagName,'div');
});
test('paid cancellation keeps the confirmed price and repeating the purchase action never silently starts a trial',async()=>{
 let calls=0;const f=dialogFixture({status:async()=>({ready:true,testOnly:false,productId:product.productId}),products:async()=>({products:[{...product,offers:[product.offers[0]]}]}),purchase:async selection=>{calls++;assert.equal(selection.trialDays,0);return {status:'cancelled'};}});await settle();
 await f.buttons().find(b=>b.textContent==='무료체험 없는 구독 요금 확인').onclick();
 await f.visibleOffers()[0].onclick();assert.equal(calls,1);
 assert.equal(f.visibleOffers()[0].textContent,'오늘 9,900원 결제하고 구독하기');
});
test('a Play lookup failure keeps the trial promotion but offers only a retry, never a paid fallback',async()=>{
 const f=dialogFixture({products:async()=>{throw Object.assign(new Error('offline'),{code:'PLAY_2'});}});await settle();
 assert.equal(f.visibleOffers().length,0);
 assert.equal(f.buttons().find(b=>b.textContent==='요금·혜택 다시 확인').hidden,false);
});
test('a Play checkout error invalidates old purchase options and requires a fresh offer lookup',async()=>{
 const f=dialogFixture({purchase:async()=>{throw Object.assign(new Error('offline'),{code:'PLAY_2'});}});await settle();
 await f.visibleOffers()[0].onclick();assert.equal(f.visibleOffers().length,0);
 assert.equal(f.buttons().find(b=>b.textContent==='요금·혜택 다시 확인').hidden,false);
});

const bindingMismatch=()=>Object.assign(Error(PURCHASE_BINDING_MISMATCH_MESSAGE),{code:'PURCHASE_BINDING_MISMATCH'});
test('a binding rejection hides purchase actions while keeping close and explicit restoration usable',async()=>{
 let purchases=0,restores=0;
 const f=dialogFixture({purchase:async()=>{purchases++;throw bindingMismatch();},restore:async()=>{restores++;throw bindingMismatch();}});await settle();
 const buy=f.visibleOffers()[0];await buy.onclick();
 assert.equal(purchases,1);assert.equal(f.visibleOffers().length,0);
 assert.equal(f.buttons().find(b=>b.textContent==='요금·혜택 다시 확인').hidden,true);
 for(const label of ['닫기','기존 구독 복원']){
  const button=f.buttons().find(b=>b.textContent===label);assert.equal(button.hidden,false);assert.equal(button.disabled,false);
 }
 await buy.onclick();assert.equal(purchases,1,'a stale hidden action cannot retry purchasing');
 await f.buttons().find(b=>b.textContent==='기존 구독 복원').onclick();assert.equal(restores,1);
 assert.equal(f.visibleOffers().length,0);
 const content=e=>[e.textContent||'',...e.children.map(content)].join(' ');
 assert.match(content(f.document.body),/기존 Google Play 구독을 현재 매니 아이디와 연결하지 못했어요/);
});
test('a binding rejection during product loading cannot introduce offers or start a trial later',async()=>{
 let release,purchases=0;
 const document=fakeDocument();
 const billing={status:async()=>({ready:true,testOnly:true,productId:product.productId}),products:()=>new Promise(resolve=>release=resolve),
  purchase:async()=>{purchases++;return{status:'cancelled'};},restore:async()=>{throw bindingMismatch();}};
 openAndroidBilling({billing,document,getContext:()=>({userId:'owner',storeId:'store',role:'storeOwner'}),launchTrial:true});await settle();
 const descendants=e=>e.children.flatMap(c=>[c,...descendants(c)]);
 const buttons=()=>descendants(document.body).filter(e=>e.tagName==='button');
 await buttons().find(b=>b.textContent==='기존 구독 복원').onclick();
 release({products:[product]});await settle();
 assert.equal(buttons().filter(b=>b.dataset.purchase==='true').length,0);assert.equal(purchases,0);
 assert.equal(buttons().find(b=>b.textContent==='닫기').disabled,false);
 assert.equal(buttons().find(b=>b.textContent==='기존 구독 복원').disabled,false);
});
test('binding rejection also blocks a paid review action already displayed in the current sheet',async()=>{
 let purchases=0;
 const f=dialogFixture({status:async()=>({ready:true,testOnly:false,productId:product.productId}),
  products:async()=>({products:[{...product,offers:[product.offers[0]]}]}),restore:async()=>{throw bindingMismatch();},
  purchase:async()=>{purchases++;return{status:'cancelled'};}});await settle();
 const review=f.buttons().find(b=>b.textContent==='무료체험 없는 구독 요금 확인');
 await f.buttons().find(b=>b.textContent==='기존 구독 복원').onclick();
 assert.equal(review.hidden,true);await review.onclick();
 assert.equal(f.visibleOffers().length,0);assert.equal(purchases,0);
});
