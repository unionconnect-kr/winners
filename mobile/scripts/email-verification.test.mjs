import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {JSDOM} from 'jsdom';
import {signupCheckoutHtml} from './signup-checkout-html.mjs';
import {installEmailVerification} from './email-verification-html.mjs';
const script=readFileSync(new URL('../src/email-verification.js',import.meta.url),'utf8');
const baseline=readFileSync(new URL('../release139/assets/index.html',import.meta.url),'utf8');
const full=installEmailVerification(signupCheckoutHtml(baseline));
const flush=async()=>{for(let i=0;i<6;i++)await new Promise(resolve=>setImmediate(resolve));};
const signup=(role='staff')=>`<div data-manee-email-signup="${role}"><input type="email"><button type="button" data-mee-check>중복확인</button><p data-mee-check-status></p></div>`;
function setup(markup=signup(), handler=()=>({ok:true,available:true})){
  const dom=new JSDOM('<!doctype html><body><div id="app">'+markup+'</div></body>',{url:'https://localhost',runScripts:'outside-only'}),w=dom.window;
  let uid='user-a';const calls=[];
  w.AbortController=AbortController;w.MANEE_CONFIG={supabaseUrl:'https://example.supabase.co',publishableKey:'sb_publishable_test'};
  w.MANEE_EMAIL_BRIDGE={userId:()=>uid,session:async()=>({access_token:'test-token',user:{id:uid}})};
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
  w.fetch=async(url,options)=>{const payload=JSON.parse(options.body);calls.push({payload,headers:options.headers});const data=await handler(payload,calls.length);return {ok:data.ok!==false,json:async()=>data};};
  w.eval(script);
  return {w,dom,calls,setUid:value=>uid=value,close:()=>{w.dispatchEvent(new w.Event('unload'));w.close();}};
}
function change(w,input,value){input.value=value;input.dispatchEvent(new w.Event('input',{bubbles:true}));}

test('release transform preserves runtime syntax and injects authoritative signup fields on both paths',()=>{
  for(const m of full.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))if(m[1].trim())new vm.Script(m[1]);
  assert.match(full,/recovery_email:recoveryEmail/);assert.match(full,/personal,recovery_email,age_14_plus_confirmed/);
  assert.match(full,/await offerSignupSubscription\(\);\s+void window.MANEE_EMAIL_UI\?\.afterSignup/);
  assert.match(full,/window.MANEE_EMAIL_UI\?\.close\(\)/);
  assert.throws(()=>installEmailVerification(full),/anchor/);
});

test('signup needs a successful matching duplicate check; editing and stale responses cannot reuse it',async()=>{
  let complete;const h=setup(signup(),()=>new Promise(r=>complete=r));
  try{
    const input=h.w.document.querySelector('input'),button=h.w.document.querySelector('button');
    assert.throws(()=>h.w.MANEE_EMAIL_UI.signupValue('staff'),/이메일 주소/);
    change(h.w,input,'first@example.com');assert.throws(()=>h.w.MANEE_EMAIL_UI.signupValue('staff'),/중복확인/);
    button.click();await flush();change(h.w,input,'second@example.com');complete({ok:true,available:true});await flush();
    assert.throws(()=>h.w.MANEE_EMAIL_UI.signupValue('staff'),/중복확인/);
    button.click();await flush();complete({ok:true,available:true});await flush();assert.equal(h.w.MANEE_EMAIL_UI.signupValue('staff'),'second@example.com');
    assert.equal(h.calls[0].headers.Authorization,undefined);
    change(h.w,input,'third@example.com');assert.throws(()=>h.w.MANEE_EMAIL_UI.signupValue('staff'),/중복확인/);
  }finally{h.close();}
});

