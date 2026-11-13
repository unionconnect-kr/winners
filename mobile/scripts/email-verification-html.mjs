// Extend only the current release; archived, approved assets remain immutable.
export function installEmailVerification(source) {
  let html=source;
  const once=(before,after)=>{
    if(html.split(before).length!==2)throw Error('Email verification anchor changed: '+before.slice(0,90));
    html=html.replace(before,()=>after);
  };
  once('</head>','<link rel="stylesheet" href="/email-verification.css"></head>');
  once('</body>','<script src="/email-verification.js"></script></body>');
  once('window.MANEE_HANDLE_BACK=()=>{', 'window.MANEE_HANDLE_BACK=()=>{if(window.MANEE_EMAIL_UI?.close())return true;');
  once('  // END MANEE_ENVIRONMENT',`  window.MANEE_EMAIL_BRIDGE=Object.freeze({
    session:async()=>{const result=await db.auth.getSession();if(result.error)throw result.error;return result.data?.session||null;},
    userId:()=>state.authProfile?.user_id||null
  });
  // END MANEE_ENVIRONMENT`);
  once("step:0,name:'',username:'',password:'',confirm:'',store:'',franchise:'',ageConfirmed:false", "step:0,name:'',username:'',password:'',confirm:'',store:'',franchise:'',recovery_email:'',ageConfirmed:false");
  once('  function renderStaffSignup(){',`  function maneeSignupEmail(role,value=''){
    return '<div class="manee-email-signup" data-manee-email-signup="'+role+'"><label for="manee-email-'+role+'">이메일 (필수)</label><div class="mee-input-row"><input type="email" id="manee-email-'+role+'" '+(role==='owner'?'data-signup-field="recovery_email" ':'')+'autocomplete="email" inputmode="email" autocapitalize="none" spellcheck="false" maxlength="254" value="'+escapeHtml(value||'')+'" placeholder="이메일 주소를 입력해 주세요"><button type="button" data-mee-check>중복확인</button></div><p data-mee-check-status role="status" aria-live="polite">가입 후 이메일을 인증해 주세요.</p></div>';
  }
  function renderStaffSignup(){`);
  once("+renderSmsVerification('signup_owner')+'</section>';", "+maneeSignupEmail('owner',d.recovery_email)+renderSmsVerification('signup_owner')+'</section>';");
  once("      renderSmsVerification('signup_staff')+'<p class=\"crew-code-hint\">", "      maneeSignupEmail('staff')+renderSmsVerification('signup_staff')+'<p class=\"crew-code-hint\">");
  once("    if(d.step===2){", "    if(d.step===2){\n      try{window.MANEE_EMAIL_UI.signupValue('owner');}catch(e){showToast(e.message);return;}");
  once('    state.ownerSignupBusy=true;\n    const submitButton=', "    let recoveryEmail;\n    try{recoveryEmail=window.MANEE_EMAIL_UI.signupValue('owner');}catch(e){showToast(e.message);return;}\n    state.ownerSignupBusy=true;\n    const submitButton=");
  once("age_14_plus_confirmed:true, ...smsProofPayload('signup_owner')", "age_14_plus_confirmed:true, recovery_email:recoveryEmail, ...smsProofPayload('signup_owner')");
  once("const data=await callManeeAuthApi('manee-staff-signup',{username,display_name,password,personal,age_14_plus_confirmed:true,...smsProofPayload('signup_staff')});", "const recovery_email=window.MANEE_EMAIL_UI.signupValue('staff');\n        const data=await callManeeAuthApi('manee-staff-signup',{username,display_name,password,personal,recovery_email,age_14_plus_confirmed:true,...smsProofPayload('signup_staff')});");
  once("await restoreManeeAuthIdentity(null,true); showToast('직원 계정을 만들었어요. 매장 연결코드를 입력해 주세요.');", "await restoreManeeAuthIdentity(null,true); showToast('직원 계정을 만들었어요. 매장 연결코드를 입력해 주세요.'); void window.MANEE_EMAIL_UI?.afterSignup();");
  once('      await offerSignupSubscription();', '      await offerSignupSubscription();\n      void window.MANEE_EMAIL_UI?.afterSignup();');
  once("<br>아이디: '+escapeHtml(d.username)+'<br>매장:", "<br>아이디: '+escapeHtml(d.username)+'<br>이메일: '+escapeHtml(d.recovery_email||'')+'<br>매장:");
  once('<section class="r138-account-card"><h4>간편계정 연결</h4>', '<section class="r138-account-card" data-manee-email-account></section><section class="r138-account-card"><h4>간편계정 연결</h4>');
  once("    html+=staffAuthButton('refresh-account','연결 상태 새로 확인')", "    html+='<div class=\"day-panel\" data-manee-email-account></div>';\n    html+=staffAuthButton('refresh-account','연결 상태 새로 확인')");
  once("    html+='<fieldset class=\"ss-consents\"><legend", "    html+=maneeSignupEmail('social')+'<div class=\"manee-social-phone\" data-mee-social-sms><label for=\"mee-social-phone\">휴대폰 번호 (필수)</label><div class=\"mee-input-row\"><input id=\"mee-social-phone\" type=\"tel\" inputmode=\"tel\" autocomplete=\"tel\" maxlength=\"24\" placeholder=\"01012345678\"><button type=\"button\" data-mee-sms-send>인증번호 받기</button></div><label for=\"mee-social-code\">문자 인증번호</label><div class=\"mee-input-row\"><input id=\"mee-social-code\" inputmode=\"numeric\" autocomplete=\"one-time-code\" maxlength=\"6\" placeholder=\"6자리 숫자\"><button type=\"button\" data-mee-sms-verify disabled>인증하기</button></div><p class=\"mee-note\" data-mee-sms-status role=\"status\" aria-live=\"polite\">휴대폰 번호당 매니 계정은 1개만 만들 수 있어요.</p><p class=\"mee-note\" data-mee-sms-clock></p></div>';\n    html+='<fieldset class=\"ss-consents\"><legend");
  once("const form=dialog.querySelector('form'),button=form.querySelector('[type=submit]'),status=form.querySelector('[role=status]');", "const form=dialog.querySelector('form'),button=form.querySelector('[type=submit]'),status=form.querySelector('.ss-status');");
  once("    let busy=false;\n    const setBusy=value=>{busy=value;button.disabled=value;back.disabled=value;login.disabled=value;dialog.setAttribute('aria-busy',String(value));};", "    const socialVerification=window.MANEE_EMAIL_UI.bindSocialSignup(dialog,context,provider);\n    let busy=false;\n    const setBusy=value=>{busy=value;socialVerification.setBusy(value);button.disabled=value;back.disabled=value;login.disabled=value;dialog.setAttribute('aria-busy',String(value));};");
  once("        await socialRequest({action:'signup',provider,role:chosenRole,displayName:", "        const verifiedSignup=socialVerification.payload();\n        await socialRequest({action:'signup',...verifiedSignup,provider,role:chosenRole,displayName:");
  once("dialog.close();await resolveIdentity();if(chosenRole==='owner')await offerSignupSubscription();", "dialog.close();await resolveIdentity();if(chosenRole==='owner')await offerSignupSubscription();void window.MANEE_EMAIL_UI?.afterSignup();");
  return html;
}
