// User's device feedback, applied to complete build output, not archived baselines.
export function feedback144Html(source){
 let html=source;
 const once=(a,b)=>{if(html.split(a).length!==2)throw Error('1.44 anchor mismatch: '+a.slice(0,90));html=html.replace(a,b);};
 const start=html.indexOf('  function renderSplash(){'),end=html.indexOf('  function renderLandingHero(){',start);
 if(start<0||end<0)throw Error('Missing splash boundary');
 html=html.slice(0,start)+`  function renderSplash(){
    return '<div class="splash-screen manee-launch144"><img src="/launch-144.png" alt="매니 · Your Store Manager" fetchpriority="high"></div>';
  }
`+html.slice(end);
 once('<link rel="stylesheet" href="/owner-ui.css">','<link rel="stylesheet" href="/owner-ui.css">\n<link rel="stylesheet" href="/feedback144.css">');
 once("    if(['location','notifications'].includes(t.id)){", `    if(t.id==='notifications')return {title:labels[t.id],html:renderPushSettings144()};
    if(['location'].includes(t.id)){`);
 once('  function s4SettingBody(t){',`  function renderPushSettings144(){
    const busy=!!state.pushBusy,on=!!state.pushSubscribed;
    return '<section class="push-settings144"><div class="push-settings144-heading"><h3>이 기기 알림</h3><span class="owner-status '+(on?'ok':'none')+'">'+(on?'켜짐':'꺼짐')+'</span></div><p>직원의 출퇴근·예약·월말 보고서 알림을 받아요.</p><p class="push-settings144-qa" role="note">이 테스트 버전에서는 휴대폰 푸시가 발송되지 않아요. 실제 알림 수신은 푸시 검증 버전에서 확인해 주세요.</p>'+(state.pushRegistrationError?'<p role="status">'+escapeHtml(state.pushRegistrationError)+'</p>':'')+'<button type="button" id="owner-push-toggle-btn" aria-pressed="'+on+'"'+(busy?' disabled':'')+'>'+(busy?'알림 연결 확인 중…':on?'알림 끄기':'알림 켜기')+'</button></section>';
  }
  function s4SettingBody(t){`);
 once('아니에요, 수정할게요</button><button class="ok" id="att-confirm-right">맞아요','시간 수정</button><button class="ok" id="att-confirm-right">확인');
 return html.replaceAll('매니 1.43','매니 1.44');
}
