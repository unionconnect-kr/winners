import test from 'node:test';import assert from 'node:assert/strict';
import {testOffers} from '../src/android-billing-ui.mjs';
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
