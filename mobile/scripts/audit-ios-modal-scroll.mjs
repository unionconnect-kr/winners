// Offline browser audit: no real accounts, purchase, SMS or server writes.
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url),{webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
(async()=>{
 const native=fs.readFileSync(root+'/src/native.js','utf8').replace(/^import .*;\r?\n/gm,'');
 const entry=`
 import {createModalScrollLock as realLock} from './src/modal-scroll-lock.mjs';
 import {createSubscriptionSheet,subscriptionButton,setSubscriptionOffer,createSubscriptionStatusSheet} from './src/subscription-sheet.mjs';
 import {subscriptionView} from './src/store-subscription.mjs';
 import {purchaseAccountMessage} from './src/billing.mjs';
 const createModalScrollLock=window.baseline?()=>()=>()=>{}:realLock;
 const registerPlugin=()=>({addListener(){}}),Geolocation={},PushNotifications={};
 const createNativeGeolocation=()=>({}),createIosPush=()=>({}),createSignupCheckout=()=>()=>{};
 const createNotificationNavigation=()=>({start:async()=>{},flush:async()=>{}});
 const createBillingClient=()=>({status:async()=>({ready:true,appAccountToken:'token',subscriptions:[],accountConflict:true}),products:async()=>({monthly:true,priceApproved:true,price:'9,900원',twoMonthsFree:true})});
 ${native}
 window.MANEE_NATIVE.configure(()=>({userId:'owner',storeId:'review',role:'storeOwner',storeName:'매니 심사 전용 가상매장',db:{rpc:async()=>({data:{enforced:true,canWrite:false}})}}));
 `;
 const bundle=await build({stdin:{contents:entry,resolveDir:root},bundle:true,write:false,format:'iife',target:'safari15'});
 const browser=await webkit.launch({headless:true});
 const results=[];
 try{
  for(const viewport of [{width:390,height:844},{width:820,height:1180}])for(const baseline of [true,false]){
   const context=await browser.newContext({viewport,isMobile:false,hasTouch:true,deviceScaleFactor:1});
   const page=await context.newPage();
   const errors=[];page.on('pageerror',e=>errors.push(String(e)));
   const css=fs.readFileSync(root+'/src/ios-ui.css','utf8');
   await page.route('http://manee.test/**',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;display:flex;justify-content:center;font:16px sans-serif;background:#f5f7f4}.app{max-width:480px;width:100%}main{height:3500px;background:linear-gradient(white,#9cbaaa)}dialog::backdrop{background:#243d3050}</style>${baseline?'':'<style>'+css+'</style>'}<body><div class="app"><h1>매니 더보기</h1><main>배경 화면</main></div></body>`}));
   await page.goto('http://manee.test/');await page.evaluate(value=>window.baseline=value,baseline);
   await page.addScriptTag({content:bundle.outputFiles[0].text});
   await page.evaluate(()=>window.scrollTo(0,428));
   await page.evaluate(()=>window.MANEE_NATIVE.openSubscriptionStatus());await page.waitForTimeout(100);
   const sheet=page.locator('#manee-subscription-status'),box=await sheet.boundingBox();
   const before=await page.evaluate(()=>({root:scrollY,background:document.querySelector('main').getBoundingClientRect().top}));
   // Actual wheel input exercises WebKit scrolling, rather than assigning a
   // scroll offset in JavaScript. Touch-direction handling is tested separately.
   await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
   await page.mouse.wheel(0,400);await page.waitForTimeout(350);
   const backgroundBeforeBackdrop=await page.locator('main').evaluate(e=>e.getBoundingClientRect().top);
   await page.mouse.move(3,3);await page.mouse.wheel(0,400);await page.waitForTimeout(350);
   if(!baseline)assert.equal(await page.locator('main').evaluate(e=>e.getBoundingClientRect().top),backgroundBeforeBackdrop,'backdrop wheel moved page');
   const after=await page.evaluate(()=>({root:scrollY,background:document.querySelector('main').getBoundingClientRect().top}));
   if(!baseline){assert.equal(after.background,before.background,'fixed page moved on content swipe');
    await sheet.getByRole('button',{name:'구독 확인',exact:true}).click();await page.waitForTimeout(100);
    assert.equal(await page.locator('body').evaluate(b=>b.style.position),'fixed');
    const checkout=page.locator('#manee-ios-billing');
    await checkout.locator('details').evaluate(d=>{d.open=true;d.querySelector('p').textContent+=' '+('구독 안내문을 확인하세요. '.repeat(200));});
    await checkout.evaluate(d=>{d.scrollTop=0;});const cb=await checkout.boundingBox();
    await page.mouse.move(cb.x+cb.width/2,cb.y+cb.height/2);await page.mouse.wheel(0,400);await page.waitForTimeout(200);
    assert.ok(await checkout.evaluate(d=>d.scrollTop>0),'long dialog must scroll inside');
    await checkout.evaluate(d=>d.scrollTop=d.scrollHeight);const bgBottom=await page.locator('main').evaluate(e=>e.getBoundingClientRect().top);
    await page.mouse.wheel(0,500);await page.waitForTimeout(200);assert.equal(await page.locator('main').evaluate(e=>e.getBoundingClientRect().top),bgBottom,'bottom swipe leaked to background');
    await checkout.getByRole('button',{name:'닫기',exact:true}).click();await page.waitForTimeout(100);
    assert.equal(await page.evaluate(()=>scrollY),428,'closing must restore previous page position');
    assert.equal(await page.locator('body').evaluate(b=>b.style.position),'');
   }
   assert.deepEqual(errors,[]);results.push({viewport:viewport.width,baseline,before,after,backgroundMoved:before.background!==after.background});await context.close();
  }
 }finally{await browser.close();}
 // The control records behavior of this WebKit version; older iPhones may
 // differ. Only the corrected page-lock behavior is a release requirement.
 const out=process.env.IOS_UI_AUDIT_OUT;if(out){fs.mkdirSync(out,{recursive:true});fs.writeFileSync(resolve(out,'modal-scroll.json'),JSON.stringify(results,null,2));}
 console.log(JSON.stringify({engine:'WebKit',checks:results}));
})().catch(e=>{console.error(e);process.exitCode=1;});
