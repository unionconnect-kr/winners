import { PushNotifications } from '@capacitor/push-notifications';
import { App } from '@capacitor/app';
import { createAndroidPush } from './android-push.js';
import { Geolocation } from '@capacitor/geolocation';
import { registerPlugin } from '@capacitor/core';
import { reportBytesToBase64 } from './report-file.js';
import { createAndroidGeolocation } from './android-geolocation.js';
import { createNotificationNavigation } from './android-notification-navigation.js';

import {createAndroidBillingClient} from './android-billing.mjs';
import {requestAndroidBilling} from './android-billing-request.mjs';
import {openAndroidBilling} from './android-billing-ui.mjs';
import {createSubscriptionStatusSheet,subscriptionButton,closeSubscriptionSheet,reuseSubscriptionSheet} from './subscription-sheet.mjs';
import {subscriptionView} from './store-subscription.mjs';
import {createSignupCheckout} from './signup-checkout.mjs';
const playBilling=registerPlugin('ManeePlayBilling');
const billing=createAndroidBillingClient({playBilling,allowPaid:ANDROID_PAID_BILLING,getContext:()=>getContext(),request:requestAndroidBilling});

const ReportFiles = registerPlugin('ManeeReportFiles');

let getContext = () => null;
const afterOwnerSignup=createSignupCheckout({getContext:()=>getContext(),enabled:ANDROID_PAID_BILLING,
  readAccess:async c=>{const r=await c.db.rpc('manee_store_billing_access',{p_store_id:c.storeId});if(r.error)throw r.error;return r.data;},
  openCheckout:()=>openAndroidBilling({billing,getContext,document})});
let openNotification = async () => 'pending';
const notifications = createAndroidPush({ push: PushNotifications, getContext: () => getContext(), projectId: ANDROID_FIREBASE_PROJECT, storage: localStorage });
const navigation=createNotificationNavigation({push:PushNotifications,getContext:()=>getContext(),open:(data,isCurrent)=>openNotification(data,isCurrent)});
void navigation.start().catch(()=>{});

// Foreground, user-initiated location requests only.
window.MANEE_GEOLOCATION = createAndroidGeolocation(Geolocation);

async function loadAndroidAppInfo(dialog) {
  const name = dialog.querySelector('#android-info-name');
  const version = dialog.querySelector('#android-info-version');
  try {
    const info = await App.getInfo();
    if (!dialog.open || !dialog.isConnected) return;
    if (typeof info?.name === 'string' && info.name.trim()) name.textContent = info.name.trim();
    version.textContent = typeof info?.version === 'string' && info.version.trim()
      ? info.version.trim()
      : '확인할 수 없어요';
  } catch {
    if (dialog.open && dialog.isConnected) version.textContent = '확인할 수 없어요';
  }
}

