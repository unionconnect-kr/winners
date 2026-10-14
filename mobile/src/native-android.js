import { PushNotifications } from '@capacitor/push-notifications';
import { createAndroidPush } from './android-push.js';
import { Geolocation } from '@capacitor/geolocation';
import { registerPlugin } from '@capacitor/core';
import { reportBytesToBase64 } from './report-file.js';
import { createAndroidGeolocation } from './android-geolocation.js';
import { createNotificationNavigation } from './android-notification-navigation.js';

import {createAndroidBillingClient} from './android-billing.mjs';
import {openAndroidBilling} from './android-billing-ui.mjs';
const playBilling=registerPlugin('ManeePlayBilling');
const billing=createAndroidBillingClient({playBilling,getContext:()=>getContext(),request:async(c,_name,body)=>{
 const {data:auth,error:authError}=await c.db.auth.getSession();
 if(authError||auth?.session?.user?.id!==c.userId)throw Error('다시 로그인해 주세요.');
 const {data,error}=await c.db.functions.invoke('manee-android-billing',{body:{...body,storeId:c.storeId},signal:AbortSignal.timeout(30000)});
 if(error)throw Error('결제 서버 연결 또는 테스트 권한을 확인하지 못했어요.');
 return data;
}});

const ReportFiles = registerPlugin('ManeeReportFiles');

let getContext = () => null;
let openNotification = async () => 'pending';
const notifications = createAndroidPush({ push: PushNotifications, getContext: () => getContext(), projectId: ANDROID_FIREBASE_PROJECT, storage: localStorage });
const navigation=createNotificationNavigation({push:PushNotifications,getContext:()=>getContext(),open:(data,isCurrent)=>openNotification(data,isCurrent)});
void navigation.start().catch(()=>{});

// Foreground, user-initiated location requests only.
window.MANEE_GEOLOCATION = createAndroidGeolocation(Geolocation);

window.MANEE_NATIVE = {
  async saveFile({ bytes, filename, mimeType }) {
    return ReportFiles.save({ data: reportBytesToBase64(bytes), filename, mimeType });
  },
  configure(callback, onNotification) { getContext = callback;if(onNotification)openNotification=onNotification;void navigation.flush(); },
  push(action) { return notifications.action(action); },
  refresh() { void navigation.start().then(()=>navigation.flush()).catch(()=>{}); },
  async prepareLogout() { navigation.clear();await notifications.prepareLogout(); },
  openSettings() {
    if (document.getElementById('manee-android-info')) return;
    const dialog = document.createElement('dialog');
    dialog.id = 'manee-android-info';
    dialog.style.cssText = 'max-width:360px;width:85%;border:0;border-radius:20px;padding:24px;line-height:1.7';
    dialog.innerHTML = `<h2>${ANDROID_PRODUCTION ? '매니' : '매니 테스트 앱'}</h2>
      ${ANDROID_PRODUCTION ? '<p>우리가게 매니저 매니</p>' : '<p>테스트용 계정과 매장을 사용해 주세요. 실제 운영 데이터와 분리되어 있습니다.</p>'}
      <p>직원 관리·출퇴근·매출·지출·보고서를 한곳에서 관리하세요.</p>
      <p>PDF·엑셀은 저장 위치를 선택해 휴대폰에 저장할 수 있습니다.</p>
      <p>${ANDROID_FIREBASE_PROJECT ? "휴대폰 알림은 더보기 > 매장 설정에서 연결해 주세요. 출퇴근·예약·월말 보고서 알림을 받을 수 있습니다." : "휴대폰 알림은 연결 준비 중입니다. 앱 안의 알림은 계속 확인할 수 있습니다."}</p>
      ${ANDROID_PRODUCTION ? '<p>구독 결제는 준비 중입니다.</p>' : '<p>AI 답변·영수증 자동 인식·음성 입력·구독 결제는 아직 지원하지 않습니다.</p>'}
      ${ANDROID_PRODUCTION && getContext()?.role==='storeOwner' ? '<button type="button" id="android-billing-test" style="width:100%;padding:12px">결제 테스트·구매 복원</button>' : ''}
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
    dialog.querySelector('#android-billing-test')?.addEventListener('click',()=>{dialog.close();openAndroidBilling({billing,getContext,document});});
    document.body.append(dialog);
    dialog.showModal();
  },
};
