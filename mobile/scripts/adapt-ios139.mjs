import {androidOAuthUrl} from '../src/android-social-guard.js';
import {adaptIosDeviceFeedback} from './adapt-ios-device-feedback.mjs';
import {iosOAuthUrl} from '../src/ios-oauth-url.js';
export function adaptIos139(source, platform = 'ios', {appleLogin = false} = {}) {
  if(!['ios','android'].includes(platform))throw Error('Unsupported platform');
  const ios=platform==='ios';
  let html=source;
  function once(before,after){
    if(html.split(before).length!==2)throw Error('iOS 1.39 anchor mismatch: '+before.slice(0,90));
    html=html.replace(before,after);
  }
  // CSS owns safe-area spacing, including fixed banners and sheets.
  if(ios)once('viewport-fit=contain', 'viewport-fit=cover');
  once('<link rel="stylesheet" href="/owner-ui.css">', '<link rel="stylesheet" href="/owner-ui.css">\n<link rel="stylesheet" href="/'+(ios?'ios':'android')+'-ui.css">');
  once('<div role="status" style="position:fixed;top:0;left:0;right:0;z-index:99999;text-align:center;background:#fef3c7;color:#713f12;font-size:12px;padding:3px;pointer-events:none">', '<div role="status" class="'+(ios?'ios':'android')+'-test-banner">');
  once('매니 1.39 테스트 · 테스트 데이터만 입력해 주세요',ios?'매니 1.39 iPhone 테스트 · 테스트 데이터만 입력해 주세요':'매니 1.40 테스트 · 테스트 데이터만 입력해 주세요');
  once('autocomplete="name" maxlength="80"', 'autocomplete="name" maxlength="50"');
  once("input('store','owner-request-store-input','매장 이름','text','maxlength=\"100\"')", "input('store','owner-request-store-input','매장 이름','text','maxlength=\"80\"')");
  once("input('password','owner-request-password-input','비밀번호 · 8자 이상','password','autocomplete=\"new-password\"')", "input('password','owner-request-password-input','비밀번호 · 8~72자','password','autocomplete=\"new-password\" minlength=\"8\" maxlength=\"72\"')");
  once("input('confirm','owner-request-password-confirm-input','비밀번호 확인','password','autocomplete=\"new-password\"')", "input('confirm','owner-request-password-confirm-input','비밀번호 확인','password','autocomplete=\"new-password\" maxlength=\"72\"')");
  once("if(d.step===1&&!d.name.trim()){showToast('사장님 이름을 입력해 주세요.');return;}", "if(d.step===1&&(!d.name.trim()||d.name.trim().length>50)){showToast('사장님 이름은 1~50자로 입력해 주세요.');return;}");
  once("if(d.password.length<8){showToast('비밀번호는 8자 이상으로 만들어 주세요.');return;}", "if(d.password.length<8||d.password.length>72){showToast('비밀번호는 8~72자로 만들어 주세요.');return;}");
  once("if(d.step===3&&!d.store.trim()){showToast('매장 이름을 입력해 주세요.');return;}", "if(d.step===3&&(!d.store.trim()||d.store.trim().length>80)){showToast('매장 이름은 1~80자로 입력해 주세요.');return;}");
  once("(d.step===0?'1개월 무료체험 시작하기':'다음')", "(d.step===0?'무료체험 시작':'다음')");
  once('가입하고 1개월 무료로 시작하기</button>', '가입하고 시작하기</button>');
  once('placeholder="아이디를 입력해 주세요" spellcheck="false"', 'placeholder="아이디를 입력해 주세요" maxlength="30" spellcheck="false"');
  once('placeholder="비밀번호를 입력해 주세요" autocomplete="current-password"', 'placeholder="비밀번호를 입력해 주세요" maxlength="72" autocomplete="current-password"');
  if (!ios || !appleLogin) {
    once('카카오·네이버·Apple로 가입했다면', '카카오·네이버로 가입했다면');
    once("const providerName={kakao:'카카오',naver:'네이버',apple:'Apple'}", "const providerName={kakao:'카카오',naver:'네이버'}");
    once("const label={kakao:'카카오',naver:'네이버',apple:'Apple'}", "const label={kakao:'카카오',naver:'네이버'}");
    once("return '<span aria-hidden=\"true\"></span>';", "return '';");
    once("if(!linking&&!available[provider]||linking&&provider==='apple'&&!available.apple&&!linked)continue;", "if(!linking&&!available[provider])continue;");
  } else {
    once(
      "    if(!window.MANEE_SOCIAL_NATIVE)history.replaceState(null,'',location.pathname);\n    const context=await socialRequest({action:'context'});",
      "    if(!window.MANEE_SOCIAL_NATIVE)history.replaceState(null,'',location.pathname);\n    return applySocialLoginResult(result);\n  }\n  async function applySocialLoginResult(result){\n    const context=await socialRequest({action:'context'});",
    );
    once(
      "try{await controller.begin(provider,{intent:linking?'link':'signin',role,remember:currentRememberChoice()});}",
      "try{const result=await controller.begin(provider,{intent:linking?'link':'signin',role,remember:currentRememberChoice()});if(result?.handled)await applySocialLoginResult(result);}",
    );
    once('nativeScheme:native?.scheme,platform:', 'nativeScheme:native?.scheme,appleSignIn:native?.appleSignIn,platform:');
  }
  if(ios){
  once("if(window.Capacitor?.getPlatform?.()==='android')throw Error('Native file saver unavailable');",
    "if(['android','ios'].includes(window.Capacitor?.getPlatform?.()))throw Error('Native file saver unavailable');");
  once("else feedback(result?.status==='saved'?label+' 파일을 저장했어요.'",
    "else if(result?.status==='shared')feedback(label+' 파일 저장·공유를 완료했어요.','success');\n      else feedback(result?.status==='saved'?label+' 파일을 저장했어요.'");
  once("    if(state.role!=='storeOwner')return 'rejected';", `    if(state.role==='staff'){
      if(data.kind!=='test'||currentStoreId()!==data.storeId)return 'rejected';
      const permission=await db.rpc('manee_ios_push_context',{p_store_id:data.storeId});
      if(!isCurrent()||state.role!=='staff'||currentStoreId()!==data.storeId)return 'rejected';
      if(permission.error||permission.data!==true)return 'rejected';
      state.staffView=state.crew.find(c=>c.id===state.myCrewId)?.isManager?'more':'me';
      state.teamPage='notifications';render();window.scrollTo(0,0);return 'handled';
    }
    if(state.role!=='storeOwner')return 'rejected';`);
  once("db.rpc('manee_android_push_context'","db.rpc('manee_ios_push_context'");
  once('  function bindStaffEvents(){',`  function bindStaffEvents(){
    document.getElementById('native-staff-push-test')?.addEventListener('click',()=>nativeAndroidPushAction('test'));`);
  const push=html.split('\n').find(line=>line.includes("return '<section")&&line.includes('id="push-toggle-btn"'));
  if(!push)throw Error('Missing staff push panel');
  once(push,push.replace("+'</button></section>';", "+'</button>'+(state.pushSubscribed?'<button type=\"button\" class=\"owner-primary\" id=\"native-staff-push-test\">테스트 알림 보내기</button>':'')+'</section>';"));
  once('if(action!=="disable")state.pushSubscribed=false;', 'if(action!=="disable"&&action!=="test")state.pushSubscribed=false;');
  }
  return adaptIosDeviceFeedback(html);
}