test('owner email stays validated through the real hidden-section wizard and is invalidated when edited',async()=>{
  const h=setup('',()=>({ok:true,available:true}));
  try{
    const w=h.w;
    w.state={landingMode:'request-form',ownerSignupDraft:{step:2,name:'사장님',username:'owner123',password:'Secure123',confirm:'Secure123',store:'매장',franchise:'',ageConfirmed:true,recovery_email:''},ownerRequestUsernameCheck:{username:'owner123',available:true}};
    w.escapeHtml=s=>String(s||'').replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');
    w.renderSmsVerification=()=>'';w.renderOwnerSignupOffer=()=>'';w.smsProofPayload=()=>({});w.showToast=text=>{throw Error(text);};w.landingBack=()=>{};w.app=w.document.querySelector('#app');
    const helper=full.slice(full.indexOf('  function maneeSignupEmail('),full.indexOf('  function renderStaffSignup('));
    const wizard=full.slice(full.indexOf('  function ownerSignupDraft('),full.indexOf('  const OWNER_SETUP_STEPS='));
    w.eval(helper+'\n'+wizard+'\nwindow.render=function(){app.innerHTML=renderOwnerSignup();bindOwnerSignup();};');
    w.render();await flush();
    change(w,w.document.querySelector('#manee-email-owner'),'Owner@Example.com');
    w.document.querySelector('[data-mee-check]').click();await flush();
    w.ownerSignupNext();await flush();assert.equal(w.state.ownerSignupDraft.step,3);
    w.ownerSignupNext();await flush();assert.equal(w.state.ownerSignupDraft.step,4);
    assert.equal(w.MANEE_EMAIL_UI.signupValue('owner'),'owner@example.com');
    assert.equal(w.document.querySelector('#manee-email-owner').closest('section').hidden,true);
    w.state.ownerSignupDraft.step=2;w.render();await flush();change(w,w.document.querySelector('#manee-email-owner'),'changed@example.com');
    assert.throws(()=>w.ownerSignupNext(),/중복확인/);
  }finally{h.close();}
});

test('confirmation needs the newly requested verified address, preserves account display until then, and updates on success',async()=>{
  let verified=false;
  const h=setup('<section data-manee-email-account></section>',payload=>payload.action==='request'?{ok:true,sent:true,pending_email:payload.email,retry_after:60}:{ok:true,email:verified?'new@example.com':'old@example.com',pending_email:verified?null:'new@example.com',email_verified:true});
  try{
    await flush();h.w.document.querySelector('[data-mee-open]').click();await flush();
    const d=h.w.document.querySelector('dialog'),input=d.querySelector('input');
    assert.equal(input.value,'new@example.com');
    d.querySelector('[data-mee-send]').click();await flush();
    assert.equal(h.calls.find(c=>c.payload.action==='request').headers.Authorization,'Bearer test-token');
    d.querySelector('[data-mee-confirm]').click();await flush();
    assert.equal(d.querySelector('[data-mee-success]').hidden,true);
    assert.match(d.querySelector('[data-mee-status]').textContent,/먼저 완료/);
    assert.equal(h.w.document.querySelector('[data-mee-address]').textContent,'old@example.com');
    verified=true;d.querySelector('[data-mee-confirm]').click();await flush();
    assert.equal(d.querySelector('[data-mee-success]').hidden,false);
    assert.equal(h.w.document.querySelector('[data-mee-address]').textContent,'new@example.com');
    d.querySelector('[data-mee-done]').click();assert.equal(h.w.document.querySelector('dialog'),null);
  }finally{h.close();}
});

test('returning to the app checks server status and changing accounts cannot show another account result',async()=>{
  let verified=false,resolveStatus;
  const h=setup('<section data-manee-email-account></section>',payload=>payload.action==='request'?{ok:true,sent:true,pending_email:payload.email,retry_after:60}:resolveStatus?new Promise(r=>resolveStatus=r):{ok:true,email:verified?'next@example.com':null,pending_email:'next@example.com',email_verified:verified});
  try{
    await flush();h.w.document.querySelector('[data-mee-open]').click();await flush();
    const dialog=h.w.document.querySelector('dialog');verified=true;h.w.dispatchEvent(new h.w.Event('focus'));await flush();
    assert.equal(dialog.querySelector('[data-mee-success]').hidden,false);
    dialog.querySelector('[data-mee-done]').click();
    h.w.document.querySelector('[data-mee-open]').click();await flush();
    h.setUid('user-b');h.w.document.querySelector('#app').append(h.w.document.createElement('span'));await flush();assert.equal(h.w.document.querySelector('dialog'),null);
  }finally{h.close();}
});

