import {readFileSync} from 'node:fs';

const gateCode = readFileSync(new URL('../src/account-verification-gate.js',import.meta.url),'utf8');
const stagingProject = 'obpkzecgswnfuyhwvncd';
const stagingUrl = 'https://'+stagingProject+'.supabase.co';

function replaceOnce(source,before,after){
  if(source.split(before).length!==2) throw Error('Account verification anchor changed: '+before.slice(0,100));
  return source.replace(before,()=>after);
}

export function installAccountVerificationGate(source){
  let html=source;
  const once=(before,after)=>{html=replaceOnce(html,before,after);};
  const config='  const MANEE_CONFIG = window.MANEE_CONFIG;';
  once(config,config+`
  const verificationPlatform = window.Capacitor?.getPlatform?.();
  if(MANEE_CONFIG?.accountVerificationEnabled!==true || MANEE_CONFIG.environment!=='staging' ||
      MANEE_CONFIG.projectRef!=='${stagingProject}' || MANEE_CONFIG.supabaseUrl!=='${stagingUrl}' ||
      !window.Capacitor?.isNativePlatform?.() || !['android','ios'].includes(verificationPlatform) ||
      MANEE_CONFIG.accountVerificationPlatform!==verificationPlatform){
    document.getElementById('app').textContent='계정 인증 테스트 앱의 연결 설정을 확인해 주세요.';
    return;
  }`);
  once('</head>',`<style>
    .manee-verification-gate{max-width:420px;margin-inline:auto}
    .manee-verification-gate .code-box{margin:12px 0}
    .manee-verification-gate .code-box h3{display:flex;justify-content:space-between;gap:12px;margin:0 0 8px}
    .manee-verification-gate h3 span{font-size:13px;color:#286e4c}
    .manee-verification-gate details{margin:14px 0}
    .manee-verification-gate summary{min-height:44px;align-content:center}
  </style></head>`);
  const restore='  async function restoreManeeAuthIdentity(preferredStoreId,showAccount){';
  once(restore,gateCode+'\n'+restore);
  once('  function clearStaffAuthView(){',`  function clearStaffAuthView(){
    const hadVerificationGate=!!state.accountVerificationGate;
    state.accountVerificationGate=null; state.accountVerificationSignupUid=null;
    if(hadVerificationGate) window.MANEE_EMAIL_UI?.close();`);
  once('    state.authProfile=snapshot.profile;\n    state.staffPersonalProfile=snapshot.personal_profile||null;',`    state.authProfile=snapshot.profile;
    state.myUsername=snapshot.profile.username;
    const verificationChoice=localGet('auth-entry-role')?.value;
    const verificationRole=verificationChoice?.userId===snapshot.profile.user_id&&['owner','staff'].includes(verificationChoice.role)
      ? verificationChoice.role : (snapshot.memberships||[]).some(m=>m.role==='owner')?'owner':'staff';
    if(!await checkAccountVerification({user:userData.user,session:sessionData.session,preferredStoreId,showAccount,entryRole:verificationRole},alive))return true;
    if(!alive())return true;
    state.staffPersonalProfile=snapshot.personal_profile||null;`);
  once('  async function staffPortal(action,payload){',`  async function staffPortal(action,payload){
    if(action!=='session'&&!accountVerificationCanUseBusiness())throw Error('휴대폰과 이메일 인증을 먼저 완료해 주세요.');`);
  for(const entry of [
    '  async function restoreManeeAuthOwnerRun(preferredStore,alive){',
    '  async function becomeStoreOwner(storeName, alive){',
    '  async function switchOwnerStore(storeName){',
    '  async function loadAllForStore(store){',
    '  async function loadStaffHome(store, crewId){',
    '  async function loadAuthStaffHome(store){',
    '  function canManageBusinessData(){',
    '  function canDeleteFinancialData(){',
    '  function tryMonthlyCostRoute(){',
  ]) once(entry,entry+'\n    if(!accountVerificationCanUseBusiness())return false;');
  once('    const userId = verified.user.id;', '    const userId = verified.user.id;\n    if(!accountVerificationCanUseBusiness(userId))return false;');
  once('  function askConfirm(message, onConfirm){\n    state.pendingConfirm = { message, onConfirm };',`  function askConfirm(message, onConfirm){
    if(accountVerificationBlocksBusiness()&&!state.accountVerificationConfirmingLogout)return;
    state.pendingConfirm = { message, onConfirm, ...(state.accountVerificationConfirmingLogout?{verificationLogout:true}:{}) };`);
  once('    if(!state.pendingConfirm) return renderExpenseEditor();\n    let html = renderExpenseEditor()+',`    const expense=accountVerificationBlocksBusiness()?'':renderExpenseEditor();
    if(!state.pendingConfirm) return expense;
    let html = expense+`);
  once('  function bindConfirmOverlay(){\n    bindExpenseUI();',`  function bindConfirmOverlay(){
    if(!accountVerificationBlocksBusiness())bindExpenseUI();`);
  once('ready:state.splashDone&&!state.loading', 'ready:state.splashDone&&!state.loading&&accountVerificationCanUseBusiness()');
  once('  async function openNativeNotification(data,isCurrent=()=>true){',`  async function openNativeNotification(data,isCurrent=()=>true){
    if(!accountVerificationCanUseBusiness())return 'pending';
    const notificationIsCurrent=isCurrent;
    isCurrent=()=>accountVerificationCanUseBusiness()&&notificationIsCurrent();`);
  const loading='    if(state.loading&&!canShowOwnerHomeWhileLoading()){';
  once(loading,`    if(accountVerificationBlocksBusiness()){
      app.classList.remove('has-bottom-nav');
      const phoneFlow=state.landingMode==='phone-bind'&&state.smsReturn?.landingMode==='verification-required';
      const logoutConfirm=state.pendingConfirm?.verificationLogout?renderConfirmOverlay():'';
      app.innerHTML=(phoneFlow?renderLanding():renderAccountVerificationGate())+logoutConfirm;
      if(phoneFlow)bindLandingEvents();else bindAccountVerificationGate();
      if(logoutConfirm)bindConfirmOverlay();
      return;
    }
`+loading);

  const bindStart='  function renderSmsBind(){';
  const bindEnd='  function smsClose(){';
  const start=html.indexOf(bindStart),end=html.indexOf(bindEnd,start);
  if(start<0||end<0)throw Error('Missing SMS binding view');
  once(html.slice(start,end),`  function renderSmsBind(){
    const recentSocial=accountVerificationUsesRecentSocial();
    const gated=accountVerificationBlocksBusiness();
    const passwordField=recentSocial?'':'<label for="sms-current-password">현재 비밀번호</label><input id="sms-current-password" type="password" autocomplete="current-password" maxlength="72">';
    const description=gated?'계정에 등록할 휴대폰 번호로 인증해 주세요.':'일반 가입 계정의 비밀번호를 잊었을 때 사용할 번호예요. 매장에 등록한 연락처와 별도로 인증합니다.';
    return '<h2>'+(gated?'휴대폰 인증':'복구용 휴대폰 등록')+'</h2><p>'+description+'</p><div class="code-box">'+passwordField+renderSmsVerification('bind')+'<button type="button" class="crew-code-btn" data-sms-action="bind" data-sms-purpose="bind">인증한 번호 저장</button></div><button type="button" class="switch-link" data-sms-close>이전 화면으로</button>';
  }
`);
  once("...(p==='bind'?{current_password:document.getElementById('sms-current-password')?.value||''}:{})", "...(p==='bind'&&!accountVerificationUsesRecentSocial()?{current_password:document.getElementById('sms-current-password')?.value||''}:{})");
  once("e.retryAfter=data.retry_after;throw e;}return data;", "e.retryAfter=data.retry_after;e.code=data.error;throw e;}return data;");
  once("d.proof=null;if(a==='bind')smsClose();else", "d.proof=null;if(a==='bind'){smsClose();void resumeAccountVerification();}else");
  once("}catch(err){d.message=err.message||'인증을 완료하지 못했어요.';", "}catch(err){if(p==='bind'&&err.code==='social_reauth_required'&&accountVerificationBlocksBusiness()){smsClose();void resumeAccountVerification();return;}d.message=err.message||'인증을 완료하지 못했어요.';");

  once('  async function offerSignupSubscription(){',`  async function offerSignupSubscription(){
    if(!accountVerificationCanUseBusiness()){
      state.accountVerificationSignupUid=state.authProfile?.user_id||null;
      return;
    }`);
  const prompt='void window.MANEE_EMAIL_UI?.afterSignup();';
  if(html.split(prompt).length!==4)throw Error('Missing signup email prompt anchors');
  html=html.replaceAll(prompt,'if(accountVerificationCanUseBusiness()) '+prompt);
  once("showToast('직원 계정을 만들었어요. 매장 연결코드를 입력해 주세요.');", "showToast(accountVerificationCanUseBusiness()?'직원 계정을 만들었어요. 매장 연결코드를 입력해 주세요.':'직원 계정을 만들었어요. 계정 인증을 완료해 주세요.');");
  once("if(context.registered){await resolveIdentity();if(result.intent==='link')", "if(context.registered){if(result.intent==='reauth'&&accountVerificationBlocksBusiness())await resumeAccountVerification();else await resolveIdentity();if(result.intent==='link'&&accountVerificationCanUseBusiness())");
  once('if(!shownUser || state.role === "landing") return;', 'if(!shownUser || (state.role === "landing"&&!accountVerificationBlocksBusiness())) return;');
  once('if(error || !alive() || state.role === "landing") return;', 'if(error || !alive() || (state.role === "landing"&&!accountVerificationBlocksBusiness())) return;');
  const back='window.MANEE_HANDLE_BACK=()=>{if(window.MANEE_EMAIL_UI?.close())return true;';
  once(back,back+"if(accountVerificationBlocksBusiness()){if(state.pendingConfirm?.verificationLogout){state.pendingConfirm=null;render();}else if(state.landingMode==='phone-bind'){smsClose();}return true;}");
  return html;
}

