// Apply only to the new production Android assets, after the approved UI is built.
export function applyAndroidAppInfoChanges(source, {includeTestNotification = true} = {}) {
  let html = source;
  const replaceOnce = (before, after) => {
    if (html.split(before).length !== 2) throw Error('Android app info anchor changed: ' + before.slice(0, 80));
    html = html.replace(before, () => after);
  };

  replaceOnce("+s4Hint('매니 1.45')+", '+');
  if (!includeTestNotification) return html;

  const toggle = "+(busy?'알림 연결 확인 중…':on?'알림 끄기':'알림 켜기')+";
  replaceOnce(
    toggle + "'</button></section>';",
    toggle + `'</button>'+
      (state.role==='storeOwner'?'<button type="button" class="s4-btn full" id="owner-push-test-btn"'+(busy?' disabled':'')+'>테스트 알림 보내기</button>':'')+'</section>';`,
  );
  const bindToggle = '    const ownerPushToggleBtn = document.getElementById("owner-push-toggle-btn");';
  replaceOnce(bindToggle, `    document.getElementById("owner-push-test-btn")?.addEventListener("click", ()=>void nativeAndroidPushAction("test"));
` + bindToggle);

  // Sending a test is diagnostic. It must never change the notification toggle.
  replaceOnce('      state.pushSubscribed=!!result.subscribed;', '      if(action!=="test")state.pushSubscribed=!!result.subscribed;');
  replaceOnce('        if(action!=="disable")state.pushSubscribed=false;', '        if(action!=="disable"&&action!=="test")state.pushSubscribed=false;');
  return html;
}
