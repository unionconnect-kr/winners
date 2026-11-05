import {build} from 'esbuild';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('..',import.meta.url)),out='/tmp/manee150-ui-review';mkdirSync(out,{recursive:true});
const font=readFileSync(root+'/release139/assets/report-assets/NanumGothic-Regular.ttf').toString('base64');
const entry=`import {openAndroidBilling} from './src/android-billing-ui.mjs';
import {createSubscriptionStatusSheet,subscriptionButton} from './src/subscription-sheet.mjs';
const state=new URLSearchParams(location.search).get('state');
const phase={currency:'KRW',amountMicros:9900000000,price:'₩9,900',period:'P1M',recurrenceMode:1};
const paid={basePlanId:'monthly',offerToken:'paid',phases:[phase]};
if(state==='status'){
 const v=createSubscriptionStatusSheet(document,{storeName:'매니 테스트매장',platform:'android'});
 v.price.textContent='매장 이용권 확인 필요';v.status.textContent='이 매장의 기록은 볼 수 있지만 출퇴근을 포함한 업무 입력·수정은 제한됩니다. 구독 상태를 확인해 주세요.';
 subscriptionButton(v,'무료체험·구독 확인',()=>{});subscriptionButton(v,'닫기',()=>v.sheet.close(),'secondary');subscriptionButton(v,'상태 새로고침',()=>{},'link');document.body.append(v.sheet);v.sheet.showModal();
}else{
 openAndroidBilling({document,getContext:()=>({userId:'fixture',storeId:'fixture',role:'storeOwner',storeName:'매니 테스트매장'}),billing:{
  status:async()=>({ready:true,testOnly:false,billingScope:'account',productId:'manee.store1.monthly'}),
  products:async()=>{if(state==='offline')throw Error('Google Play 연결이 원활하지 않아요. 요금·혜택을 다시 확인해 주세요.');return {products:[{productId:'manee.store1.monthly',offers:state==='paid'?[paid]:[paid,{basePlanId:'monthly',offerId:'trial-60days',offerToken:'trial',phases:[{...phase,amountMicros:0,period:'P60D',cycles:1,recurrenceMode:2},phase]}]}]};},
  purchase:async()=>({status:'cancelled'}),restore:async()=>({status:'empty'})}});
}
setTimeout(()=>{
 try{
  const d=document.querySelector('dialog'),rect=d.getBoundingClientRect();
  if(rect.width>innerWidth-20||d.scrollWidth>d.clientWidth+1||rect.bottom>innerHeight)throw Error('dialog_overflow');
  const buttons=[...d.querySelectorAll('button')].filter(x=>getComputedStyle(x).display!=='none');
  if(buttons.some(x=>x.getBoundingClientRect().height<43))throw Error('small_button');
  if(state==='offline'&&buttons.some(x=>x.dataset.purchase==='true'))throw Error('paid_fallback');
  if(state==='paid'&&buttons.some(x=>x.dataset.purchase==='true'))throw Error('unreviewed_paid_checkout');
  if(state==='trial'&&!buttons.some(x=>x.textContent==='60일 무료체험 후 월 9,900원 구독'))throw Error('missing_trial_terms');
  document.body.dataset.review='passed';
 }catch(e){document.body.dataset.review=e.message;}
},250);`;
const bundle=await build({stdin:{contents:entry,resolveDir:root,sourcefile:'review-subscription150.js'},bundle:true,write:false,format:'iife'});
writeFileSync(out+'/review.html',`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>@font-face{font-family:Review;src:url(data:font/ttf;base64,${font})}body{margin:0;background:#f3f7f4;font-family:Review,sans-serif;color:#173f2e}header{padding:28px;font-size:28px;font-weight:bold}dialog::backdrop{background:#193b2c35}[hidden]{display:none!important}</style><body><header>매니</header><script>${bundle.outputFiles[0].text}</script></body></html>`);
for(const width of [360,390])for(const state of ['status','trial','offline','paid']){
 const base=out+'/'+state+'-'+width;
 const dom=execFileSync('google-chrome',['--headless','--no-sandbox','--hide-scrollbars','--disable-gpu','--no-pdf-header-footer','--window-size='+width+',844','--force-device-scale-factor=1','--virtual-time-budget=1500','--screenshot='+base+'.png','--dump-dom','file://'+out+'/review.html?state='+state],{maxBuffer:8000000,encoding:'utf8',stdio:['ignore','pipe','ignore']});
 assert.match(dom,/data-review="passed"/,'Layout review failed: '+state+' '+width);
 console.log('Verified '+state+' at '+width+'px: no overflow, usable buttons, correct purchase state.');
}