test('email account recovery uses only the public recovery route and shows the generic delivery outcome',async()=>{
  const h=setup('<div class="ml-options"><button id="forgot-password-btn">비밀번호 찾기</button></div>',()=>({ok:true}));
  try{
    const button=h.w.document.querySelector('.mee-recovery-entry button');assert.ok(button);button.click();
    const d=h.w.document.querySelector('dialog');change(h.w,d.querySelector('input'),'verified@example.com');
    d.querySelector('form').dispatchEvent(new h.w.Event('submit',{bubbles:true,cancelable:true}));await flush();
    assert.deepEqual(h.calls[0].payload,{action:'recovery_request',email:'verified@example.com'});
    assert.equal(h.calls[0].headers.Authorization,undefined);assert.match(d.querySelector('[data-mee-status]').textContent,/일치하는 계정이 있으면/);
  }finally{h.close();}
});

test('requesting an already verified address completes without a false delivery error',async()=>{
  const h=setup('<section data-manee-email-account></section>',p=>p.action==='request'?{ok:true,sent:false,already_verified:true,email_verified:true,email:p.email,pending_email:null}:{ok:true,email:'same@example.com',pending_email:null,email_verified:true});
  try{
    await flush();h.w.document.querySelector('[data-mee-open]').click();await flush();
    const d=h.w.document.querySelector('dialog');d.querySelector('[data-mee-send]').click();await flush();
    assert.equal(d.querySelector('[data-mee-success]').hidden,false);
    assert.equal(d.querySelector('[data-mee-verified]').textContent,'same@example.com');
  }finally{h.close();}
});

test('signup email prompt waits for the store subscription dialog to close',async()=>{
  const h=setup('',()=>({ok:true,email:null,pending_email:'new@example.com',email_verified:false}));
  try{
    const billing=h.w.document.createElement('dialog');h.w.document.body.append(billing);billing.showModal();
    h.w.MANEE_EMAIL_UI.afterSignup();assert.equal(h.w.document.querySelector('.manee-email-dialog'),null);
    billing.close();billing.remove();await flush();
    assert.equal(h.w.document.querySelectorAll('dialog').length,1);assert.equal(h.w.document.querySelector('dialog').className,'manee-email-dialog');
  }finally{h.close();}
});

test('new social signup outside the app root requires email and JWT-bound phone proof before submitting',async()=>{
  const uid='11111111-2222-4333-8444-555555555555',signups=[];
  const h=setup('',p=>p.action==='check'?{ok:true,available:true}:p.action==='request'?{ok:true,challenge_id:'challenge-social',expires_in:180,resend_after:30,message:'문자 발송'}:{ok:true,proof:'f'.repeat(64),expires_in:600});
  h.setUid(uid);
  try{
    const w=h.w;w.MANEE_IS_STAGING=false;w.MASCOT_IMG_DATA='';w.loginIcon=()=>'';w.socialProviderIcon=()=>'';w.renderOwnerSignupOffer=()=>'';w.socialSignupChoice=()=>{};w.resolveIdentity=async()=>{};w.offerSignupSubscription=async()=>{};
    w.db={auth:{getUser:async()=>({data:{user:{id:uid}}}),signOut:async()=>({})}};w.state={};w.socialRequest=async payload=>{signups.push(payload);return {ok:true};};
    w.escapeHtml=s=>String(s||'').replaceAll('"','&quot;');
    w.eval(full.slice(full.indexOf('  function maneeSignupEmail('),full.indexOf('  function renderStaffSignup('))+'\n'+full.slice(full.indexOf('  function renderSocialSignupScreen('),full.indexOf('  async function finishSocialLogin(')));
    w.socialSignupDialog({userId:uid,termsVersion:'v1'},'kakao','staff');await flush();
    const d=w.document.querySelector('.social-signup-dialog'),form=d.querySelector('form');form.elements.displayName.value='직원';for(const c of d.querySelectorAll('.ss-consent-row input'))c.checked=true;
    await form.onsubmit(new w.Event('submit',{cancelable:true}));assert.equal(signups.length,0);assert.match(d.querySelector('.ss-status').textContent,/이메일 주소/);
    const email=d.querySelector('[data-manee-email-signup] input');change(w,email,'social@example.com');d.querySelector('[data-mee-check]').click();await flush();
    await form.onsubmit(new w.Event('submit',{cancelable:true}));assert.equal(signups.length,0);assert.match(d.querySelector('.ss-status').textContent,/휴대폰 문자 인증/);
    const phone=d.querySelector('#mee-social-phone');change(w,phone,'01012345678');d.querySelector('[data-mee-sms-send]').click();await flush();
    const request=h.calls.find(c=>c.payload.purpose==='signup_social');assert.equal(request.payload.username,'s_'+uid.replaceAll('-','').slice(0,28));assert.equal(request.headers.Authorization,'Bearer test-token');
    change(w,d.querySelector('#mee-social-code'),'123456');d.querySelector('[data-mee-sms-verify]').click();await flush();
    const oauthSession=w.MANEE_EMAIL_BRIDGE.session;w.MANEE_EMAIL_BRIDGE.session=async()=>({access_token:'different-token',user:{id:'different-user'}});w.db.auth.getUser=async()=>({data:{user:{id:'different-user'}}});
    await form.onsubmit(new w.Event('submit',{cancelable:true}));assert.equal(signups.length,0);assert.match(d.querySelector('.ss-status').textContent,/계정이 바뀌었어요/);
    w.MANEE_EMAIL_BRIDGE.session=oauthSession;w.db.auth.getUser=async()=>({data:{user:{id:uid}}});
    await form.onsubmit(new w.Event('submit',{cancelable:true}));await flush();
    assert.equal(signups.length,1);assert.equal(signups[0].recovery_email,'social@example.com');assert.equal(signups[0].sms_challenge_id,'challenge-social');assert.equal(signups[0].sms_proof,'f'.repeat(64));assert.equal(signups[0].role,'staff');
  }finally{for(const d of h.w.document.querySelectorAll('dialog'))d.close();h.close();}
});