// Apple sign-in is enabled only for the selected iOS release.
export function adaptIos139Social(source, platform = 'ios', {appleLogin = false} = {}) {
  if(!['ios','android'].includes(platform))throw Error('Unsupported platform');
  let script=source;
  const changes=[
    ["      // Ship the same privacy-preserving choices on iPhone before exposing Kakao.\n      if (options.platform === 'ios' && !ready.apple) ready.kakao = ready.naver = false;\n", ""]
  ];
  if (platform !== 'ios' || !appleLogin) {
    changes.push(
      ["const PROVIDERS = ['kakao', 'naver', 'apple'];", "const PROVIDERS = ['kakao', 'naver'];"],
      ["const AUTH_PROVIDERS = { kakao: 'kakao', naver: 'custom:naver', apple: 'apple' };", "const AUTH_PROVIDERS = { kakao: 'kakao', naver: 'custom:naver' };"],
      ["ready = { kakao: settings.external?.kakao === true, naver: config.socialProviders?.naver === true,\n        apple: settings.external?.apple === true };", "ready = { kakao: settings.external?.kakao === true, naver: config.socialProviders?.naver === true };"],
    );
  } else {
    const verificationStart = source.indexOf('        if (error || !data?.session) throw error');
    const verificationEnd = source.indexOf('      } finally { cancel(); completing = false; }', verificationStart);
    if (verificationStart < 0 || verificationEnd < 0) throw Error('Missing shared social session verification');
    const verification = source.slice(verificationStart, verificationEnd);
    changes.push(
      ['apple: settings.external?.apple === true', "apple: settings.external?.apple === true && typeof options.appleSignIn === 'function'"],
      [verification, '        return await applyVerifiedSession(data, error, record);\n'],
      ['    async function complete(rawUrl) {',
        '    async function applyVerifiedSession(data, error, record) {\n'+verification.replace(/^ {2}/gm, '')+'    }\n    async function complete(rawUrl) {'],
      ['        const flow = random();', '        if (provider === \'apple\') {\n'+
        '          const { identityToken, nonce } = await options.appleSignIn();\n'+
        '          if (!identityToken || !nonce) throw failure(\'invalid_apple_credential\', \'Apple 로그인 정보를 확인하지 못했어요.\');\n'+
        '          if (await currentUserId() !== mainUserId) throw failure(\'account_changed\', \'계정이 바뀌었어요. 다시 시작해 주세요.\');\n'+
        '          const credentials = { provider: \'apple\', token: identityToken, nonce };\n'+
        '          const { data, error } = intent === \'link\' ? await oauth.auth.linkIdentity(credentials) : await oauth.auth.signInWithIdToken(credentials);\n'+
        '          const result = await applyVerifiedSession(data, error, { provider, intent, role, remember: remember !== false, mainUserId });\n'+
        '          cancel();\n'+
        '          return result;\n'+
        '        }\n'+
        '        const flow = random();'],
    );
  }
  for(const [before,after] of changes){
    if(script.split(before).length!==2)throw Error('iOS social auth anchor mismatch: '+before.slice(0,90));
    script=script.replace(before,after);
  }
  const before="        const authorize = new URL(data?.url || '');\n        // Open only this project's GoTrue endpoint, never a caller-supplied URL.\n        if (authorize.origin !== new URL(config.supabaseUrl).origin || !authorize.pathname.startsWith('/auth/v1/')) throw failure('invalid_redirect', '로그인 주소를 확인하지 못했어요.');\n        await open(authorize.href);";
  if(script.split(before).length!==2)throw Error('Missing iPhone OAuth URL guard');
  script=script.replace(before,'        const authorize = '+(platform==='ios'?'iosOAuthUrl':'androidOAuthUrl')+"(data?.url || '', new URL(config.supabaseUrl).origin, provider, intent);\n        await open(authorize.href, {provider,intent});");
  script=script.replace("  const TERMS_VERSION",'  '+iosOAuthUrl.toString()+'\n'+(platform==='android'?androidOAuthUrl.toString()+'\n':'')+'  const TERMS_VERSION');
  return script;
}
