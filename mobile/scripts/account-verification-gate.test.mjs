import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {hardenUi} from '../../scripts/harden-ui.mjs';
import {adaptIos139,adaptIos139Social} from './adapt-ios139.mjs';
import {secureAuthHtml} from './secure-auth-html.mjs';
import {launch143Html} from './launch143-html.mjs';
import {signupCheckoutHtml} from './signup-checkout-html.mjs';
import {feedback144Html} from './feedback144-html.mjs';
import {installEmailVerification} from './email-verification-html.mjs';
import {installAccountVerificationGate,installAccountVerificationReauth,enableAccountVerificationConfig} from './account-verification-html.mjs';

const read = path => readFileSync(new URL(path,import.meta.url),'utf8');
const baseline = read('../release139/assets/index.html');
const social = read('../release139/assets/social-auth.js');
const configSource = read('../release139/assets/app-config.js');
const settle = () => new Promise(resolve=>setImmediate(resolve));

function htmlFor(platform){
  const adapted = secureAuthHtml(hardenUi(adaptIos139(baseline,platform)));
  const stage = feedback144Html(signupCheckoutHtml(launch143Html(adapted,platform)));
  return installAccountVerificationGate(installEmailVerification(stage));
}
const html = htmlFor('android');
const section = (start,end) => html.slice(html.indexOf(start),html.indexOf(end,html.indexOf(start)));

for(const platform of ['android','ios']) test(platform+' candidate integrates the gate and refuses an incorrect backend or native kind',()=>{
  const candidate = htmlFor(platform);
  for(const match of candidate.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))if(match[1].trim())new vm.Script(match[1]);
  new vm.Script(installAccountVerificationReauth(adaptIos139Social(social,platform)));
  const configContext={window:{}};
  vm.runInNewContext(enableAccountVerificationConfig(configSource,platform),configContext);
  const config=configContext.window.MANEE_CONFIG;
  assert.equal(config.accountVerificationEnabled,true);
  assert.equal(config.accountVerificationPlatform,platform);
  const start=candidate.indexOf('  const MANEE_CONFIG = window.MANEE_CONFIG;');
  const end=candidate.indexOf('  const previewHost',start);
  const bootstrap='(function(){'+candidate.slice(start,end)+'return true;})()';
  const accepts=(cfg,kind,native=true)=>vm.runInNewContext(bootstrap,{
    window:{MANEE_CONFIG:cfg,Capacitor:{getPlatform:()=>kind,isNativePlatform:()=>native}},document:{getElementById:()=>({})},
  });
  assert.equal(accepts(config,platform),true);
  assert.equal(accepts({...config,accountVerificationEnabled:false},platform),undefined);
  assert.equal(accepts({...config,environment:'production'},platform),undefined);
  assert.equal(accepts({...config,supabaseUrl:'https://other.invalid'},platform),undefined);
  assert.equal(accepts(config,platform==='ios'?'android':'ios'),undefined);
  assert.equal(accepts(config,platform,false),undefined);
  assert.throws(()=>enableAccountVerificationConfig(configSource.replace('"staging"','"production"'),platform),/staging/);
  assert.match(candidate,/ready:state\.splashDone&&!state\.loading&&accountVerificationCanUseBusiness\(\)/);
});

