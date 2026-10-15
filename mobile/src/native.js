import { Geolocation } from '@capacitor/geolocation';

// Keep the existing callback-based screens; request access only on user action.
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

import { registerPlugin } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { createBillingClient } from './billing.mjs';
import { reportBytesToBase64 } from './report-file.js';
const storeKit=registerPlugin('ManeeStoreKit');
const reportFiles=registerPlugin('ManeeReportFiles');
let getContext=()=>null,pushTask=null,dialog=null,closing=false,refreshed=null;
const messages={billing_not_ready:'구독 연결을 준비하고 있어요.',service_not_ready:'서비스 연결을 준비하고 있어요.',
 owner_access_denied:'사장님 계정으로 로그인하고 매장을 선택해 주세요.',authentication_required:'다시 로그인해 주세요.',
 purchase_mismatch:'이 구매는 현재 매장과 연결되지 않았어요. 처음 구독한 계정과 매장을 확인해 주세요.',
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
async function disablePush(){
 if(pushTask)await pushTask.catch(()=>{});
 const c=getContext();
 if(c?.userId&&localStorage.getItem('manee-native-push-owner')===c.userId){
  const result=await c.db.rpc('manee_ios_push',{p_store_id:null,p_token:null,p_enabled:false});
  if(result.error||result.data!==true)throw Error('알림 해제를 확인하지 못했어요. 다시 시도해 주세요.');
 }
 localStorage.removeItem('manee-native-push-owner');
 localStorage.removeItem('manee-native-push-store');
 await PushNotifications.unregister();
 await PushNotifications.removeAllDeliveredNotifications();
}
async function enablePush(){
 if(pushTask)throw Error('알림을 연결 중이에요.');
 const c=getContext();if(!c?.userId||!c.storeId)throw Error('매장을 선택해 주세요.');
 pushTask=(async()=>{
  const ready=await request(c,'ios-push',{action:'status'});
  if(!ready.ready)throw Error('아이폰 알림 연결을 준비하고 있어요.');
  if(!sameContext(c))throw Error('계정 또는 매장이 바뀌었어요.');
  let permission=await PushNotifications.checkPermissions();
  if(permission.receive==='prompt')permission=await PushNotifications.requestPermissions();
  if(permission.receive!=='granted')throw Error('아이폰 설정에서 매니 알림을 허용해 주세요.');
  let success,failure,timer;
  try{
   const token=await new Promise((resolve,reject)=>{
    // Attach both listeners before requesting APNs registration.
    (async()=>{
     success=await PushNotifications.addListener('registration',t=>resolve(t.value.toLowerCase()));
     failure=await PushNotifications.addListener('registrationError',()=>reject(Error('알림 기기를 등록하지 못했어요.')));
     timer=setTimeout(()=>reject(Error('알림 연결이 지연되고 있어요. 다시 시도해 주세요.')),15000);
     await PushNotifications.register();
    })().catch(reject);
   });
   if(!sameContext(c))throw Error('계정 또는 매장이 바뀌었어요.');
   const result=await c.db.rpc('manee_ios_push',{p_store_id:c.storeId,p_token:token,p_enabled:true});
   if(result.error||result.data!==true)throw Error('알림 연결을 저장하지 못했어요. 다시 로그인해 주세요.');
   localStorage.setItem('manee-native-push-owner',c.userId);
   localStorage.setItem('manee-native-push-store',c.storeId);
   if(!sameContext(c))throw Error('계정 또는 매장이 바뀌었어요.');
  }finally{clearTimeout(timer);await success?.remove();await failure?.remove();}
 })();
 try{await pushTask;}finally{pushTask=null;}
}
function element(tag,text,parent){const el=document.createElement(tag);if(text)el.textContent=text;parent?.append(el);return el;}
async function openSettings(){
 if(dialog)return;
 const c=getContext();if(!c?.userId||!c.storeId)return;
 closing=false;
 dialog=element('dialog',null,document.body);dialog.style.cssText='border:0;border-radius:20px;padding:24px;width:min(88vw,420px);max-height:85vh;color:#18352a;background:white;box-sizing:border-box';
 const sheet=dialog;
 element('h2','아이폰 구독·알림',sheet);element('p',c.storeName||'선택한 매장',sheet);
 const status=element('p','연결을 확인하고 있어요…',sheet);status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const buttons=[];let busy=false;
 const button=(text,fn)=>{const b=element('button',text,sheet);b.type='button';b.style.cssText='display:block;width:100%;padding:13px;margin:10px 0;border:1px solid #ccd9d2;border-radius:10px;background:#f2f7f4;color:#174b37;font-size:16px';
  b.onclick=async()=>{if(busy)return;busy=true;buttons.forEach(x=>x.disabled=true);try{if(!sameContext(c))throw Error('매장을 다시 선택해 주세요.');await fn();}catch(e){status.textContent=e.message||'다시 시도해 주세요.';}finally{busy=false;buttons.forEach(x=>x.disabled=false);}};buttons.push(b);return b;};
 const resultText=result=>{
  if(result.status==='cancelled')return '구매를 취소했어요.';
  if(result.status==='pending')return '구매 승인을 기다리고 있어요. 승인 후 구매 복원을 눌러 주세요.';
  if(result.status==='empty')return '복원할 구매가 없어요.';
  if(result.subscriptions?.some(s=>s.testActive))return '테스트 구독이 확인됐어요. 실제 이용권과 구분해 저장했어요.';
  if(result.subscriptions?.some(s=>s.active))return '이 매장의 구독이 확인됐어요.';
  return '구매 내역을 확인했어요. 현재 활성 구독은 없어요.';
 };
 const buy=button('월 구독 시작',async()=>{status.textContent=resultText(await billing.purchase());});buy.hidden=true;buy.style.display='none';
 button('구매 복원',async()=>{status.textContent=resultText(await billing.restore());});
 button('Apple 구독 관리',()=>{window.open('https://apps.apple.com/account/subscriptions','_system');});
 button('이 매장 알림 켜기',async()=>{await enablePush();status.textContent='이 매장의 아이폰 알림이 연결됐어요.';});
 button('알림 테스트',async()=>{const result=await request(c,'ios-push',{action:'test'});status.textContent=result.sent>0?'테스트 알림을 보냈어요.':result.ready?'전송을 확인하지 못했어요. 알림 연결을 다시 확인해 주세요.':'아이폰 알림 연결을 준비하고 있어요.';});
 button('이 기기 알림 끄기',async()=>{await disablePush();status.textContent='이 기기 알림을 해제했어요.';});
 element('p','알림은 선택한 한 매장에 연결돼요. 다른 매장 알림을 받으려면 해당 매장에서 다시 켜 주세요.',sheet).style.fontSize='13px';
 element('p','구독은 매월 자동 갱신되며 Apple 계정으로 청구됩니다. 무료 체험이 적용되는 경우 체험 종료 후 표시된 월 요금으로 갱신됩니다. 취소는 Apple 구독 관리에서 할 수 있어요.',sheet).style.fontSize='13px';
 const links=element('p',null,sheet);

 button('닫기',()=>sheet.close());
 sheet.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
 sheet.addEventListener('close',()=>{sheet.remove();if(dialog===sheet)dialog=null;});if(sheet.showModal)sheet.showModal();else{sheet.style.cssText+=';display:block;position:fixed;left:50%;top:50%;margin:0;transform:translate(-50%,-50%);z-index:10000';sheet.close=()=>sheet.dispatchEvent(new Event('close'));}
 try{
  const info=await billing.status();
  if(!sameContext(c)||dialog!==sheet)return;
  status.textContent=info.appAccountToken?resultText(info):'구독 연결을 준비하고 있어요.';
  for(const [label,url] of [['이용약관',info.termsUrl],['개인정보 처리방침',info.privacyUrl]]){
   if(typeof url==='string'&&url.startsWith('https://')){const a=element('a',label,links);a.href=url;a.target='_blank';a.rel='noopener';a.style.marginRight='12px';}
  }
  if(info.ready&&!info.otherStoreSubscribed){
   const product=await billing.products();if(!sameContext(c)||dialog!==sheet)return;
   buy.textContent=(product.oneMonthFree?'1개월 무료 체험 후 ':'')+product.price+' / 월';buy.hidden=false;buy.style.display='block';
  }else if(info.otherStoreSubscribed)status.textContent=messages.other_store_subscribed;
 }catch(e){if(dialog===sheet)status.textContent=e.message;}
}
window.MANEE_NATIVE={
 async saveFile({bytes,filename,mimeType}){
  return reportFiles.save({data:reportBytesToBase64(bytes),filename,mimeType});
 },
 subscriptionDenied(){if(getContext()?.role==='storeOwner')openSettings();},
 configure(context){getContext=context;},openSettings,
 refresh(){
  const c=getContext();if(!c?.userId||!c.storeId)return;
  closing=false;const key=c.userId+':'+c.storeId;if(refreshed===key)return;refreshed=key;
  billing.sync().catch(()=>{});
  if(localStorage.getItem('manee-native-push-owner')===c.userId&&localStorage.getItem('manee-native-push-store')===c.storeId){
   PushNotifications.checkPermissions().then(p=>{if(p.receive==='granted'&&sameContext(c))return enablePush();}).catch(()=>{});
  }
 },
 async prepareLogout(){
  if(billing.isBusy())throw Error('구매 처리가 끝난 뒤 로그아웃해 주세요.');
  closing=true;refreshed=null;
  try{await disablePush();dialog?.close();}catch(e){closing=false;throw e;}
 },
};
storeKit.addListener('transactionUpdated',()=>{try{if(!closing&&getContext()?.userId)billing.sync().catch(()=>{});}catch{}});
