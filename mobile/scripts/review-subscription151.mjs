// Exercise the actual Android adapter and dialog event handlers in Chromium.
// Only the native SDK transport and authenticated server responses are synthetic.
import {build} from 'esbuild';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('..',import.meta.url)),out='/tmp/manee151-ui-review';mkdirSync(out,{recursive:true});
const entry=`import './src/native-android.js';
const mode=new URLSearchParams(location.search).get('state'),calls=[];
const phase={currency:'KRW',amountMicros:9900000000,price:'₩9,900',period:'P1M',recurrenceMode:1};
const paid={basePlanId:'monthly',offerToken:'paid',phases:[phase]};
const trial={basePlanId:'monthly',offerId:'trial-60days',offerToken:'trial',phases:[{...phase,amountMicros:0,period:'P60D',cycles:1,recurrenceMode:2},phase]};
let products=0,purchases=0;
window.reviewPlay={products:async()=>{products++;if(mode==='retry'&&products===1)throw Object.assign(Error('Google Play 연결 오류 · 다시 확인해 주세요.'),{code:'PLAY_2'});return {products:[{productId:'manee.store1.monthly',offers:mode==='paid'?[paid]:[trial]}]};},purchases:async()=>({purchases:[]}),purchase:async()=>{purchases++;return {status:'cancelled'};}};
const c={userId:'owner',storeId:'store',role:'storeOwner',storeName:'매니 테스트매장',db:{auth:{getSession:async()=>({data:{session:{user:{id:'owner'}}}})},rpc:async()=>({data:{enforced:true,canWrite:false}}),functions:{invoke:async(name,{body})=>{calls.push(body.action);return {data:{ready:true,testOnly:false,billingScope:'account',productId:'manee.store1.monthly',checkoutId:body.checkoutId,accountId:'a'.repeat(64),profileId:'b'.repeat(64)}};}}}};
window.MANEE_NATIVE.configure(()=>c);
const settle=()=>new Promise(r=>setTimeout(r,40));
const check=(ok,label)=>{if(!ok)throw Error(label);};
const button=(id,label)=>[...document.querySelectorAll('#'+id+' button')].find(b=>b.textContent===label);
void(async()=>{try{
 if(mode==='signup'){await window.MANEE_NATIVE.afterOwnerSignup();await settle();check(purchases===0,'signup_started_purchase');}
 else{
  window.MANEE_NATIVE.subscriptionDenied();await settle();
  const start=button('manee-subscription-status','무료체험·구독 확인');check(!!start&&!start.hidden,'missing_status_action');start.click();if(mode==='double')start.click();await settle();
  check(!document.getElementById('manee-subscription-status'),'status_not_removed');check(document.getElementById('manee-android-billing')?.open,'checkout_not_open');
  window.MANEE_NATIVE.subscriptionDenied();await settle();check(!document.getElementById('manee-subscription-status'),'denial_covered_checkout');
  if(mode==='paid'){check(purchases===0,'silent_paid_fallback');button('manee-android-billing','무료체험 없는 구독 요금 확인').click();await settle();check(purchases===0,'review_started_payment');document.querySelector('[data-purchase=true]').click();await settle();}
  if(mode==='retry'){check(purchases===0,'failed_lookup_started_purchase');button('manee-android-billing','요금·혜택 다시 확인').click();await settle();check(document.getElementById('manee-android-billing')?.open&&products===2,'retry_closed_checkout');document.querySelector('[data-purchase=true]').click();await settle();}
  check(purchases===1,'native_checkout_not_exactly_once');check(calls.includes('prepare'),'server_prepare_missing');
 }
 check(document.querySelectorAll('dialog[open]').length===1,'duplicate_dialogs');
 const d=document.querySelector('dialog[open]'),rect=d.getBoundingClientRect();check(rect.width<=innerWidth-20&&d.scrollWidth<=d.clientWidth+1,'horizontal_overflow');
 document.body.dataset.review='passed';document.body.dataset.nativePurchases=String(purchases);
}catch(e){document.body.dataset.review=e.message;}})();`;
const bundle=await build({stdin:{contents:entry,resolveDir:root,sourcefile:'review-subscription151.js'},bundle:true,write:false,format:'iife',define:{ANDROID_PAID_BILLING:'true',ANDROID_PRODUCTION:'true',ANDROID_FIREBASE_PROJECT:'""'},plugins:[{name:'synthetic-native-transport',setup(b){
 b.onResolve({filter:/^@capacitor\/(core|push-notifications|geolocation)$/},a=>({path:a.path,namespace:'review-native'}));
 b.onLoad({filter:/.*/,namespace:'review-native'},a=>({contents:a.path.endsWith('/core')?'export const registerPlugin=()=>new Proxy({},{get:(_,method)=>(...args)=>window.reviewPlay[method](...args)});':a.path.endsWith('/geolocation')?'export const Geolocation={};':'export const PushNotifications={addListener:async()=>({remove:async()=>{}})};',loader:'js'}));
}}]});
const font=readFileSync(root+'/release139/assets/report-assets/NanumGothic-Regular.ttf').toString('base64');
writeFileSync(out+'/review.html',`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>@font-face{font-family:Review;src:url(data:font/ttf;base64,${font})}body{margin:0;background:#f3f7f4;font-family:Review,sans-serif;color:#173f2e}header{padding:28px;font-size:20px}dialog::backdrop{background:#193b2c35}[hidden]{display:none!important}</style><body><header>매장 준비 3 / 8</header><script>${bundle.outputFiles[0].text}</script></body></html>`);
for(const width of [360,390])for(const state of ['trial','retry','paid','double','signup']){
 const base=out+'/'+state+'-'+width;
 const dom=execFileSync('google-chrome',['--headless','--no-sandbox','--hide-scrollbars','--disable-gpu','--window-size='+width+',844','--force-device-scale-factor=1','--virtual-time-budget=2000','--screenshot='+base+'.png','--dump-dom','file://'+out+'/review.html?state='+state],{maxBuffer:8000000,encoding:'utf8',stdio:['ignore','pipe','ignore']});
 assert.match(dom,/data-review="passed"/,'Interaction review failed: '+state+' '+width+' '+dom.match(/data-review="[^"]*"/)?.[0]);
 console.log('Verified '+state+' at '+width+'px: real dialog clicks, delayed close, native checkout count and no overlap.');
}
