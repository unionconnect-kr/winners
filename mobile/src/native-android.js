import { Geolocation } from '@capacitor/geolocation';

// Only foreground, user-initiated location requests. No push token or billing SDK.
window.MANEE_GEOLOCATION = {
  getCurrentPosition(success, failure, options = {}) {
    Geolocation.getCurrentPosition(options).then(success, error => {
      const code = String(error.code || '');
      failure?.({
        code: code === 'OS-PLUG-GLOC-0003' ? 1 : code === 'OS-PLUG-GLOC-0010' ? 3 : 2,
        message: error.message || '위치를 확인하지 못했습니다.',
      });
    });
  },
};

window.MANEE_NATIVE = {
  configure() {},
  refresh() {},
  async prepareLogout() {},
  openSettings() {
    if (document.getElementById('manee-android-info')) return;
    const dialog = document.createElement('dialog');
    dialog.id = 'manee-android-info';
    dialog.style.cssText = 'max-width:360px;width:85%;border:0;border-radius:20px;padding:24px;line-height:1.7';
    dialog.innerHTML = `<h2>매니 테스트 앱</h2>
      <p>테스트용 계정과 매장을 사용해 주세요. 실제 운영 데이터와 분리되어 있습니다.</p>
      <p>로그인·직원 관리·출퇴근 위치 확인·사진 첨부를 확인하는 버전입니다.</p>
      <p>AI 답변·영수증 자동 인식·음성 입력·푸시 알림·구독 결제는 아직 지원하지 않습니다. PDF·엑셀 저장은 휴대폰 확인이 필요합니다.</p>
      <button type="button" style="width:100%;padding:12px">확인</button>`;
    dialog.querySelector('button').addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => dialog.remove(), { once: true });
    document.body.append(dialog);
    dialog.showModal();
  },
};
