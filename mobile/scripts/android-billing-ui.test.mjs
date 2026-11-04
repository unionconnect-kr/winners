import test from 'node:test';import assert from 'node:assert/strict';
import {testOffers,openAndroidBilling} from '../src/android-billing-ui.mjs';
const phase={currency:'KRW',amountMicros:9900000000,price:'₩9,900',period:'P1M',recurrenceMode:1};
const product={productId:'manee.store1.monthly',offers:[{basePlanId:'monthly',offerToken:'paid',phases:[phase]},{basePlanId:'monthly',offerId:'trial-1month',offerToken:'trial',phases:[{...phase,amountMicros:0,recurrenceMode:2},phase]}]};
test('only eligible fixed monthly offers use the actual Play price and free phase',()=>{
 const offers=testOffers([product]);assert.equal(offers.length,2);assert.equal(offers[0].label,'₩9,900 (1개월)');assert.equal(offers[1].label,'무료 (1개월) → ₩9,900 (1개월)');
 for(const change of [p=>p.productId='wrong',p=>p.offers.forEach(o=>o.basePlanId='annual'),p=>p.offers.forEach(o=>o.phases.at(-1).currency='USD'),p=>p.offers.forEach(o=>o.phases.at(-1).amountMicros=19900000000)]){const p=structuredClone(product);change(p);assert.deepEqual(testOffers([p]),[]);}
});
test('offers follow the server allocated store product',()=>{
 const second={...product,productId:'manee.store2.monthly'};
 assert.equal(testOffers([product,second],'manee.store2.monthly')[0].productId,'manee.store2.monthly');
 assert.deepEqual(testOffers([second],'arbitrary-product'),[]);
});

function fakeDocument() {
 class Element {
  constructor(tag){this.tagName=tag;this.children=[];this.parent=null;this.style={};this.hidden=false;this.disabled=false;this.listeners={};}
  get isConnected(){return this===body||Boolean(this.parent?.isConnected);}
  append(child){child.parent=this;this.children.push(child);}
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
 const buttons=()=>document.body.children[0].children.filter(e=>e.tagName==='button');
 return {billing,buttons,visibleOffers:()=>buttons().filter(e=>!e.hidden&&e.textContent.endsWith(' · 테스트 구매'))};
}
test('successful checkout immediately hides all offers but keeps close and restore usable',async()=>{
 const f=dialogFixture();await settle();assert.equal(f.visibleOffers().length,2);
 await f.visibleOffers()[0].onclick();
 assert.equal(f.visibleOffers().length,0);
 for(const label of ['닫기','구매 복원'])assert.equal(f.buttons().find(b=>b.textContent===label).disabled,false);
});
test('cancelled and pending checkout keep offers while server-confirmed existing subscription hides them',async()=>{
 const f=dialogFixture();await settle();
 for(const status of ['cancelled','pending']){
  f.billing.purchase=async()=>({status});
  await f.visibleOffers()[0].onclick();assert.equal(f.visibleOffers().length,2);
 }
 f.billing.purchase=async()=>({status:'alreadyActive',testActive:true});
 await f.visibleOffers()[0].onclick();assert.equal(f.visibleOffers().length,0);
});
test('restoration before product loading finishes cannot reintroduce purchase buttons',async()=>{
 let release;
 const f=dialogFixture({products:()=>new Promise(resolve=>release=resolve)});
 await settle();
 await f.buttons().find(b=>b.textContent==='구매 복원').onclick();
 release({products:[product]});await settle();
 assert.equal(f.visibleOffers().length,0);
});
