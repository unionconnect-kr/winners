import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {money,orderRecord,createHandler} from '../supabase/functions/manee-hq-integrations/orders.mjs';
const require=createRequire(import.meta.url);
const {transactionRecord,saveLedger}=require('../netlify/functions/lib/hq-apple-ledger.cjs');
const id='GPA.1234-1234-1234-12345..0';
const job={purchaseToken:'fixture-token',productId:'manee.store1.monthly',environment:'Production'};
const timestamp='2026-11-01T00:00:00Z';
const order=()=>({orderId:id,purchaseToken:job.purchaseToken,lineItems:[{productId:job.productId}],state:'PROCESSED',total:{currencyCode:'KRW',units:'9900',nanos:0},createTime:timestamp,lastEventTime:timestamp,orderHistory:{processedEvent:{eventTime:timestamp}}});
test('Google money keeps nanos exactly without using listing price or subscription price',()=>{
 assert.equal(money({currencyCode:'USD',units:'1',nanos:1}).nanos,1000000001n);
 const o=order();o.lineItems[0].listingPrice={currencyCode:'KRW',units:'99999'};assert.equal(orderRecord(o,job,id).amount,'9900.000000000');
 assert.throws(()=>money({currencyCode:'KRW',units:'-1'}));assert.throws(()=>money({currencyCode:'KRW',units:'1',nanos:1e9}));
});
test('completed partial refunds are summed; pending requests are not refunds',()=>{
 const o=order();o.state='PARTIALLY_REFUNDED';o.orderHistory.partialRefundEvents=[{state:'PROCESSED_SUCCESSFULLY',processTime:timestamp,refundDetails:{total:{currencyCode:'KRW',units:'2000'}}},{state:'PENDING',refundDetails:{total:{currencyCode:'KRW',units:'1000'}}}];
 const r=orderRecord(o,job,id);assert.equal(r.refundAmount,'2000.000000000');assert.equal(r.status,'partial_refund');
});
test('missing refund details stay unknown, and currency mismatches are rejected',()=>{
 const o=order();o.state='REFUNDED';assert.equal(orderRecord(o,job,id).refundAmount,null);
 o.orderHistory.refundEvent={eventTime:timestamp,refundDetails:{total:{currencyCode:'USD',units:'9'}}};assert.throws(()=>orderRecord(o,job,id),/currency_mismatch/);
});
test('order ID, product and purchase token must all match before a transaction is stored',()=>{
 for(const change of [{orderId:'GPA.9999-1234-1234-12345..0'},{purchaseToken:'other'},{lineItems:[{productId:'other'}]}])assert.throws(()=>orderRecord({...order(),...change},job,id),/order_mismatch/);
});
test('Google synchronization authenticates dispatch before reading provider data',async()=>{
 let reads=0;const h=createHandler({client:{rpc:async()=>({error:{code:'42501'}})},api:{get:()=>{reads++;}}});
 assert.equal((await h(new Request('https://test',{method:'POST'}))).status,401);
 assert.equal((await h(new Request('https://test',{method:'POST',headers:{authorization:'Bearer '+'a'.repeat(64)}}))).status,403);assert.equal(reads,0);
});
test('Google sync stores only sanitized transaction fields and reports failures without tokens',async()=>{
 const calls=[];const client={rpc:async(name,args)=>{calls.push({name,args});return name==='hq_billing_sync_claim'?{data:[{...job,orders:[]}]}:{data:true};}};
 const h=createHandler({client,api:{get:async()=>({lineItems:[{latestSuccessfulOrderId:id}]}),order:async()=>({...order(),buyerAddress:{buyerPostcode:'SECRET'}})},binding:()=>({}),verifiedRecord:()=>({environment:'Production'})});
 const response=await h(new Request('https://test',{method:'POST',headers:{authorization:'Bearer '+'a'.repeat(64)}}));assert.equal((await response.json()).records,1);
 assert.equal(JSON.stringify(calls.find(x=>x.name==='manee_hq_record_transaction')).includes('SECRET'),false);
});
const apple=()=>({environment:'Production',transactionId:'12345678',appAccountToken:'00000000-0000-4000-8000-000000000001',productId:'manee.store1.monthly',price:9900000,currency:'KRW',purchaseDate:Date.parse(timestamp),signedDate:Date.parse(timestamp)});
test('Apple milliunit display prices and prorated refunds retain exact precision',()=>{
 const r=transactionRecord({...apple(),revocationDate:Date.parse(timestamp),revocationType:'REFUND_PRORATED',revocationPercentage:25000});
 assert.equal(r.amount,'9900.000');assert.equal(r.refundAmount,'2475.00000000');assert.equal(r.status,'partial_refund');
});
test('Apple missing prices and legacy refund amounts are never invented',()=>{
 assert.equal(transactionRecord({...apple(),price:undefined}).amount,null);
 assert.equal(transactionRecord({...apple(),revocationDate:Date.parse(timestamp)}).refundAmount,null);
 assert.equal(transactionRecord({...apple(),revocationDate:Date.parse(timestamp),revocationType:'FAMILY_REVOKE'}).status,'revoked');
});
test('ledger reporting outage never throws through a successful entitlement flow',async()=>{
 assert.equal(await saveLedger({rpc:async()=>{throw Error('private failure');}},[transactionRecord(apple())]),false);
 assert.equal(await saveLedger({rpc:async()=>({data:true})},[null]),false);
});
test('all modified app scripts parse, including inline boot code',()=>{
 const html=fs.readFileSync(new URL('../web/index.html',import.meta.url),'utf8');
 for(const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi))if(!/\bsrc=/.test(m[1])&&m[2].trim())new vm.Script(m[2]);
 new vm.Script(fs.readFileSync(new URL('../web/manee-support.js',import.meta.url),'utf8'));
});
test('member support escapes message HTML, preserves failed drafts and closes on sign-out',async()=>{
 const {JSDOM}=require('jsdom');const dom=new JSDOM('<html><body></body></html>',{runScripts:'outside-only',url:'https://fixture.invalid'});const w=dom.window;
 w.HTMLDialogElement.prototype.showModal=function(){};
 let authListener;let writes=0;
 const db={auth:{onAuthStateChange:f=>{authListener=f;return{data:{subscription:{unsubscribe(){}}}};}},rpc:async(name,args)=>{
  if(args.p_action==='list')return {data:{tickets:[{id:'x',title:'<img src=x onerror=alert(1)>',status:'open',updated_at:timestamp}]}};
  if(args.p_action==='create'){writes++;return{error:{message:'unavailable'}};}
  return{data:{}};
 }};
 w.eval(fs.readFileSync(new URL('../web/manee-support.js',import.meta.url),'utf8'));w.MANEE_SUPPORT.open({db,userId:'u',isAlive:()=>true});await new Promise(r=>setImmediate(r));
 assert.equal(w.document.querySelector('img'),null);assert.match(w.document.body.textContent,/<img/);
 w.document.querySelector('[data-support=new]').click();const form=w.document.querySelector('form');form.elements.title.value='Keep title';form.elements.body.value='Keep body';form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await new Promise(r=>setImmediate(r));
 assert.equal(writes,1);assert.equal(form.elements.body.value,'Keep body');assert.match(w.document.querySelector('[role=status]').textContent,/처리하지 못/);
 authListener('SIGNED_OUT',null);assert.equal(w.document.querySelector('dialog'),null);dom.window.close();
});
