import {createSubscriptionSheet,subscriptionButton,setSubscriptionOffer,createSubscriptionStatusSheet} from './subscription-sheet.mjs';
import { App } from '@capacitor/app';
import { Geolocation } from '@capacitor/geolocation';

import { createAndroidGeolocation as createNativeGeolocation } from './android-geolocation.js';
window.MANEE_GEOLOCATION = createNativeGeolocation(Geolocation);

import { registerPlugin } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { createBillingClient } from './billing.mjs';
import { reportBytesToBase64 } from './report-file.js';
import { createIosPush } from './ios-push.js';
import { createNotificationNavigation } from './android-notification-navigation.js';
import { subscriptionView } from './store-subscription.mjs';
import {createSignupCheckout} from './signup-checkout.mjs';
const storeKit=registerPlugin('ManeeStoreKit');
const reportFiles=registerPlugin('ManeeReportFiles');
let getContext=()=>null,dialog=null,closing=false,refreshed=null;
let openNotification=async()=>'pending';
const messages={billing_not_ready:'구독 연결을 준비하고 있어요.',service_not_ready:'서비스 연결을 준비하고 있어요.',
 push_access_denied:'연결된 매장을 확인하고 다시 로그인해 주세요.',
 owner_access_denied:'사장님 계정으로 로그인하고 매장을 선택해 주세요.',authentication_required:'다시 로그인해 주세요.',
 purchase_mismatch:'이 구매는 현재 매장과 연결되지 않았어요. 처음 구독한 계정과 매장을 확인해 주세요.',
 other_platform_subscribed:'이 계정은 다른 스토어에서 구독 중이에요. 기존 구독을 확인해 주세요.',
 checkout_in_progress:'다른 기기에서 이 계정의 결제를 진행 중이에요. 잠시 후 구매 복원을 눌러 주세요.',
 other_store_subscribed:'다른 매장에서 이용 중인 구독이 있어요. 추가 매장 결제는 준비 중이에요.'};
async function request(context,name,body){
 const {data,error}=await context.db.auth.getSession();
 if(error||!data?.session||data.session.user.id!==context.userId)throw Error('다시 로그인해 주세요.');
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),20000);
 let response;try{response=await fetch(NATIVE_SERVICES_ORIGIN+'/.netlify/functions/'+name,{method:'POST',
  headers:{'Content-Type':'application/json',Authorization:'Bearer '+data.session.access_token},
  body:JSON.stringify({...body,storeId:context.storeId}),signal:controller.signal});}finally{clearTimeout(timeout);}
 let result;try{result=await response.json();}catch{throw Error('서비스 연결을 준비하고 있어요. 잠시 후 다시 시도해 주세요.');}
 if(!response.ok)throw Error(messages[result.error]||'연결을 확인하지 못했어요. 잠시 후 다시 시도해 주세요.');
 return result;
}
const billing=createBillingClient({storeKit,request,getContext:()=>getContext()});
const afterOwnerSignup=createSignupCheckout({getContext:()=>getContext(),enabled:true,
 readAccess:async c=>{const r=await c.db.rpc('manee_store_billing_access',{p_store_id:c.storeId});if(r.error)throw r.error;return r.data;},
 openCheckout:()=>openSettings()});
