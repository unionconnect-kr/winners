  // Installed inside the authenticated app closure for explicitly enabled native builds.
  const MANEE_ACCOUNT_VERIFICATION_ENABLED = MANEE_CONFIG.accountVerificationEnabled === true &&
    MANEE_STAFF_AUTH_ENABLED && !MANEE_ADMIN_AUTH_ENABLED;

  function accountVerificationCanUseBusiness(userId=state.authProfile?.user_id){
    if(!MANEE_ACCOUNT_VERIFICATION_ENABLED) return true;
    const gate = state.accountVerificationGate;
    return gate?.phase === 'verified' && gate.userId === userId && userId === state.authProfile?.user_id;
  }

  function accountVerificationBlocksBusiness(){
    return MANEE_ACCOUNT_VERIFICATION_ENABLED && !accountVerificationCanUseBusiness() &&
      (!!state.authProfile?.user_id || ['storeOwner','staff'].includes(state.role));
  }

  function accountVerificationSessionId(session){
    try {
      const encoded = session?.access_token?.split('.')[1];
      return JSON.parse(atob(encoded.replace(/-/g,'+').replace(/_/g,'/'))).session_id || null;
    } catch { return null; }
  }

  function showAccountVerificationGate(gate){
    if(['storeOwner','staff'].includes(state.role)) maneeViewEpoch++;
    state.accountVerificationGate = gate;
    state.role = 'landing';
    state.landingMode = 'verification-required';
    state.pendingConfirm = null;
    state.myCrewId = null;
    state.store = null;
    state.loading = false;
    render();
  }

  async function checkAccountVerification({user,session,preferredStoreId,showAccount,entryRole},alive){
    if(!MANEE_ACCOUNT_VERIFICATION_ENABLED) return true;
    const userId = user.id;
    const sessionId = accountVerificationSessionId(session);
    const previous = state.accountVerificationGate;
    if(previous?.phase === 'verified' && previous.userId === userId && sessionId && previous.sessionId === sessionId) return true;

    const providers = ['kakao','naver'].filter(provider => window.MANEE_SOCIAL_AUTH?.providerOf(user,provider));
    const gate = {userId,sessionId,preferredStoreId,showAccount,entryRole,providers,phase:'checking'};
    showAccountVerificationGate(gate);
    const current = () => alive() && state.accountVerificationGate === gate && state.authProfile?.user_id === userId;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(),15000);
    try {
      if(!sessionId || session.user?.id !== userId) throw Error('Session unavailable');
      const {data,error} = await db.rpc('manee_account_verification_status').abortSignal(controller.signal);
      if(!current()) return false;
      const result = await db.auth.getSession();
      if(!current()) return false;
      if(result.error) throw result.error;
      if(result.data?.session?.user?.id !== userId || accountVerificationSessionId(result.data?.session) !== sessionId){
        clearStaffAuthView();
        render();
        return false;
      }
      if(error || typeof data?.phone_verified !== 'boolean' || typeof data?.email_verified !== 'boolean'){
        throw Error('Verification status unavailable');
      }
      gate.phoneVerified = data.phone_verified;
      gate.emailVerified = data.email_verified;
      gate.phoneMethod = data.phone_method;
      gate.phase = gate.phoneVerified && gate.emailVerified ? 'verified' : 'required';
      if(gate.phase === 'verified') return true;
    } catch {
      if(!current()) return false;
      gate.phase = 'error';
    } finally {
      clearTimeout(timeout);
    }
    if(current()) render();
    return false;
  }

  function renderAccountVerificationGate(){
    const gate = state.accountVerificationGate;
    const checking = gate?.phase === 'checking';
    const unavailable = !gate || gate.phase === 'error';
    let steps = '';
    if(!checking && !unavailable){
      let phoneAction = '';
      if(!gate.phoneVerified){
        if(['password','recent_social'].includes(gate.phoneMethod)){
          phoneAction = '<button type="button" class="crew-code-btn" data-sms-open>휴대폰 인증하기</button>';
        } else if(gate.phoneMethod === 'social_reauth' && gate.providers.length){
          phoneAction = '<p>가입에 사용한 간편계정으로 다시 로그인한 뒤 휴대폰을 인증해 주세요.</p>' + gate.providers.map(provider =>
            '<button type="button" class="crew-code-btn" data-verification-reauth="'+provider+'"'+(gate.reauthBusy?' disabled':'')+'>'+ (provider==='kakao'?'카카오':'네이버')+'로 다시 로그인</button>').join('');
        } else {
          phoneAction = '<p>휴대폰 인증 방법을 확인하려면 고객센터에 문의해 주세요.</p>';
        }
      }
      const emailAction = gate.emailVerified ? '' : '<button type="button" class="crew-code-btn" data-verification-email>이메일 인증하기</button>';
      steps = '<section class="code-box"><h3>휴대폰 <span>'+ (gate.phoneVerified?'인증 완료':'인증 필요')+'</span></h3>'+phoneAction+'</section>'+
        '<section class="code-box"><h3>이메일 <span>'+ (gate.emailVerified?'인증 완료':'인증 필요')+'</span></h3>'+emailAction+'</section>';
    }
    return '<div class="landing manee-verification-gate"><h2>계정 인증</h2><p>휴대폰과 이메일을 인증하면 매니를 이용할 수 있어요.</p>'+
      (checking?'<p role="status">인증 상태를 확인하고 있어요…</p>':'')+
      (unavailable?'<p role="status">인증 상태를 확인하지 못했어요. 다시 시도해 주세요.</p>':'')+steps+
      '<button type="button" class="landing-btn secondary" data-verification-retry'+(checking?' disabled':'')+'>인증 상태 다시 확인</button>'+
      '<details><summary>고객센터</summary><p><a href="tel:07048953822">070-4895-3822</a><br><a href="mailto:union713@manee.co.kr">union713@manee.co.kr</a></p></details>'+
      '<button type="button" class="switch-link" data-verification-logout>로그아웃</button></div>';
  }

  function accountVerificationUsesRecentSocial(){
    return accountVerificationBlocksBusiness() && state.accountVerificationGate?.phoneMethod === 'recent_social';
  }

  function bindAccountVerificationGate(){
    app.querySelector('[data-verification-retry]')?.addEventListener('click',()=>void resumeAccountVerification());
    app.querySelector('[data-verification-email]')?.addEventListener('click',event=>window.MANEE_EMAIL_UI?.open(event.currentTarget,{required:true}));
    app.querySelector('[data-verification-logout]')?.addEventListener('click',()=>{
      state.accountVerificationConfirmingLogout=true;
      try { switchUser(); } finally { state.accountVerificationConfirmingLogout=false; }
    });
    for(const button of app.querySelectorAll('[data-verification-reauth]')){
      button.addEventListener('click',()=>void startAccountVerificationReauth(button.dataset.verificationReauth));
    }
  }

  async function startAccountVerificationReauth(provider){
    const gate = state.accountVerificationGate;
    if(!accountVerificationBlocksBusiness() || gate?.phoneMethod !== 'social_reauth' ||
        gate.reauthBusy || !gate.providers.includes(provider)) return;
    gate.reauthBusy = true;
    render();
    try {
      if(!socialController) throw Error('간편 로그인을 사용할 수 없어요. 잠시 후 다시 시도해 주세요.');
      await socialController.begin(provider,{intent:'reauth',role:gate.entryRole,remember:maneeRememberLogin()});
    } catch(error) {
      if(state.accountVerificationGate === gate) showToast(error.message);
    } finally {
      if(state.accountVerificationGate === gate){ gate.reauthBusy = false; render(); }
    }
  }

  async function resumeAccountVerification(){
    if(!accountVerificationBlocksBusiness()) return;
    const gate = state.accountVerificationGate;
    if(gate?.phase === 'checking' || gate?.retrying) return;
    if(gate) gate.retrying = true;
    const userId = state.authProfile?.user_id;
    try {
      const restored = await restoreManeeAuthIdentity(gate?.preferredStoreId || null,gate?.showAccount === true);
      if(!restored) render();
      if(userId && state.authProfile?.user_id === userId && state.role === 'storeOwner' &&
          accountVerificationCanUseBusiness() && state.accountVerificationSignupUid === userId){
        state.accountVerificationSignupUid = null;
        const afterClose = () => {
          if(state.authProfile?.user_id === userId && accountVerificationCanUseBusiness()) void offerSignupSubscription();
        };
        const dialog = document.querySelector('.manee-email-dialog[open]');
        if(dialog) dialog.addEventListener('close',afterClose,{once:true});
        else afterClose();
      }
    } catch {
      if(gate && state.accountVerificationGate === gate && state.authProfile?.user_id === userId){
        gate.phase = 'error';
        render();
      }
    } finally {
      if(gate) gate.retrying = false;
    }
  }

  window.addEventListener('manee:email-updated',event=>{
    const gate = state.accountVerificationGate;
    // This event only requests a fresh authenticated server lookup.
    if(event.detail?.email_verified === true && gate?.phase === 'required' && !gate.emailVerified) void resumeAccountVerification();
  });
