export function adaptIos139(source) {
  let html=source;
  function once(before,after){
    if(html.split(before).length!==2)throw Error('iOS 1.39 anchor mismatch: '+before.slice(0,90));
    html=html.replace(before,after);
  }
  // CSS owns safe-area spacing, including fixed banners and sheets.
  once('viewport-fit=contain', 'viewport-fit=cover');
  once('<link rel="stylesheet" href="/owner-ui.css">', '<link rel="stylesheet" href="/owner-ui.css">\n<link rel="stylesheet" href="/ios-ui.css">');
  once('<div role="status" style="position:fixed;top:0;left:0;right:0;z-index:99999;text-align:center;background:#fef3c7;color:#713f12;font-size:12px;padding:3px;pointer-events:none">', '<div role="status" class="ios-test-banner">');
  once('매니 1.39 테스트 · 테스트 데이터만 입력해 주세요','매니 1.39 iPhone 테스트 · 테스트 데이터만 입력해 주세요');
  once('카카오·네이버·Apple로 가입했다면', '카카오·네이버로 가입했다면');
  once("const providerName={kakao:'카카오',naver:'네이버',apple:'Apple'}", "const providerName={kakao:'카카오',naver:'네이버'}");
  once("const label={kakao:'카카오',naver:'네이버',apple:'Apple'}", "const label={kakao:'카카오',naver:'네이버'}");
  once("return '<span aria-hidden=\"true\"></span>';", "return '';");
  once("if(!linking&&!available[provider]||linking&&provider==='apple'&&!available.apple&&!linked)continue;", "if(!linking&&!available[provider])continue;");
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
  return html;
}

// Keep the archived Android baseline intact; only the iPhone bundle omits Apple.
export function adaptIos139Social(source) {
  let script=source;
  const changes=[
    ["const PROVIDERS = ['kakao', 'naver', 'apple'];", "const PROVIDERS = ['kakao', 'naver'];"],
    ["const AUTH_PROVIDERS = { kakao: 'kakao', naver: 'custom:naver', apple: 'apple' };", "const AUTH_PROVIDERS = { kakao: 'kakao', naver: 'custom:naver' };"],
    ["ready = { kakao: settings.external?.kakao === true, naver: config.socialProviders?.naver === true,\n        apple: settings.external?.apple === true };", "ready = { kakao: settings.external?.kakao === true, naver: config.socialProviders?.naver === true };"],
    ["      // Ship the same privacy-preserving choices on iPhone before exposing Kakao.\n      if (options.platform === 'ios' && !ready.apple) ready.kakao = ready.naver = false;\n", ""]
  ];
  for(const [before,after] of changes){
    if(script.split(before).length!==2)throw Error('iOS social auth anchor mismatch: '+before.slice(0,90));
    script=script.replace(before,after);
  }
  return script;
}
