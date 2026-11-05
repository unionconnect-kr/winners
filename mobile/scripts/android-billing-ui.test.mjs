import test from 'node:test';import assert from 'node:assert/strict';
import {testOffers,openAndroidBilling} from '../src/android-billing-ui.mjs';
const phase={currency:'KRW',amountMicros:9900000000,price:'₩9,900',period:'P1M',recurrenceMode:1};
const product={productId:'manee.store1.monthly',offers:[{basePlanId:'monthly',offerToken:'paid',phases:[phase]},{basePlanId:'monthly',offerId:'trial-60days',offerToken:'trial',phases:[{...phase,amountMicros:0,period:'P60D',cycles:1,recurrenceMode:2},phase]}]};
test('only eligible fixed monthly offers use the actual Play price and free phase',()=>{
 const offers=testOffers([product]);assert.equal(offers.length,1);assert.equal(offers[0].label,'무료 (60일) → ₩9,900 (1개월)');assert.equal(offers[0].offerToken,'trial');
 for(const change of [p=>p.productId='wrong',p=>p.offers.forEach(o=>o.basePlanId='annual'),p=>p.offers.forEach(o=>o.phases.at(-1).currency='USD'),p=>p.offers.forEach(o=>o.phases.at(-1).amountMicros=19900000000)]){const p=structuredClone(product);change(p);assert.deepEqual(testOffers([p]),[]);}
});
test('trial offer requires exactly sixty free days before the monthly price',()=>{
 for(const change of [p=>p.offers[1].phases[0].period='P1W',p=>p.offers[1].phases[0].period='P1M',p=>p.offers[1].phases[0].period='P2M',p=>p.offers[1].offerId='trial-1month',
  p=>p.offers[1].phases[0].cycles=2,p=>p.offers[1].phases[0].amountMicros=1000000,
  p=>p.offers[1].phases.splice(1,0,{...phase,amountMicros:0,period:'P60D',cycles:1,recurrenceMode:2})]){
  const p=structuredClone(product);change(p);
  assert.deepEqual(testOffers([p]).map(o=>o.offerToken),['paid']);
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
 await f.buttons().find(b=>b.textContent==='무료체험 없는 구독 요금 확인').onclick();
 assert.equal(purchased,0);assert.equal(f.visibleOffers()[0].textContent,'월 9,900원으로 구독하기');
 await f.visibleOffers()[0].onclick();assert.equal(purchased,1);
 assert.equal(f.buttons().find(b=>b.textContent==='기존 구독 복원').parent.tagName,'div');
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
