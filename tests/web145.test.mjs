import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM, VirtualConsole} from 'jsdom';
import {pageCases, seedPage, showPage} from './fixtures/web145-pages.mjs';

const read = path => readFileSync(new URL('../'+path, import.meta.url),'utf8');
const html = read('web/index.html');
const config = JSON.parse(read('config/environments.json'));
const exposed = `native:window.MANEE_WEB,state,render,renderLanding,renderOnboardingWizard,renderStaffApp,renderOwnerShell,r136,r136Overlay,sector4,renderSector4Sheet,renderOwnerHome,renderOwnerPeople,renderOwnerSales,renderOwnerOperations,renderOwnerMore,sector2,sector3,renderSector2View,renderSector3Sheet,r134,r134Overlay,r134ContractDefaults,renderConfirmOverlay,renderLightbox,renderAddStoreForm,renderSalesReportForm,r135AiSheet,renderInfoModal,r134GuideSelector,todayKey,bizToday,monthKey,r138RecentDays,db,renderOwnerStorePicker,bindLandingEvents,ownerSignupNext,ownerSignupDraft,handleStaffAuthClick,bindSector3,bindSector4,bindR136,bindOnboardingWizardEvents,decorateSocialEntry,renderVatDetail,renderFixedExpenseManage,renderMonthlyCostReview,renderOwnerProfileChanges,renderAttConfirmPrompt,maneeAuthStorage,maneeSetRememberLogin,maneeArmLogin,MANEE_AUTH_KEY,MANEE_STORE_KEY,smsApi,smsProofPayload,syncAuthAcrossTabs,clearStaffAuthView,canManageBusinessData,refreshPushSubStatus,subscribeToPush,unsubscribeFromPush`;

function application(environment='production', stored={}) {
  const errors=[];
  const vc=new VirtualConsole(); vc.on('jsdomError',e=>errors.push(e));
  const dom=new JSDOM(html,{url:'https://winners-staffapp.netlify.app/',runScripts:'outside-only',virtualConsole:vc});
  const w=dom.window;
  w.structuredClone=structuredClone; w.TextEncoder=TextEncoder; w.TextDecoder=TextDecoder;
  w.scrollTo=()=>{}; w.matchMedia=()=>({matches:false});
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
  w.MANEE_CONFIG={...config[environment],webSmsAuthEnabled:true,socialProviders:{naver:true}};
  for(const [key,value] of Object.entries(stored))w.localStorage.setItem(key,value);
  const network=[];
  w.fetch=async(...args)=>{network.push(args);throw Error('Unexpected network request in offline web test');};
  const db={auth:{onAuthStateChange(){return {data:{subscription:{unsubscribe(){}}}};},getSession:async()=>({data:{session:null}})},rpc:async()=>({data:{enforced:false}})};
  w.supabase={createClient(){return db;}};
  w.eval(read('web/web-platform.js'));w.eval(read('web/social-auth.js'));
  let source=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].find(m=>!m[1].includes('src=')&&m[2].trim())[2];
  source=source.replace('(function(){','(function(){ const setTimeout=()=>0,clearTimeout=()=>{},setInterval=()=>0;');
  if(environment==='production')source=source.replace('const MANEE_STAFF_AUTH_ENABLED = MANEE_IS_STAGING;','const MANEE_STAFF_AUTH_ENABLED = true;');
  source=source.replace('  initializeSocialLogin();','window.qa={'+exposed+'};');
  w.eval(source);assert.ok(w.qa,'application bootstrapped');
  w.eval('('+seedPage.toString()+')()');
  w.openCase = sc => w.eval('('+showPage.toString()+')('+JSON.stringify(sc)+')');
  return {dom,w,q:w.qa,network,errors,close:()=>dom.window.close()};
}

for(const environment of ['production','staging'])test(`1.45 ${environment}: owner, staff and manager page inventory renders without invalid values`,async()=>{
  const app=application(environment);
  try{
    for(const scene of pageCases){
      await app.w.openCase(scene);
      const content=app.w.document.getElementById('app');
      assert.ok(content.innerHTML.trim(),scene.name);
      assert.doesNotMatch(content.textContent,/undefined|NaN|Invalid Date|�/,scene.name);
      const ids=[...content.querySelectorAll('[id]')].map(e=>e.id);
      assert.equal(new Set(ids).size,ids.length,'duplicate control id: '+scene.name);
      for(const dialog of app.w.document.querySelectorAll('dialog'))dialog.close();
    }
    assert.deepEqual(app.errors,[]);
    assert.equal(app.network.length,0);
  }finally{app.close();}
});

test('production reload reads the existing browser session and selected store without native keychain',()=>{
  const key='sb-'+config.production.projectRef+'-auth-token',session=JSON.stringify({user:{id:'existing-owner'},access_token:'fixture-only'});
  const app=application('production',{[key]:session,'auth-store-id':'existing-store'});
  try{assert.equal(app.q.maneeAuthStorage.getItem(key),session);assert.equal(app.q.maneeAuthStorage.getItem('auth-store-id'),'existing-store');}finally{app.close();}
});

