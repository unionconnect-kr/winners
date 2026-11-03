// The production bridge remains separate; this entry point only packages 1.39 QA.
import './native.js';
import { installIosSocial } from './ios-social.js';
installIosSocial(window.MANEE_CONFIG);
const native = window.MANEE_NATIVE;
const message = '이 테스트 버전은 휴대폰 푸시 연결을 준비 중이에요. 앱 안의 알림은 확인할 수 있어요.';
function notice(title, text) {
  if (document.getElementById('manee-ios139-notice')) return;
  const sheet=document.createElement('dialog');sheet.id='manee-ios139-notice';
  sheet.style.cssText='border:0;border-radius:20px;padding:24px;width:min(88vw,420px);max-height:80vh;overflow:auto;box-sizing:border-box;color:#18352a';
  const heading=document.createElement('h2');heading.textContent=title;
  const body=document.createElement('p');body.textContent=text;body.style.lineHeight='1.7';
  const close=document.createElement('button');close.textContent='닫기';close.type='button';close.onclick=()=>sheet.close();
  close.style.cssText='width:100%;padding:13px;border:0;border-radius:10px;background:#1fa35a;color:white;font-size:16px';
  sheet.append(heading,body,close);document.body.append(sheet);
  sheet.addEventListener('close',()=>sheet.remove(),{once:true});
  if(typeof sheet.showModal==='function')sheet.showModal();
  else {sheet.style.cssText+=';display:block;position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);margin:0;z-index:10000';sheet.close=()=>sheet.dispatchEvent(new Event('close'));}
}
native.openSettings=()=>notice('아이폰 테스트 앱 안내','매니 1.39 · 테스트 데이터만 입력해 주세요. 로그인, 매장·직원 관리, 매출·지출, 보고서 저장·공유를 확인할 수 있어요. 구독 결제와 휴대폰 푸시는 아직 연결되지 않았어요.');
native.openSubscriptionStatus=()=>notice('매니 구독','이 테스트 버전에서는 결제할 수 없어요. 구독 상태는 정식 결제 연결 후 확인할 수 있어요.');
native.refresh=()=>{};
native.push=async()=>({subscribed:false,ready:false,message});