window.MANEE_NATIVE = {
  afterOwnerSignup,
  async saveFile({ bytes, filename, mimeType }) {
    return ReportFiles.save({ data: reportBytesToBase64(bytes), filename, mimeType });
  },
  configure(callback, onNotification) { getContext = callback;if(onNotification)openNotification=onNotification;void navigation.flush(); },
  push(action) { return notifications.action(action); },
  refresh() { void navigation.start().then(()=>navigation.flush()).catch(()=>{}); },
  async prepareLogout() { if(billing.isBusy())throw Error('구매 처리가 끝난 뒤 로그아웃해 주세요.');navigation.clear();await notifications.prepareLogout(); },
  openSubscriptionStatus() {
    if (reuseSubscriptionSheet(document,'manee-android-billing') || reuseSubscriptionSheet(document,'manee-subscription-status')) return;
    const c=getContext();if(c?.role!=='storeOwner'||!c.storeId||!c.userId)return;
    const sheetView=createSubscriptionStatusSheet(document,{storeName:c.storeName,platform:'android'});
    const dialog=sheetView.sheet,title=sheetView.price,message=sheetView.status;
    const sandbox=sheetView.el('p','',sheetView.card,'color:#67766d;font-size:12px');sandbox.hidden=true;
    let launchTrial=false;
    const openBilling=(launchTrial)=>{closeSubscriptionSheet(dialog);openAndroidBilling({billing,getContext,document,launchTrial});};
    const billingAction=subscriptionButton(sheetView,'무료체험·구독 확인',()=>openBilling(launchTrial));billingAction.hidden=true;
    subscriptionButton(sheetView,'닫기',()=>closeSubscriptionSheet(dialog),'secondary');
    const restoreAction=subscriptionButton(sheetView,'구독 복원 화면 열기',()=>openBilling(false),'link');restoreAction.hidden=true;
    const refresh=subscriptionButton(sheetView,'상태 새로고침',()=>void load(),'link');
    dialog.addEventListener('close',()=>dialog.remove(),{once:true});document.body.append(dialog);dialog.showModal();
    let seq=0;
    const same=()=>{const next=getContext();return dialog.isConnected&&next?.userId===c.userId&&next?.storeId===c.storeId;};
    async function load(){
      const current=++seq;refresh.disabled=true;title.textContent='상태를 확인하고 있어요…';message.textContent='';sandbox.hidden=true;billingAction.hidden=true;restoreAction.hidden=true;launchTrial=false;
      try{
        const [accessResult,billingResult]=await Promise.allSettled([
          c.db.rpc('manee_store_billing_access',{p_store_id:c.storeId}),billing.status(),
        ]);
        if(current!==seq||!same())return;
        const access=accessResult.status==='fulfilled'&&!accessResult.value.error?accessResult.value.data:null;
        const bill=billingResult.status==='fulfilled'?billingResult.value:null;
        const unconfigured=accessResult.status==='fulfilled'&&accessResult.value.error?.code==='PGRST202';
        const view=subscriptionView(access,bill,unconfigured);
        title.textContent=view.title;message.textContent=view.message;sheetView.promotion.hidden=access?.canWrite===true;
        if(view.testActive){sandbox.hidden=false;sandbox.textContent='이 매장의 Google Play 테스트 구매가 확인되었습니다. 테스트 이용권은 정식 결제와 구분됩니다.';}
        billingAction.hidden=bill?.ready!==true||typeof bill.testOnly!=='boolean';
        launchTrial=!billingAction.hidden&&bill.testOnly===false&&access?.canWrite!==true;
        restoreAction.hidden=!launchTrial;
        billingAction.textContent=bill?.testOnly===false?(access?.canWrite===true?'구독 관리·복원':'무료체험·구독 확인'):'Google Play 테스트·구독 복원';
      }catch{if(same())message.textContent='잠시 후 새로고침해 주세요.';}
      finally{if(current===seq&&same())refresh.disabled=false;}
    }
    void load();
  },
  subscriptionDenied() { this.openSubscriptionStatus(); },
  openSettings() {
    const existing = document.getElementById('manee-android-info');
    if (existing?.open) return;
    existing?.remove();
    const dialog = document.createElement('dialog');
    dialog.id = 'manee-android-info';
    dialog.style.cssText = 'max-width:360px;width:85%;border:0;border-radius:20px;padding:24px;line-height:1.7;box-sizing:border-box';
    if (ANDROID_PRODUCTION) {
      dialog.setAttribute('aria-labelledby', 'android-info-title');
      dialog.innerHTML = `
        <h2 id="android-info-title" style="margin:0;color:#173f2e;font-size:22px">앱 정보</h2>
        <dl style="margin:18px 0;color:#203c30">
          <div style="display:flex;justify-content:space-between;gap:16px;padding:10px 0;border-bottom:1px solid #e2ebe5">
            <dt>앱 이름</dt><dd id="android-info-name" style="margin:0;font-weight:700;text-align:right;overflow-wrap:anywhere">매니</dd>
          </div>
          <div style="display:flex;justify-content:space-between;gap:16px;padding:10px 0">
            <dt>앱 버전</dt><dd id="android-info-version" role="status" style="margin:0;font-weight:700;text-align:right;overflow-wrap:anywhere">확인 중…</dd>
          </div>
        </dl>
        <button type="button" id="android-info-close" style="width:100%;min-height:48px;padding:12px;border:0;border-radius:12px;background:#16774c;color:#fff;font:inherit;font-weight:700">닫기</button>`;
    } else {
      dialog.innerHTML = `<h2>매니 테스트 앱</h2>
      <p>테스트용 계정과 매장을 사용해 주세요. 실제 운영 데이터와 분리되어 있습니다.</p>
      <p>직원 관리·출퇴근·매출·지출·보고서를 한곳에서 관리하세요.</p>
      <p>PDF·엑셀은 저장 위치를 선택해 휴대폰에 저장할 수 있습니다.</p>
      <p>${ANDROID_FIREBASE_PROJECT ? "휴대폰 알림은 더보기 > 매장 설정에서 연결해 주세요. 출퇴근·예약·월말 보고서 알림을 받을 수 있습니다." : "휴대폰 알림은 연결 준비 중입니다. 앱 안의 알림은 계속 확인할 수 있습니다."}</p>
      <p>AI 답변·영수증 자동 인식·음성 입력·구독 결제는 아직 지원하지 않습니다.</p>
      <p id="android-push-result" role="status"></p>
      ${ANDROID_FIREBASE_PROJECT ? '<button type="button" id="android-test-push" style="width:100%;padding:12px">테스트 알림 보내기</button>' : ""}
      <button type="button" id="android-info-close" style="width:100%;padding:12px">확인</button>`;
    }
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
    if (ANDROID_PRODUCTION) void loadAndroidAppInfo(dialog);
  },
};
