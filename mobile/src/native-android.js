import { PushNotifications } from '@capacitor/push-notifications';
import { createAndroidPush } from './android-push.js';
import { Geolocation } from '@capacitor/geolocation';
import { registerPlugin } from '@capacitor/core';
import { reportBytesToBase64 } from './report-file.js';
import { createAndroidGeolocation } from './android-geolocation.js';

const ReportFiles = registerPlugin('ManeeReportFiles');

let getContext = () => null;
const notifications = createAndroidPush({ push: PushNotifications, getContext: () => getContext(), projectId: ANDROID_FIREBASE_PROJECT, storage: localStorage });

// Foreground, user-initiated location requests only.
window.MANEE_GEOLOCATION = createAndroidGeolocation(Geolocation);

window.MANEE_NATIVE = {
  async saveFile({ bytes, filename, mimeType }) {
    return ReportFiles.save({ data: reportBytesToBase64(bytes), filename, mimeType });
  },
  configure(callback) { getContext = callback; },
  push(action) { return notifications.action(action); },
  refresh() {},
  async prepareLogout() { await notifications.prepareLogout(); },
  openSettings() {
    if (document.getElementById('manee-android-info')) return;
    const dialog = document.createElement('dialog');
    dialog.id = 'manee-android-info';
    dialog.style.cssText = 'max-width:360px;width:85%;border:0;border-radius:20px;padding:24px;line-height:1.7';
    dialog.innerHTML = `<h2>매니 테스트 앱</h2>
      <p>테스트용 계정과 매장을 사용해 주세요. 실제 운영 데이터와 분리되어 있습니다.</p>
      <p>로그인·직원 관리·출퇴근 위치 확인·사진 첨부를 확인하는 버전입니다.</p>
      <p>PDF·엑셀은 저장 위치를 선택해 휴대폰에 저장할 수 있습니다.</p>
      <p>${ANDROID_FIREBASE_PROJECT ? "휴대폰 알림은 더보기 > 매장 설정에서 연결해 주세요. 현재 테스트 알림만 지원합니다." : "휴대폰 알림은 연결 준비 중입니다. 앱 안의 알림은 계속 확인할 수 있습니다."}</p>
      <p>AI 답변·영수증 자동 인식·음성 입력·구독 결제는 아직 지원하지 않습니다.</p>
      <p id="android-push-result" role="status"></p>
      ${ANDROID_FIREBASE_PROJECT ? '<button type="button" id="android-test-push" style="width:100%;padding:12px">테스트 알림 보내기</button>' : ""}
      <button type="button" id="android-info-close" style="width:100%;padding:12px">확인</button>`;
    dialog.querySelector('#android-info-close').addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => dialog.remove(), { once: true });
    dialog.querySelector('#android-test-push')?.addEventListener('click', async event => {
      const button = event.currentTarget;button.disabled = true;
      try { dialog.querySelector('#android-push-result').textContent = (await notifications.action('test')).message; }
      catch (error) { dialog.querySelector('#android-push-result').textContent = error.message; }
      finally { button.disabled = false; }
    });
    document.body.append(dialog);
    dialog.showModal();
  },
};
