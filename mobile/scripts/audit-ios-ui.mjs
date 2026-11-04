import {mockSecureAuthForAudit} from './secure-auth-audit-fixture.mjs';
// Offline WebKit presentation fixtures. No live accounts or server writes.
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../www');
const out=process.env.IOS_UI_AUDIT_OUT||mkdtempSync(resolve(tmpdir(),'manee-ui-audit-'));mkdirSync(out,{recursive:true});
const info=JSON.parse(readFileSync(root+'/build-info.json','utf8'));
if(info.platform!=='ios'||info.environment!=='staging'||info.sourceAndroidVersion!==40)throw Error('Run npm --prefix mobile run build:ios139 after the mobile tests, before this audit.');
let html=mockSecureAuthForAudit(readFileSync(root+'/index.html','utf8'));
// Native plugin calls are outside this offline presentation audit.
html=html.replace('<script src="/native.js"></script>','<script>window.MANEE_NATIVE={configure(){}};</script>');
html=html.replace('  initializeSocialLogin();',`window.qa={state,render,renderLanding,renderOnboardingWizard,renderStaffApp,renderOwnerShell,r136,r136Overlay,sector4,renderSector4Sheet,renderOwnerHome,renderOwnerPeople,renderOwnerSales,renderOwnerOperations,renderOwnerMore};`);
const browser=await webkit.launch({headless:true,...(process.env.WEBKIT_EXECUTABLE?{executablePath:process.env.WEBKIT_EXECUTABLE}:{})});
const results=[];
for(const width of [320,375,390,430]){
 const context=await browser.newContext({viewport:{width,height:844},isMobile:true,hasTouch:true,locale:'ko-KR'});
 const page=await context.newPage();
 page.on("pageerror",e=>console.error("Page script:",e.message));
 await page.route('**/*',async route=>{const url=new URL(route.request().url());if(url.hostname!=='manee.test')return route.abort();const path=url.pathname==='/'?'/index.html':url.pathname;try{await route.fulfill({body:path==='/index.html'?html:readFileSync(root+path),contentType:path.endsWith('.ttf')?'font/ttf':path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':'text/html'});}catch{await route.abort();}});
 await page.goto('https://manee.test/');await page.waitForFunction(()=>window.qa);
 await page.addStyleTag({content:`@font-face{font-family:QA;src:url('/report-assets/NanumGothic-Regular.ttf')}body{font-family:QA,sans-serif}.ios-test-banner{font-family:QA,sans-serif!important}:root{--ios-safe-top:47px;--ios-safe-bottom:34px}`});await page.evaluate(()=>{const s=qa.state;Object.assign(s,{role:'storeOwner',loading:false,splashDone:true,store:'매니 테스트점',myUsername:'testowner',storeList:['매니 테스트점'],myStores:['매니 테스트점'],storeIdMap:{'매니 테스트점':'s'},authProfile:{user_id:'u',username:'testowner',display_name:'테스트 사용자'},authMemberships:[{store_id:'s',store_name:'매니 테스트점',role:'owner'}],crew:[{id:'c',name:'테스트 직원',position:'홀',isManager:false,payType:'hourly',hourlyWage:11000,active:true}],myCrewId:'c',dashboardData:[],dashboardLoading:true,items:{morning:[],afternoon:[],routine:[]}});});
 const scenes=[...['Home','People','Sales','Operations','More'].map(view=>({name:'owner-'+view,type:'owner',view})),...['location','cutoff','vendors','fixed','invite','checklist','preferences','review'].map(step=>({name:'setup-'+step,type:'setup',step})),...['home','schedule','reservations','expenses','checklist','announcements','sales','me','more'].flatMap(view=>['staff','manager'].map(role=>({name:role+'-'+view,type:'staff',view,role}))),...['res-new','notice-new','setting','password','account','support','manage-checks'].map(sheet=>({name:'owner-'+sheet,type:'sheet',sheet})),{name:'staff-expense-new',type:'expense'},{name:'staff-res-new',type:'sheet',sheet:'res-new',role:'staff'},...['default','request-form','staff-signup','recovery-forgot'].map(mode=>({name:'login-'+mode,type:'landing',mode}))];
 for(const scene of scenes){
  try{
   await page.evaluate(sc=>{const q=qa,s=q.state,app=document.getElementById('app');document.body.className='';app.className='app owner-ui';q.sector4().stack=[];q.r136().sheet=null;
    s.role='storeOwner';s.onboardingStep=null;s.authMemberships[0].role='owner';
    let markup='';if(sc.type==='owner'){s.section={Home:'dashboard',People:'schedule',Sales:'sales',Operations:'checklist',More:'more'}[sc.view];markup='<main>'+q['renderOwner'+sc.view]()+'</main>';}if(sc.type==='setup'){s.onboardingStep=sc.step;markup=q.renderOnboardingWizard();}
    if(sc.type==='staff'){s.role='staff';s.crew[0].isManager=sc.role==='manager';s.staffView=sc.view;s.authMemberships[0].role=s.crew[0].isManager?'manager':'staff';if(sc.view==='reservations'){const u=q.sector4();u.resLoaded=u.reservationDate;u.resLoading=false;}markup=q.renderStaffApp();}
    if(sc.type==='sheet'){s.role=sc.role||'storeOwner';q.sector4().stack=[{type:sc.sheet,id:sc.sheet==='setting'?'cutoff':''}];markup=q.renderSector4Sheet();}
    if(sc.type==='expense'){s.role='staff';q.r136().sheet={type:'expense-new',draft:{date:'2026-11-03',category:'food',payment_method:'card',payment_status:'paid'}};markup=q.r136Overlay();}
    if(sc.type==='landing'){s.role='landing';s.landingMode=sc.mode;s.landingTab=sc.mode==='staff-signup'?'staff':'owner';markup=q.renderLanding();}
    app.innerHTML=markup;window.scrollTo(0,0);
   },scene);
   const checks=await page.evaluate(()=>{
    const controls=[...document.querySelectorAll('.app select,.app input[type=date],.app input[type=time],.app input[type=month]')].filter(e=>e.getBoundingClientRect().height>0);
    const bad=controls.filter(e=>e.getBoundingClientRect().height<47||parseFloat(getComputedStyle(e).fontSize)<16||getComputedStyle(e).appearance!=='none').map(e=>({id:e.id,name:e.name,type:e.type,height:e.getBoundingClientRect().height,font:getComputedStyle(e).fontSize}));
    const wrappedActions=[...document.querySelectorAll('.s4-heading>.s4-btn,.s4-filters>.s4-btn')].filter(e=>{if(!e.getBoundingClientRect().height)return false;const r=document.createRange();r.selectNodeContents(e);return new Set([...r.getClientRects()].map(x=>Math.round(x.top))).size>1;}).map(e=>e.textContent);
    const overflow=[...document.querySelectorAll('.app input,.app select,.app textarea,.app [role=dialog]')].filter(e=>{const r=e.getBoundingClientRect();return r.height>0&&(r.right>innerWidth+1||r.left< -1)}).map(e=>e.id||e.className||e.tagName);
    return {controls:controls.length,bad,overflow,wrappedActions,bodyWidth:document.documentElement.scrollWidth};
   });
   results.push({width,scene:scene.name,...checks});
   if(scene.name==='staff-reservations')await page.screenshot({path:resolve(out,'reservations-'+width+'.png'),fullPage:true});
   if(width===390&&['setup-cutoff','setup-vendors','staff-expense-new','staff-res-new','manager-home'].includes(scene.name))await page.screenshot({path:resolve(out,scene.name+'.png'),fullPage:true});
  }catch(e){results.push({width,scene:scene.name,error:e.message.slice(0,240)});}
 }
 await context.close();
}
writeFileSync(resolve(out,'results.json'),JSON.stringify(results,null,2));
console.log(JSON.stringify({scenes:results.length,controls:results.reduce((n,r)=>n+(r.controls||0),0),failures:results.filter(r=>r.error||r.bad.length||r.overflow.length||r.wrappedActions.length||r.bodyWidth>r.width+1)},null,2));
await browser.close();
if(results.some(r=>r.error||r.bad.length||r.overflow.length||r.wrappedActions.length||r.bodyWidth>r.width+1))process.exitCode=1;