function gateFixture({membership='owner',reply={},enabled=true}={}){
  const dom=new JSDOM('<!doctype html><body><div id="app"></div></body>',{url:'https://localhost/',runScripts:'outside-only'});
  const {window:w}=dom;
  const uid='11111111-2222-4333-8444-555555555555';
  const sessionKey='99999999-8888-4777-8666-555555555555';
  const token='fixture.'+Buffer.from(JSON.stringify({session_id:sessionKey})).toString('base64url')+'.fixture';
  const originalSession={access_token:token,user:{id:uid}};
  let session=originalSession,answer=reply,restoreSequence=0;
  const loads=[],calls=[],toasts=[];
  w.state={role:'landing',landingMode:'default',splashDone:true,loading:false,authProfile:null,storeIdMap:{},pendingConfirm:null};
  w.app=w.document.getElementById('app');
  w.MANEE_CONFIG={accountVerificationEnabled:enabled,supabaseUrl:'https://example.invalid',publishableKey:'fixture'};
  w.MANEE_STAFF_AUTH_ENABLED=true;w.MANEE_ADMIN_AUTH_ENABLED=false;w.maneeViewEpoch=0;
  w.MANEE_SOCIAL_AUTH={providerOf:(_user,provider)=>provider==='naver'};
  w.maneeRestoreGuard=()=>{const sequence=++restoreSequence;return()=>sequence===restoreSequence;};
  w.db={auth:{getSession:async()=>({data:{session}}),getUser:async()=>({data:{user:{id:uid}}})},rpc(name){
    calls.push(name);
    return {abortSignal:async()=>typeof answer==='function'?answer():answer};
  }};
  w.staffPortal=async()=>({profile:{user_id:uid,username:'fixtureuser'},memberships:membership?[{store_id:'store',store_name:'Fixture',role:membership,crew_id:'crew'}]:[]});
  w.localGet=()=>null;w.localSet=()=>{};w.localDelete=()=>{};
  w.clearStaffAuthView=()=>{
    restoreSequence++;w.state.authProfile=null;w.state.accountVerificationGate=null;w.state.role='landing';w.state.landingMode='default';
  };
  const showBusiness=role=>{loads.push(role);w.state.role=role;w.render();return true;};
  w.restoreManeeAuthOwnerRun=async()=>showBusiness('storeOwner');w.loadStaffHome=async()=>showBusiness('staff');
  w.renderOwnerShell=()=>{w.app.innerHTML='<main data-business>OWNER</main>';};
  w.renderStaffApp=()=>'<main data-business>STAFF</main>';
  w.renderLanding=()=>w.state.landingMode==='phone-bind'?w.renderSmsBind():'<main data-landing>'+w.state.landingMode+'</main>';
  w.renderExpenseEditor=()=>'<aside data-business>STALE EXPENSE</aside>';
  w.renderSmsVerification=()=>'<div data-sms-fixture></div>';
  for(const name of ['clearStaleDashboard','bindLandingEvents','bindExpenseUI','bindStaffEvents','bindAttConfirmPrompt','bindLightbox','bindInfoModal','bindSector4','bindSector3','bindR134','bindR135Manager','bindR136'])w[name]=()=>{};
  for(const name of ['r136Overlay','r134Overlay','renderSector3Sheet','renderSector4Sheet','renderAttConfirmPrompt','renderLightbox','renderInfoModal'])w[name]=()=>'';
  w.teamUiOn=()=>false;w.canShowOwnerHomeWhileLoading=()=>false;
  w.tryMonthlyCostRoute=()=>{calls.push('business-link');return false;};
  w.showToast=text=>toasts.push(text);
  w.switchUser=()=>w.askConfirm('로그아웃할까요?',()=>{w.clearStaffAuthView();w.render();});
  w.MANEE_NATIVE={afterOwnerSignup:async()=>{calls.push('checkout');return {status:'offered'};}};
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
  w.eval([
    read('../src/account-verification-gate.js'),
    section('  async function restoreManeeAuthIdentity(preferredStoreId','  async function loadAuthStaffCrew('),
    section('  function render(){','  function renderAddStoreForm(){'),
    section('  function askConfirm(','  function openLightbox('),
    section('  function renderSmsBind(){','  function smsClose(){'),
    section('  async function openNativeNotification(','  function ownerNavigateFromOverview('),
    section('  async function offerSignupSubscription(){','  async function submitOwnerRequest(){'),
  ].join('\n'));
  return {w,uid,loads,calls,toasts,answer:value=>answer=value,setSession:value=>session=value,close(){
    w.dispatchEvent(new w.Event('unload'));dom.window.close();
  }};
}

const missingPhone={data:{phone_verified:false,email_verified:true,phone_method:'password'}};
const missingEmail={data:{phone_verified:true,email_verified:false,phone_method:null}};
const verified={data:{phone_verified:true,email_verified:true,phone_method:null}};

test('restored owner, employee and unlinked accounts are blocked before loading business pages or push links',async()=>{
  for(const membership of ['owner','staff','manager',null]){
    const h=gateFixture({membership,reply:missingPhone});
    try{
      await h.w.restoreManeeAuthIdentity(null,false);
      assert.equal(h.w.state.landingMode,'verification-required');
      assert.equal(h.w.app.querySelector('[data-business]'),null);
      assert.ok(h.w.app.querySelector('[data-sms-open]'));
      assert.ok(h.w.app.querySelector('[data-verification-logout]'));
      assert.ok(h.w.app.querySelector('a[href="tel:07048953822"]'));
      assert.deepEqual(h.loads,[]);
      assert.equal(await h.w.openNativeNotification({kind:'attendance_in'}),'pending');
      assert.deepEqual(h.calls,['manee_account_verification_status']);
      h.answer(verified);
      await h.w.resumeAccountVerification();
      assert.deepEqual(h.loads,membership?[membership==='owner'?'storeOwner':'staff']:[]);
      assert.equal(h.w.state.accountVerificationGate.phase,'verified');
    }finally{h.close();}
  }
});

test('verification endpoint failure keeps a retryable gate and stale success cannot unlock a changed session',async()=>{
  const h=gateFixture({reply:{error:{code:'503'}}});
  try{
    await h.w.restoreManeeAuthIdentity(null,false);
    assert.equal(h.w.state.accountVerificationGate.phase,'error');
    assert.ok(h.w.app.querySelector('[data-verification-retry]'));
    assert.deepEqual(h.loads,[]);
    h.answer(async()=>{h.setSession({access_token:'different',user:{id:'other'}});return verified;});
    await h.w.resumeAccountVerification();
    assert.equal(h.w.state.accountVerificationGate,null);
    assert.deepEqual(h.loads,[]);
  }finally{h.close();}
});

