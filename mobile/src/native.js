import {createSubscriptionSheet,subscriptionButton,setSubscriptionOffer,setSubscriptionPromotion,createSubscriptionStatusSheet} from './subscription-sheet.mjs';
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
function openSubscriptionStatus(){
 if(document.getElementById('manee-subscription-status'))return;
 const c=getContext();if(!c?.userId||!c.storeId||c.role!=='storeOwner')return;
 const sheetView=createSubscriptionStatusSheet(document,{storeName:c.storeName,platform:'ios'});
 const sheet=sheetView.sheet,title=sheetView.price,message=sheetView.status;
 document.body.append(sheet);
 const sandbox=sheetView.el('p','',sheetView.card,'color:#67766d;font-size:12px');sandbox.hidden=true;
 const restore=subscriptionButton(sheetView,'무료체험·구독 확인',()=>{sheet.close();void openSettings();});
 subscriptionButton(sheetView,'닫기',()=>sheet.close(),'secondary');
 const refresh=subscriptionButton(sheetView,'상태 새로고침',()=>void load(),'link');
 sheet.addEventListener('close',()=>sheet.remove(),{once:true});showSheet(sheet);
 let sequence=0;
 const same=()=>{const next=getContext();return sheet.isConnected&&next?.userId===c.userId&&next?.storeId===c.storeId;};
 async function load(){
  const current=++sequence;refresh.disabled=true;restore.hidden=true;sandbox.hidden=true;
  title.textContent='상태를 확인하고 있어요…';message.textContent='';
  const [accessResult,billingResult]=await Promise.allSettled([
   c.db.rpc('manee_store_billing_access',{p_store_id:c.storeId}),billing.status(),
  ]);
  if(current!==sequence||!same())return;
  const access=accessResult.status==='fulfilled'&&!accessResult.value.error?accessResult.value.data:null;
  const info=billingResult.status==='fulfilled'?billingResult.value:null;
  const bill={active:info?.subscriptions?.some(s=>s.active===true)===true,
   testOnly:true,testActive:info?.subscriptions?.some(s=>s.testActive===true)===true};
  const unconfigured=accessResult.status==='fulfilled'&&accessResult.value.error?.code==='PGRST202';
  const view=subscriptionView(access,bill,unconfigured,'Apple');
  title.textContent=view.title;message.textContent=view.message;sheetView.promotion.hidden=access?.canWrite===true;
  if(view.testActive){sandbox.hidden=false;sandbox.textContent='Apple 테스트 구독이 확인됐습니다. 테스트 결제는 정식 이용권과 구분됩니다.';}
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
 setSubscriptionPromotion(view,{platform:'ios'});
 view.summary.textContent='사장님 아이디 하나로 연결된 모든 매장을 이용해요.';
 const buttons=[];let busy=false,hasActivePurchase=false,trialSelected=false;
 const button=(text,fn,kind='primary')=>{const b=subscriptionButton(view,text,async()=>{if(busy)return;busy=true;buttons.forEach(x=>x.disabled=true);try{if(!sameContext(c))throw Error('매장을 다시 선택해 주세요.');await fn();}catch(e){status.textContent=e.message||'다시 시도해 주세요.';}finally{busy=false;buttons.forEach(x=>x.disabled=false);}},kind);buttons.push(b);return b;};
 const resultText=result=>{
  if(result.otherPlatformActive)return '이 계정은 다른 스토어에서 구독 중이에요. 기존 이용권을 확인해 주세요.';
  if(result.status==='cancelled')return '구매를 취소했어요.';
  if(result.status==='pending')return '구매 승인을 기다리고 있어요. 승인 후 구매 복원을 눌러 주세요.';
  if(result.status==='empty')return '복원할 구매가 없어요.';
  if(result.subscriptions?.some(s=>s.testActive))return '테스트 구독이 확인됐어요. 실제 이용권과 구분해 저장했어요.';
  if(result.subscriptions?.some(s=>s.active))return '이 계정의 구독이 확인됐어요.';
  return '구매 내역을 확인했어요. 현재 활성 구독은 없어요.';
 };
 const displayResult=result=>{status.textContent=resultText(result);if(result.subscriptions?.some(s=>s.active||s.testActive)){hasActivePurchase=true;buy.hidden=true;buy.style.display='none';}};
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
 for(const [label,action] of [['이 매장 알림 켜기','enable'],['알림 테스트','test'],['이 기기 알림 끄기','disable']])notificationDetails.append(button(label,async()=>{status.textContent=(await notifications.action(action)).message;},'secondary'));
 element('p','알림은 선택한 한 매장에 연결돼요.',notificationDetails);
 view.terms.textContent='구독은 매월 갱신되며 Apple 계정으로 청구돼요. 무료체험 기간과 이후 요금은 위에 표시된 상품 기준이며, 최종 청구일은 Apple 결제창에서 확인해 주세요. 국내 유료 전환에는 Apple 동의 절차가 적용돼요. 취소는 구독 관리에서 할 수 있어요. 이용 기간 종료 후 업무 입력·수정은 제한되지만 기존 기록 조회와 구독 복원은 가능해요.';
 const links=element('p',null,view.details);

 button('닫기',()=>sheet.close(),'secondary');
 sheet.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
 sheet.addEventListener('close',()=>{sheet.remove();if(dialog===sheet)dialog=null;});document.body.append(sheet);showSheet(sheet);
 try{
  const info=await billing.status();
  if(!sameContext(c)||dialog!==sheet)return;
  status.textContent=info.appAccountToken?resultText(info):'구독 연결을 준비하고 있어요.';
  if(info.subscriptions?.some(s=>s.active||s.testActive)){view.label.textContent='이용 중인 구독';view.price.textContent='구독 이용 중';}
  hasActivePurchase=hasActivePurchase||info.otherPlatformActive===true||info.subscriptions?.some(s=>s.active||s.testActive)===true;
  for(const [label,url] of [['이용약관',info.termsUrl],['개인정보 처리방침',info.privacyUrl]]){
   if(typeof url==='string'&&url.startsWith('https://')){const a=element('a',label,links);a.href=url;a.target='_blank';a.rel='noopener';a.style.marginRight='12px';}
  }
  if(info.ready&&!info.otherStoreSubscribed&&!info.subscriptions?.some(s=>s.active||s.testActive)){
   const product=await billing.products(info.productId);if(!sameContext(c)||dialog!==sheet)return;
   if(product.monthly!==true||product.priceApproved!==true)throw Error('월 구독 상품과 요금을 확인하고 있어요. 잠시 후 다시 시도해 주세요.');
   if(hasActivePurchase)return;
   trialSelected=product.twoMonthsFree===true;
   if(trialSelected){buy.textContent=setSubscriptionOffer(view,{trialMonths:2,price:product.price});}
   else {setSubscriptionOffer(view,{price:product.price});view.label.textContent='현재 Apple 계정에 제공된 요금';view.after.textContent='무료체험 미적용 · 오늘 9,900원 결제 · 매월 갱신';buy.textContent='무료체험 없는 구독 요금 확인';buy.dataset.paidReview='true';status.textContent='이 Apple 계정에는 무료체험이 적용되지 않아요. 무료체험 없이 시작하는 요금을 확인해 주세요.';}
   buy.hidden=false;buy.style.display='block';
  }else if(info.otherStoreSubscribed)status.textContent=messages.other_store_subscribed;
 }catch(e){if(dialog===sheet)status.textContent=e.message;}
}
window.MANEE_NATIVE={
 afterOwnerSignup,
 async saveFile({bytes,filename,mimeType}){
  return reportFiles.save({data:reportBytesToBase64(bytes),filename,mimeType});
 },
 subscriptionDenied(){if(getContext()?.role==='storeOwner')openSubscriptionStatus();},
 configure(context,onNotification){getContext=context;if(onNotification)openNotification=onNotification;void navigation.flush();},openSettings,
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