export function installAccountVerificationReauth(source){
  let script=replaceOnce(source,"!['signin', 'link'].includes(intent)","!['signin', 'link', 'reauth'].includes(intent)");
  script=replaceOnce(script,"        const mainUserId = await currentUserId();\n        if (intent === 'link')",`        const mainUserId = await currentUserId();
        if (intent === 'reauth' && (!mainUserId || !(await account(mainUserId)).linked[provider])) {
          throw failure('identity_mismatch', '이 매니 계정에 연결된 간편계정으로 로그인해 주세요.');
        }
        if (intent === 'link')`);
  return replaceOnce(script,"(record.intent === 'link' && user.id !== record.mainUserId)","(['link','reauth'].includes(record.intent) && user.id !== record.mainUserId)");
}

export function enableAccountVerificationConfig(source,platform='android'){
  const match=/^window\.MANEE_CONFIG\s*=\s*Object\.freeze\((\{[\s\S]*\})\);\s*$/.exec(source);
  if(!match)throw Error('Invalid app verification candidate configuration');
  const config=JSON.parse(match[1]);
  if(config.environment!=='staging'||config.projectRef!==stagingProject||config.supabaseUrl!==stagingUrl||!['android','ios'].includes(platform)){
    throw Error('Account verification is enabled only for matching native staging candidates');
  }
  return 'window.MANEE_CONFIG = Object.freeze('+JSON.stringify({...config,accountVerificationEnabled:true,accountVerificationPlatform:platform})+');\n';
}