test('recent social users can use phone OTP without a password, and only the logout confirmation can open while gated',async()=>{
  const h=gateFixture({reply:{data:{phone_verified:false,email_verified:false,phone_method:'recent_social'}}});
  try{
    await h.w.restoreManeeAuthIdentity(null,false);
    assert.match(h.w.renderSmsBind(),/data-sms-fixture/);
    assert.doesNotMatch(h.w.renderSmsBind(),/sms-current-password/);
    h.w.askConfirm('Unrelated business action',()=>assert.fail('blocked business action'));
    assert.equal(h.w.app.querySelector('#confirm-overlay'),null);
    h.w.app.querySelector('[data-verification-logout]').click();
    assert.ok(h.w.app.querySelector('#confirm-overlay'));
    assert.equal(h.w.app.querySelector('[data-business]'),null);
    h.w.app.querySelector('#confirm-ok').click();
    assert.equal(h.w.state.authProfile,null);
  }finally{h.close();}
});

test('required email dialog returns to the gate, and signup checkout waits for server verification and close',async()=>{
  const h=gateFixture({reply:missingEmail});
  try{
    const {w}=h;
    w.MANEE_EMAIL_BRIDGE={userId:()=>w.state.authProfile?.user_id,session:async()=>({access_token:'fixture',user:{id:h.uid}})};
    w.fetch=async()=>({ok:true,json:async()=>({ok:true,email:null,pending_email:'fixture@example.com',email_verified:false})});
    w.eval(read('../src/email-verification.js'));
    await w.restoreManeeAuthIdentity(null,false);
    await w.offerSignupSubscription();
    assert.doesNotMatch(h.calls.join(','),/checkout/);
    w.app.querySelector('[data-verification-email]').click();
    await settle();
    let dialog=w.document.querySelector('.manee-email-dialog');
    assert.equal(dialog.querySelector('[data-mee-later]').textContent,'돌아가기');
    dialog.querySelector('[data-mee-later]').click();
    assert.ok(w.app.querySelector('[data-verification-email]'));
    assert.equal(w.app.querySelector('[data-business]'),null);
    w.app.querySelector('[data-verification-email]').click();
    await settle();
    dialog=w.document.querySelector('.manee-email-dialog');
    w.dispatchEvent(new w.CustomEvent('manee:email-updated',{detail:{email_verified:true}}));
    await settle();
    assert.deepEqual(h.loads,[],'an event cannot grant access');
    h.answer(verified);
    w.dispatchEvent(new w.CustomEvent('manee:email-updated',{detail:{email_verified:true}}));
    await settle();
    assert.deepEqual(h.loads,['storeOwner']);
    assert.doesNotMatch(h.calls.join(','),/checkout/);
    dialog.close();
    await settle();
    assert.equal(h.calls.filter(call=>call==='checkout').length,1);
  }finally{h.close();}
});

function reauthFixture(callbackUserId){
  const context={window:{},URL,AbortSignal};
  vm.runInNewContext(installAccountVerificationReauth(adaptIos139Social(social,'android')),context);
  const memory=new Map(),applied=[];
  const main={id:'original-user',identities:[{provider:'kakao'}]};
  const callbackUser={...main,id:callbackUserId};
  const origin='https://fixture.supabase.co';
  const oauth={auth:{signInWithOAuth:async()=>({data:{url:origin+'/auth/v1/authorize?provider=kakao'}}),
    exchangeCodeForSession:async()=>({data:{session:{access_token:'fixture',refresh_token:'fixture',user:callbackUser}}}),getUser:async()=>({data:{user:callbackUser}})}};
  const controller=context.window.MANEE_SOCIAL_AUTH.createController({
    config:{projectRef:'fixture',supabaseUrl:origin,publishableKey:'fixture'},supabase:{createClient:()=>oauth},
    db:{auth:{getSession:async()=>({data:{session:{user:main}}}),getUser:async()=>({data:{user:main}})}},
    storage:{getItem:key=>memory.get(key),setItem:(key,value)=>memory.set(key,value),removeItem:key=>memory.delete(key)},
    getLocation:()=> 'https://localhost/',open:async()=>{},applySession:async session=>applied.push(session),
    random:()=> 'fixture-flow',fetch:async()=>({ok:true,json:async()=>({external:{kakao:true}})}),
  });
  return {controller,applied};
}

test('reauth accepts only the already linked OAuth account and preserves the original user on mismatch',async()=>{
  for(const user of ['original-user','different-user']){
    const {controller,applied}=reauthFixture(user);
    const pending=await controller.begin('kakao',{intent:'reauth',role:'owner'});
    const callback=pending.redirectTo+'&code=fixture-code';
    if(user==='original-user'){
      assert.equal((await controller.complete(callback)).intent,'reauth');
      assert.equal(applied[0].user.id,'original-user');
    }else{
      await assert.rejects(controller.complete(callback),error=>error.code==='account_changed');
      assert.deepEqual(applied,[]);
    }
    assert.equal(controller.pending(),null);
  }
});
