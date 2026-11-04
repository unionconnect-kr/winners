// Offline Android asset inventory; report the selected browser engine explicitly. network writes, SMS, payments and native plugins are excluded.
import {pageCases,seedPage,showPage} from './ios-page-fixtures.mjs';
import {checkInputs} from './ios-page-interactions.mjs';
import {checkDeviceFeedback} from './ios-device-interactions.mjs';
import {mockSecureAuthForAudit} from './secure-auth-audit-fixture.mjs';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),engines=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../www');
const out=process.env.ANDROID_UI_AUDIT_OUT||mkdtempSync(resolve(tmpdir(),'manee-ui-audit-'));mkdirSync(out,{recursive:true});
const info=JSON.parse(readFileSync(root+'/build-info.json','utf8'));
if(info.platform!=='android'||![41,42,43].includes(info.versionCode)||info.environment!=='staging'||info.sourceAndroidVersion!==40)throw Error('Build Android 1.40–1.42 staging assets after mobile tests and before this audit.');
let html=mockSecureAuthForAudit(readFileSync(root+'/index.html','utf8'));
// Native plugin calls are outside this offline presentation audit.
html=html.replace('<script src="/native.js"></script>','<script>window.MANEE_NATIVE={configure(){},refresh(){},openSettings(){},openSubscriptionStatus(){}};</script>');
html=html.replace(/\((?:async )?function\(\)\{/,match=>match+' const setTimeout=()=>0; const clearTimeout=()=>{}; const setInterval=()=>0;');
html=html.replace('  initializeSocialLogin();',`window.qa={native:window.MANEE_NATIVE,state,render,renderLanding,renderOnboardingWizard,renderStaffApp,renderOwnerShell,r136,r136Overlay,sector4,renderSector4Sheet,renderOwnerHome,renderOwnerPeople,renderOwnerSales,renderOwnerOperations,renderOwnerMore,sector2,sector3,renderSector2View,renderSector3Sheet,r134,r134Overlay,r134ContractDefaults,renderConfirmOverlay,renderLightbox,renderAddStoreForm,renderSalesReportForm,r135AiSheet,renderInfoModal,r134GuideSelector,todayKey,bizToday,monthKey,r138RecentDays,db,renderOwnerStorePicker,bindLandingEvents,ownerSignupNext,ownerSignupDraft,handleStaffAuthClick,bindSector3,bindSector4,bindR136,bindOnboardingWizardEvents,decorateSocialEntry,renderVatDetail,renderFixedExpenseManage,renderMonthlyCostReview,renderOwnerProfileChanges,renderAttConfirmPrompt};`);
const engine=process.env.AUDIT_ENGINE||'chromium';
const browser=await engines[engine].launch({headless:true,...(engine==='chromium'?{args:['--no-sandbox']}:{}) ,...(process.env.AUDIT_EXECUTABLE?{executablePath:process.env.AUDIT_EXECUTABLE}:{})});
const results=[],interactions=[];
for(const width of [320,360,390,412]){
 const context=await browser.newContext({viewport:{width,height:844},isMobile:true,hasTouch:true,locale:'ko-KR'});
 await context.addInitScript(()=>{const NativeDate=Date,instant=NativeDate.parse('2026-11-03T10:00:00Z');window.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[instant]));}static now(){return instant;}};});
 const page=await context.newPage();page.setDefaultTimeout(5000);
 page.on("pageerror",e=>console.error("Page script:",e.message));
 // All requests are intercepted. Only loopback fixture assets are fulfilled;
 // every other host is aborted before any network request can be sent.
 await page.route('**/*',async route=>{const url=new URL(route.request().url());if(url.hostname!=='127.0.0.1')return route.abort();const path=url.pathname==='/'?'/index.html':url.pathname;try{await route.fulfill({body:path==='/index.html'?html:readFileSync(root+path),contentType:path.endsWith('.ttf')?'font/ttf':path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':'text/html'});}catch{await route.abort();}});
 await page.goto('http://127.0.0.1:8765/');await page.waitForFunction(()=>window.qa);
 await page.addStyleTag({content:`@font-face{font-family:QA;src:url('/report-assets/NanumGothic-Regular.ttf')}body,.app,.app *,dialog,dialog *{font-family:QA,sans-serif!important}.android-test-banner{font-family:QA,sans-serif!important}:root{--android-safe-top:0px;--android-safe-bottom:0px}`});await page.evaluate(seedPage);await page.evaluate(()=>document.fonts.ready);
 const scenes=pageCases.filter(s=>s.kind!=='native');
 for(const scene of scenes){
  try{
   await page.evaluate(showPage,scene);
   const checks=await page.evaluate(()=>{
    const controls=[...document.querySelectorAll('.app select,.app textarea,.app input:not([type=checkbox]):not([type=radio]):not([type=hidden]):not([type=file]):not([type=range]):not([type=color])')].filter(e=>e.getBoundingClientRect().height>0);
    const bad=controls.filter(e=>e.getBoundingClientRect().height<47||parseFloat(getComputedStyle(e).fontSize)<16||getComputedStyle(e).appearance!=='none').map(e=>({id:e.id,name:e.name,type:e.type,height:e.getBoundingClientRect().height,font:getComputedStyle(e).fontSize}));
    const wrappedActions=[...document.querySelectorAll('.s4-heading>.s4-btn,.s4-filters>.s4-btn,.setup-actions>button,.s2-heading>button,.s2-actions>button,.sms-row>button')].filter(e=>{if(!e.getBoundingClientRect().height)return false;const r=document.createRange();r.selectNodeContents(e);return new Set([...r.getClientRects()].map(x=>Math.round(x.top))).size>1;}).map(e=>e.textContent);
    const overflow=[...document.querySelectorAll('.app input,.app select,.app textarea,.app [role=dialog],dialog[open]')].filter(e=>{const r=e.getBoundingClientRect();return r.height>0&&getComputedStyle(e).visibility!=='hidden'&&(r.right>innerWidth+1||r.left< -1)}).map(e=>e.id||e.className||e.tagName);
    const decoratedControls=[];for(const el of document.querySelectorAll('.owner-picker select')){const icon=el.parentElement.querySelector('svg');const r=el.getBoundingClientRect();if(icon&&r.left+parseFloat(getComputedStyle(el).paddingLeft)<icon.getBoundingClientRect().right+6)decoratedControls.push('Store name overlaps icon');if(getComputedStyle(el).backgroundImage!=='none')decoratedControls.push('Duplicate store selector arrow');}
    const invalidText=/undefined|NaN|Invalid Date|�/.test(document.getElementById('app').innerText);
    const visibleIds=[...document.querySelectorAll('.app [id]')].filter(e=>e.getBoundingClientRect().height>0).map(e=>e.id);const duplicateIds=visibleIds.filter((id,i)=>visibleIds.indexOf(id)!==i);
    return {controls:controls.length,bad,overflow,wrappedActions,invalidText,duplicateIds,decoratedControls,bodyWidth:document.documentElement.scrollWidth};
   });
   results.push({width,scene:scene.name,...checks});
   if(width===390&&['entry-password-owner','expense-expense-detail-staff','s4-res-new','s4-account','owner-Home-populated'].includes(scene.name)){await page.screenshot({path:resolve(out,scene.name+'.png'),fullPage:true});await page.evaluate(()=>{for(const el of document.querySelectorAll('.s3-body,.s4-body,.s3-sheet,.s4-sheet,.expense-editor,dialog[open]'))el.scrollTop=el.scrollHeight;window.scrollTo(0,document.documentElement.scrollHeight);});await page.screenshot({path:resolve(out,scene.name+'-bottom.png'),fullPage:false});}

  }catch(e){results.push({width,scene:scene.name,error:e.message.slice(0,240)});}
 }
 if(width===390)interactions.push(...await checkInputs(page,showPage),...await checkDeviceFeedback(page,showPage));
 await context.close();
}
writeFileSync(resolve(out,'interactions.json'),JSON.stringify(interactions,null,2));
writeFileSync(resolve(out,'results.json'),JSON.stringify(results,null,2));
console.log(JSON.stringify({engine,scenes:results.length,interactions,controls:results.reduce((n,r)=>n+(r.controls||0),0),failures:results.filter(r=>r.error||r.bad.length||r.overflow.length||r.wrappedActions.length||r.invalidText||r.duplicateIds.length||r.decoratedControls.length||r.bodyWidth>r.width+1)},null,2));
await browser.close();
if(interactions.some(r=>!r.passed)||results.some(r=>r.error||r.bad.length||r.overflow.length||r.wrappedActions.length||r.invalidText||r.duplicateIds.length||r.decoratedControls.length||r.bodyWidth>r.width+1))process.exitCode=1;
