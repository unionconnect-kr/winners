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
const storeKit=registerPlugin('ManeeStoreKit');
const reportFiles=registerPlugin('ManeeReportFiles');
let getContext=()=>null,dialog=null,closing=false,refreshed=null;
let openNotification=async()=>'pending';
const messages={billing_not_ready:'구독 연결을 준비하고 있어요.',service_not_ready:'서비스 연결을 준비하고 있어요.',
 push_access_denied:'연결된 매장을 확인하고 다시 로그인해 주세요.',
 owner_access_denied:'사장님 계정으로 로그인하고 매장을 선택해 주세요.',authentication_required:'다시 로그인해 주세요.',
 purchase_mismatch:'이 구매는 현재 매장과 연결되지 않았어요. 처음 구독한 계정과 매장을 확인해 주세요.',
 other_platform_subscribed:'이 매장에는 이미 이용권이 연결돼 있어요. 매장 이용권에서 확인해 주세요.',
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
 const sheet=element('dialog',null,document.body);sheet.id='manee-subscription-status';
 sheet.style.cssText='max-width:420px;width:90%;border:0;border-radius:20px;padding:24px;line-height:1.6;color:#18352a';
 element('h2','매장 이용권',sheet);element('p',c.storeName||'선택한 매장',sheet);
 const title=element('strong','상태를 확인하고 있어요…',sheet);
 const message=element('p',null,sheet);message.setAttribute('role','status');
 const sandbox=element('p',null,sheet);sandbox.hidden=true;
 const action=(label,fn)=>{const b=element('button',label,sheet);b.type='button';b.style.cssText='width:100%;padding:13px;margin:8px 0';b.onclick=fn;return b;};
 const restore=action('Apple 구독·구매 복원',()=>{sheet.close();void openSettings();});
 const refresh=action('상태 새로고침',()=>void load());
 action('닫기',()=>sheet.close());sheet.addEventListener('close',()=>sheet.remove(),{once:true});showSheet(sheet);
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
  title.textContent=view.title;message.textContent=view.message;
  if(view.testActive){sandbox.hidden=false;sandbox.textContent='Apple 테스트 구독이 확인됐습니다. 테스트 결제는 정식 이용권과 구분됩니다.';}
  restore.hidden=!info?.appAccountToken;refresh.disabled=false;
 }
 void load().catch(()=>{if(same()){refresh.disabled=false;message.textContent='잠시 후 새로고침해 주세요.';}});
}
async function openSettings(){
 if(dialog)return;
 const c=getContext();if(!c?.userId||!c.storeId||c.role!=='storeOwner')return;
 closing=false;
 dialog=element('dialog',null,document.body);dialog.style.cssText='border:0;border-radius:20px;padding:24px;width:min(88vw,420px);max-height:85vh;color:#18352a;background:white;box-sizing:border-box';
 const sheet=dialog;
 element('h2','아이폰 구독·알림',sheet);element('p',c.storeName||'선택한 매장',sheet);
 const status=element('p','연결을 확인하고 있어요…',sheet);status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const buttons=[];let busy=false,hasActivePurchase=false;
 const button=(text,fn)=>{const b=element('button',text,sheet);b.type='button';b.style.cssText='display:block;width:100%;padding:13px;margin:10px 0;border:1px solid #ccd9d2;border-radius:10px;background:#f2f7f4;color:#174b37;font-size:16px';
  b.onclick=async()=>{if(busy)return;busy=true;buttons.forEach(x=>x.disabled=true);try{if(!sameContext(c))throw Error('매장을 다시 선택해 주세요.');await fn();}catch(e){status.textContent=e.message||'다시 시도해 주세요.';}finally{busy=false;buttons.forEach(x=>x.disabled=false);}};buttons.push(b);return b;};
 const resultText=result=>{
  if(result.otherPlatformActive)return '이 매장에는 이미 이용권이 연결돼 있어요. 매장 이용권에서 확인할 수 있어요.';
  if(result.status==='cancelled')return '구매를 취소했어요.';
  if(result.status==='pending')return '구매 승인을 기다리고 있어요. 승인 후 구매 복원을 눌러 주세요.';
  if(result.status==='empty')return '복원할 구매가 없어요.';
  if(result.subscriptions?.some(s=>s.testActive))return '테스트 구독이 확인됐어요. 실제 이용권과 구분해 저장했어요.';
  if(result.subscriptions?.some(s=>s.active))return '이 매장의 구독이 확인됐어요.';
  return '구매 내역을 확인했어요. 현재 활성 구독은 없어요.';
 };
 const displayResult=result=>{status.textContent=resultText(result);if(result.subscriptions?.some(s=>s.active||s.testActive)){hasActivePurchase=true;buy.hidden=true;buy.style.display='none';}};
 const buy=button('월 구독 시작',async()=>displayResult(await billing.purchase()));buy.hidden=true;buy.style.display='none';
 button('구매 복원',async()=>displayResult(await billing.restore()));
 button('Apple 구독 관리',()=>{window.open('https://apps.apple.com/account/subscriptions','_system');});
 button('이 매장 알림 켜기',async()=>{status.textContent=(await notifications.action('enable')).message;});
 button('알림 테스트',async()=>{status.textContent=(await notifications.action('test')).message;});
 button('이 기기 알림 끄기',async()=>{status.textContent=(await notifications.action('disable')).message;});
 element('p','알림은 선택한 한 매장에 연결돼요. 다른 매장 알림을 받으려면 해당 매장에서 다시 켜 주세요.',sheet).style.fontSize='13px';
 element('p','구독은 매월 자동 갱신되며 Apple 계정으로 청구됩니다. 무료 체험이 적용되는 경우 체험 종료 후 표시된 월 요금으로 갱신됩니다. 취소는 Apple 구독 관리에서 할 수 있어요.',sheet).style.fontSize='13px';
 const links=element('p',null,sheet);

 button('닫기',()=>sheet.close());
 sheet.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
 sheet.addEventListener('close',()=>{sheet.remove();if(dialog===sheet)dialog=null;});showSheet(sheet);
 try{
  const info=await billing.status();
  if(!sameContext(c)||dialog!==sheet)return;
  status.textContent=info.appAccountToken?resultText(info):'구독 연결을 준비하고 있어요.';
  hasActivePurchase=hasActivePurchase||info.otherPlatformActive===true||info.subscriptions?.some(s=>s.active||s.testActive)===true;
  for(const [label,url] of [['이용약관',info.termsUrl],['개인정보 처리방침',info.privacyUrl]]){
   if(typeof url==='string'&&url.startsWith('https://')){const a=element('a',label,links);a.href=url;a.target='_blank';a.rel='noopener';a.style.marginRight='12px';}
  }
  if(info.ready&&!info.otherStoreSubscribed&&!info.subscriptions?.some(s=>s.active||s.testActive)){
   const product=await billing.products(info.productId);if(!sameContext(c)||dialog!==sheet)return;
   if(product.monthly!==true||product.priceApproved!==true)throw Error('월 구독 상품과 요금을 확인하고 있어요. 잠시 후 다시 시도해 주세요.');
   if(hasActivePurchase)return;
   buy.textContent=(product.oneMonthFree?'1개월 무료 체험 후 ':'')+product.price+' / 월';buy.hidden=false;buy.style.display='block';
  }else if(info.otherStoreSubscribed)status.textContent=messages.other_store_subscribed;
 }catch(e){if(dialog===sheet)status.textContent=e.message;}
}
window.MANEE_NATIVE={
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