test('Apple signup uses supplied name/email without re-entry and preserves SMS/consent checks',async()=>{
 const {installAppleSignup}=await import('./apple-signup-html.mjs');
 const appleHtml=installAppleSignup(full),uid='11111111-2222-4333-8444-555555555555';
 for(const name of ['Apple 이름','']){
  const signups=[],h=setup('',p=>p.action==='request'?{ok:true,challenge_id:'apple-phone',expires_in:180,resend_after:30}:{ok:true,proof:'f'.repeat(64),expires_in:600});h.setUid(uid);
  try{
   const w=h.w;Object.assign(w,{MANEE_IS_STAGING:false,MASCOT_IMG_DATA:'',loginIcon:()=>'',socialProviderIcon:()=>'',renderOwnerSignupOffer:()=>'',socialSignupChoice:()=>{},resolveIdentity:async()=>{},offerSignupSubscription:async()=>{},state:{},escapeHtml:s=>String(s||'').replaceAll('"','&quot;')});
   w.db={auth:{getUser:async()=>({data:{user:{id:uid}}})}};w.socialRequest=async p=>{signups.push(p);return {ok:true};};
   w.eval(appleHtml.slice(appleHtml.indexOf('  function maneeSignupEmail('),appleHtml.indexOf('  function renderStaffSignup('))+'\n'+appleHtml.slice(appleHtml.indexOf('  function renderSocialSignupScreen('),appleHtml.indexOf('  async function finishSocialLogin(')));
   w.socialSignupDialog({userId:uid,termsVersion:'v1',appleEmail:'relay@privaterelay.appleid.com',appleDisplayName:name},'apple','owner');await flush();
   const d=w.document.querySelector('.social-signup-dialog'),form=d.querySelector('form');
   assert.equal(form.elements.displayName.closest('label').hidden,true);assert.equal(form.elements.displayName.value,name||'Apple 사용자');
   assert.equal(d.querySelector('input[type=email]'),null);form.elements.storeName.value='QA 매장';
   for(const input of d.querySelectorAll('.ss-consent-row input'))input.checked=true;
   await form.onsubmit(new w.Event('submit'));assert.equal(signups.length,0);assert.match(d.querySelector('.ss-status').textContent,/휴대폰/);
   change(w,d.querySelector('#mee-social-phone'),'01012345678');d.querySelector('[data-mee-sms-send]').click();await flush();
   change(w,d.querySelector('#mee-social-code'),'123456');d.querySelector('[data-mee-sms-verify]').click();await flush();
   await form.onsubmit(new w.Event('submit'));await flush();
   assert.equal(signups.length,1);assert.equal(signups[0].recovery_email,'relay@privaterelay.appleid.com');
   assert.equal(h.calls.some(c=>c.payload.action==='check'),false);assert.equal(w.document.querySelector('.manee-email-dialog'),null);
  }finally{for(const d of h.w.document.querySelectorAll('dialog'))d.close();h.close();}
 }
});
