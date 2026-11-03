export function adaptIos139(source) {
  let html=source;
  function once(before,after){
    if(html.split(before).length!==2)throw Error('iOS 1.39 anchor mismatch: '+before.slice(0,90));
    html=html.replace(before,after);
  }
  // Automatic WKWebView insets already keep content below the status bar.
  once('매니 1.39 테스트 · 테스트 데이터만 입력해 주세요','매니 1.39 iPhone 테스트 · 테스트 데이터만 입력해 주세요');
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