test('login without remember stores the new account only in sessionStorage',()=>{
  const app=application();try{
    const q=app.q,session=JSON.stringify({user:{id:'new-owner'},access_token:'fixture-only'});
    q.maneeSetRememberLogin(false);q.maneeArmLogin('new-owner');q.maneeAuthStorage.setItem(q.MANEE_AUTH_KEY,session);
    assert.equal(app.w.sessionStorage.getItem(q.MANEE_AUTH_KEY),session);assert.equal(app.w.localStorage.getItem(q.MANEE_AUTH_KEY),null);
  }finally{app.close();}
});

test('owner and staff signup require verified phone proof in both environments',async()=>{
  for(const environment of ['production','staging']){
    const app=application(environment);try{
      for(const role of ['owner','staff']){
        await app.w.openCase(role==='owner'?{kind:'owner-signup',id:'2',name:'owner-signup'}:{kind:'staff-signup',id:'form',role,variant:'default',name:'staff-signup'});
        assert.ok(app.w.document.querySelector('[data-sms-box]'),role);
        assert.throws(()=>app.q.smsProofPayload('signup_'+role),/문자 인증/);
      }
      assert.equal(app.network.length,0);
    }finally{app.close();}
  }
});

test('SMS provider failure stays on the configured backend and cannot create a signup proof',async()=>{
  for(const environment of ['production','staging']){
    const app=application(environment);try{
      const calls=[];
      app.w.fetch=async(url,options)=>{
        calls.push({url,options});
        return {ok:false,json:async()=>({ok:false,error:'sms_unavailable',message:'문자 인증을 준비 중이에요.'})};
      };
      await assert.rejects(app.q.smsApi({action:'request',purpose:'signup_staff',username:'fixtureuser',phone:'01000000000'}),/문자 인증/);
      assert.equal(calls.length,1);
      assert.equal(calls[0].url,config[environment].supabaseUrl+'/functions/v1/manee-sms-auth');
      assert.equal(calls[0].options.headers.apikey,config[environment].publishableKey);
      assert.throws(()=>app.q.smsProofPayload('signup_staff'),/문자 인증/);
    }finally{app.close();}
  }
});

test('browser push unsubscribe removes the owned endpoint and browser subscription',async()=>{
  const app=application();try{
    const calls=[];
    const sub={endpoint:'https://push.example.invalid/fixture',toJSON:()=>({endpoint:sub.endpoint,keys:{p256dh:'fixture',auth:'fixture'}}),unsubscribe:async()=>{calls.push('browser');return true;}};
    Object.defineProperty(app.w.navigator,'serviceWorker',{value:{ready:Promise.resolve({pushManager:{getSubscription:async()=>sub}})}});
    app.q.db.rpc=async(name,payload)=>{calls.push({name,payload});return {data:true};};
    await app.q.unsubscribeFromPush();
    assert.equal(calls[0].name,'manee_unregister_owner_push');assert.equal(calls[0].payload.p_endpoint,sub.endpoint);assert.equal(calls[1],'browser');
    assert.equal(app.q.state.pushSubscribed,false);assert.equal(app.q.state.pushRegistrationError,null);
  }finally{app.close();}
});

test('subscription lookup cannot show another account/store response',async()=>{
  const app=application();try{
    let resolve;app.q.db.rpc=()=>new Promise(r=>resolve=r);
    app.w.MANEE_WEB.openSubscriptionStatus();assert.ok(app.w.document.querySelector('#manee-web-subscription'));
    app.q.state.authProfile.user_id='another-user';resolve({data:{enforced:true,canWrite:true}});
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(app.w.document.querySelector('#manee-web-subscription'),null);
  }finally{app.close();}
});


test('another-account and logout events clear private view data; failed lookups preserve the current account',async()=>{
  for(const result of [{data:{session:null}},{data:{session:{user:{id:'other-account'}}}},{error:Error('offline')}]){
    const app=application();try{
      app.q.db.auth.getSession=async()=>result;
      await app.q.syncAuthAcrossTabs();
      if(result.error){assert.equal(app.q.state.authProfile.user_id,'u');assert.equal(app.q.state.role,'storeOwner');}
      else{assert.equal(app.q.state.role,'landing');assert.equal(app.q.state.authProfile,null);assert.equal(app.q.state.crew.length,0);assert.equal(app.q.state.salesReports.length,0);}
    }finally{app.close();}
  }
});

test('an old employee manager flag cannot grant the owner business controls',()=>{
  const app=application();try{
    const s=app.q.state;assert.equal(app.q.canManageBusinessData(),true);
    s.role='staff';s.crew[0].isManager=true;s.authMemberships[0].role='staff';assert.equal(app.q.canManageBusinessData(),false);
    s.authMemberships[0].role='manager';assert.equal(app.q.canManageBusinessData(),false);
    s.role='storeOwner';s.authMemberships[0].role='owner';s.storeIdMap[s.store]='different-store';assert.equal(app.q.canManageBusinessData(),false);
  }finally{app.close();}
});