function sameContext(c){const now=getContext();return !closing&&now?.userId===c.userId&&now?.storeId===c.storeId;}
const notifications=createIosPush({push:PushNotifications,getContext:()=>getContext(),request,storage:localStorage});
const navigation=createNotificationNavigation({allowedRoles:['storeOwner','staff'],push:PushNotifications,getContext:()=>getContext(),open:(data,isCurrent)=>openNotification(data,isCurrent)});
void navigation.start().catch(()=>{});
function element(tag,text,parent){const el=document.createElement(tag);if(text)el.textContent=text;parent?.append(el);return el;}
function showSheet(sheet){
 if(typeof sheet.showModal==='function')sheet.showModal();
 else{
  sheet.style.cssText+=';display:block;position:fixed;left:50%;top:50%;margin:0;transform:translate(-50%,-50%);z-index:10000';
  sheet.close=()=>sheet.dispatchEvent(new Event('close'));
 }
}
async function openAppInfo() {
 if (document.getElementById('manee-ios-info')) return;
 const sheet = document.createElement('dialog');
 sheet.id = 'manee-ios-info';
 sheet.setAttribute('aria-labelledby', 'ios-info-title');
 sheet.style.cssText = 'max-width:360px;width:85%;border:0;border-radius:20px;padding:24px;line-height:1.7;box-sizing:border-box';
 sheet.innerHTML = `
  <h2 id="ios-info-title" style="margin:0;color:#173f2e;font-size:22px">앱 정보</h2>
  <dl style="margin:18px 0;color:#203c30">
   <div style="display:flex;justify-content:space-between;gap:16px;padding:10px 0;border-bottom:1px solid #e2ebe5">
    <dt>앱 이름</dt><dd id="ios-info-name" style="margin:0;font-weight:700;text-align:right;overflow-wrap:anywhere">매니</dd>
   </div>
   <div style="display:flex;justify-content:space-between;gap:16px;padding:10px 0">
    <dt>앱 버전</dt><dd id="ios-info-version" role="status" style="margin:0;font-weight:700;text-align:right;overflow-wrap:anywhere">확인 중…</dd>
   </div>
  </dl>
  <button type="button" style="width:100%;min-height:48px;padding:12px;border:0;border-radius:12px;background:#16774c;color:#fff;font:inherit;font-weight:700">닫기</button>`;
 const name = sheet.querySelector('#ios-info-name');
 const version = sheet.querySelector('#ios-info-version');
 sheet.querySelector('button').addEventListener('click', () => sheet.close());
 sheet.addEventListener('close', () => sheet.remove(), {once:true});
 document.body.append(sheet);
 showSheet(sheet);
 try {
  const info = await App.getInfo();
  if (!sheet.isConnected) return;
  if (typeof info?.name === 'string' && info.name.trim()) name.textContent = info.name.trim();
  version.textContent = typeof info?.version === 'string' && info.version.trim()
   ? info.version.trim()
   : '확인할 수 없어요';
 } catch {
  if (sheet.isConnected) version.textContent = '확인할 수 없어요';
 }
}
function openSubscriptionStatus(){
 if(document.getElementById('manee-subscription-status'))return;
 const c=getContext();if(!c?.userId||!c.storeId||c.role!=='storeOwner')return;
 const sheetView=createSubscriptionStatusSheet(document,{storeName:c.storeName,platform:'ios'});
 const sheet=sheetView.sheet,title=sheetView.price,message=sheetView.status;
 document.body.append(sheet);
 const restore=subscriptionButton(sheetView,'구독 확인',()=>{sheet.close();void openSettings();});
 subscriptionButton(sheetView,'닫기',()=>sheet.close(),'secondary');
 const refresh=subscriptionButton(sheetView,'상태 새로고침',()=>void load(),'link');
 sheet.addEventListener('close',()=>sheet.remove(),{once:true});showSheet(sheet);
 let sequence=0;
 const same=()=>{const next=getContext();return sheet.isConnected&&next?.userId===c.userId&&next?.storeId===c.storeId;};
 async function load(){
  const current=++sequence;refresh.disabled=true;restore.hidden=true;
  title.textContent='상태를 확인하고 있어요…';message.textContent='';
  const [accessResult,billingResult]=await Promise.allSettled([
   c.db.rpc('manee_store_billing_access',{p_store_id:c.storeId}),billing.status(),
  ]);
  if(current!==sequence||!same())return;
  const access=accessResult.status==='fulfilled'&&!accessResult.value.error?accessResult.value.data:null;
  const info=billingResult.status==='fulfilled'?billingResult.value:null;
  const active=info?.subscriptions?.some(s=>s.active===true)===true;
  const bill={active,testOnly:!active,testActive:info?.subscriptions?.some(s=>s.testActive===true)===true};
  const unconfigured=accessResult.status==='fulfilled'&&accessResult.value.error?.code==='PGRST202';
  const view=subscriptionView(access,bill,unconfigured,'Apple');
  title.textContent=view.testActive?'Apple 테스트 구독 이용 중':view.title;
  message.textContent=view.testActive&&access?.enforced===true&&access.canWrite!==true
   ?'기존 기록은 조회할 수 있어요. 출퇴근을 포함한 업무 입력·수정에는 정식 매장 이용권이 필요해요.'
   :view.message;
  restore.textContent=active||view.testActive||access?.canWrite===true?'구독 관리·복원':'구독 확인';
  restore.hidden=!info?.appAccountToken;refresh.disabled=false;
 }
 void load().catch(()=>{if(same()){refresh.disabled=false;message.textContent='잠시 후 새로고침해 주세요.';}});
}
async function openSettings(){
 if(dialog)return;
 const c=getContext();if(!c?.userId||!c.storeId||c.role!=='storeOwner')return;
 closing=false;
 const view=createSubscriptionSheet(document,{id:'manee-ios-billing',title:'매니 구독',storeName:c.storeName});dialog=view.sheet;
 const sheet=dialog,status=view.status;
 view.label.textContent='구독 상태';
 view.price.textContent='Apple 구독 확인';
 view.after.hidden=true;
 status.textContent='기존 구독과 이용 가능한 상품을 확인하고 있어요…';
 view.summary.textContent='사장님 아이디 하나로 연결된 모든 매장을 이용해요.';
 const buttons=[];let busy=false,hasActivePurchase=false,trialSelected=false;
 const button=(text,fn,kind='primary')=>{const b=subscriptionButton(view,text,async()=>{if(busy)return;busy=true;buttons.forEach(x=>x.disabled=true);try{if(!sameContext(c))throw Error('매장을 다시 선택해 주세요.');await fn();}catch(e){status.textContent=e.message||'다시 시도해 주세요.';}finally{busy=false;buttons.forEach(x=>x.disabled=false);}},kind);buttons.push(b);return b;};
 const resultText=result=>{
  if(result.otherPlatformActive)return '이 계정은 다른 스토어에서 구독 중이에요. 기존 이용권을 확인해 주세요.';
  if(result.status==='cancelled')return '구매를 취소했어요.';
  if(result.status==='pending')return '구매 승인을 기다리고 있어요. 승인 후 구매 복원을 눌러 주세요.';
  if(result.status==='empty')return '복원할 구매가 없어요.';
  return '구매 내역을 확인했어요. 현재 활성 구독은 없어요.';
 };
 const displayResult=result=>{
  const active=result.subscriptions?.some(s=>s.active===true)===true;
  const testActive=!active&&result.subscriptions?.some(s=>s.testActive===true)===true;
  if(!active&&!testActive){status.textContent=resultText(result);return;}

  hasActivePurchase=true;
  view.label.textContent='구독 상태';
  view.price.textContent=testActive?'테스트 구독 이용 중':'구독 이용 중';
  view.after.textContent='';
  view.after.hidden=true;
  buy.hidden=true;buy.style.display='none';
  status.textContent=testActive?'Apple 테스트 구독이 확인됐어요.':'이 계정의 Apple 구독이 확인됐어요.';
 };
 let paidConfirmed=false;
 const buy=button('월 구독 시작',async()=>{
  if(buy.dataset.paidReview==='true'&&!paidConfirmed){
   paidConfirmed=true;buy.textContent='오늘 9,900원 결제하고 구독하기';
   setSubscriptionOffer(view,{price:'9,900원'});view.after.textContent='무료체험 미적용 · 오늘 9,900원 결제 · 매월 갱신';
   status.textContent='무료체험 없이 오늘 9,900원을 결제하고 매월 갱신하는 조건이에요. 동의하시면 아래 버튼을 눌러 Apple 결제창에서 최종 조건을 확인해 주세요.';return;
  }
  displayResult(await billing.purchase({twoMonthsFree:trialSelected}));
 });buy.hidden=true;buy.style.display='none';
 button('기존 구독 복원',async()=>displayResult(await billing.restore()),'link');
 button('구독 관리',()=>{window.open('https://apps.apple.com/account/subscriptions','_system');},'link');
 const notificationDetails=element('details',null,view.details);element('summary','매장 알림 설정',notificationDetails);
 const notificationActions=[['이 매장 알림 켜기','enable']];
 if(typeof IOS_PUBLIC_RELEASE==='undefined'||!IOS_PUBLIC_RELEASE)notificationActions.push(['알림 테스트','test']);
 notificationActions.push(['이 기기 알림 끄기','disable']);
 for(const [label,action] of notificationActions)notificationDetails.append(button(label,async()=>{status.textContent=(await notifications.action(action)).message;},'secondary'));
 element('p','알림은 선택한 한 매장에 연결돼요.',notificationDetails);
 view.terms.textContent='구독은 매월 갱신되며 Apple 계정으로 청구돼요. 무료체험 기간과 요금은 Apple 결제창에서 확인해 주세요. 구독 관리에서 갱신일을 확인하거나 구독을 취소할 수 있어요. 국내 유료 전환에는 Apple 동의 절차가 적용돼요. 이용 기간이 끝나면 업무 입력·수정이 제한돼요. 기존 기록 조회와 구독 복원은 계속 이용할 수 있어요.';
 const links=element('p',null,view.details);

 button('닫기',()=>sheet.close(),'secondary');
 sheet.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
 sheet.addEventListener('close',()=>{sheet.remove();if(dialog===sheet)dialog=null;});document.body.append(sheet);showSheet(sheet);
 try{
  const info=await billing.status();
  if(!sameContext(c)||dialog!==sheet)return;
  if(!hasActivePurchase){
   if(info.appAccountToken)displayResult(info);
   else status.textContent='구독 연결을 준비하고 있어요.';
  }
  for(const [label,url] of [['이용약관',info.termsUrl],['개인정보 처리방침',info.privacyUrl]]){
   if(typeof url==='string'&&url.startsWith('https://')){const a=element('a',label,links);a.href=url;a.target='_blank';a.rel='noopener';a.style.marginRight='12px';}
  }
  if(hasActivePurchase||info.otherPlatformActive===true)return;
  if(info.ready&&!info.otherStoreSubscribed){
   status.textContent='Apple에서 이용 가능한 구독 상품을 확인하고 있어요…';
   const product=await billing.products(info.productId);
   if(!sameContext(c)||dialog!==sheet||hasActivePurchase)return;
   if(product.monthly!==true||product.priceApproved!==true)throw Error('월 구독 상품과 요금을 확인하고 있어요. 잠시 후 다시 시도해 주세요.');
   trialSelected=product.twoMonthsFree===true;
   if(trialSelected){
    buy.textContent=setSubscriptionOffer(view,{trialMonths:2,price:product.price});
    status.textContent='Apple 결제창에서 체험 기간과 갱신 요금을 확인해 주세요.';
   }
   else {setSubscriptionOffer(view,{price:product.price});view.label.textContent='현재 Apple 계정에 제공된 요금';view.after.textContent='무료체험 미적용 · 오늘 9,900원 결제 · 매월 갱신';buy.textContent='무료체험 없는 구독 요금 확인';buy.dataset.paidReview='true';status.textContent='이 Apple 계정에는 무료체험이 적용되지 않아요. 무료체험 없이 시작하는 요금을 확인해 주세요.';}
   view.after.hidden=false;
   buy.hidden=false;buy.style.display='block';
  }else if(info.otherStoreSubscribed)status.textContent=messages.other_store_subscribed;
 }catch(e){if(dialog===sheet&&sameContext(c)&&!hasActivePurchase)status.textContent=e.message;}
}
window.MANEE_NATIVE={
 afterOwnerSignup,
 async saveFile({bytes,filename,mimeType}){
  return reportFiles.save({data:reportBytesToBase64(bytes),filename,mimeType});
 },
 subscriptionDenied(){if(getContext()?.role==='storeOwner')openSubscriptionStatus();},
 configure(context,onNotification){getContext=context;if(onNotification)openNotification=onNotification;void navigation.flush();},openSettings,
 openAppInfo,
 push(action){return notifications.action(action);},
 openSubscriptionStatus,
 refresh(){
  void navigation.start().then(()=>navigation.flush()).catch(()=>{});
  const c=getContext();if(!c?.userId||!c.storeId||c.role!=='storeOwner')return;
  closing=false;const key=c.userId+':'+c.storeId;if(refreshed===key)return;refreshed=key;
  billing.sync().catch(()=>{});
 },
 async prepareLogout(){
  if(billing.isBusy())throw Error('구매 처리가 끝난 뒤 로그아웃해 주세요.');
  closing=true;refreshed=null;
  navigation.clear();await notifications.prepareLogout();dialog?.close();
 },
};
storeKit.addListener('transactionUpdated',()=>{try{if(!closing&&getContext()?.userId)billing.sync().catch(()=>{});}catch{}});
