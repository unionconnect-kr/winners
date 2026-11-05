import {createSubscriptionSheet,subscriptionButton,setSubscriptionOffer,setSubscriptionPromotion,closeSubscriptionSheet,reuseSubscriptionSheet} from './subscription-sheet.mjs';
// Only offers returned as eligible by Google Play are shown. Never invent prices.
export function testOffers(products,productId='manee.store1.monthly') {
 if(!/^manee\.store[1-9][0-9]*\.monthly$/.test(productId))return [];
 const product=products?.find(p=>p.productId===productId);
 const offers=(product?.offers||[]).filter(o=>o.basePlanId==='monthly' && o.offerToken &&
  (o.offerId==='trial-60days' ? o.phases?.length===2 &&
    Number(o.phases[0].amountMicros)===0 && o.phases[0].period==='P60D' &&
    o.phases[0].cycles===1 && o.phases[0].recurrenceMode===2 :
    !o.offerId && o.phases?.length===1) &&
  o.phases.every(p=>p.currency==='KRW') &&
  o.phases.at(-1).period==='P1M' && o.phases.at(-1).recurrenceMode===1 &&
  Number(o.phases.at(-1).amountMicros)===9900000000
 );
 const trial=offers.find(o=>o.offerId==='trial-60days');
 return (trial?[trial]:offers).map(o=>({productId:product.productId,offerToken:o.offerToken,trialDays:o.offerId==='trial-60days'?60:0,price:Number(o.phases.at(-1).amountMicros)/1000000===9900?'9,900원':o.phases.at(-1).price,
  label:o.phases.map(p=>`${Number(p.amountMicros)===0?'무료':p.price} (${p.period==='P1M'?'1개월':p.period==='P60D'?'60일':p.period})`).join(' → ')}));
}
export function openAndroidBilling({billing,getContext,document,launchTrial=false}) {
 if(reuseSubscriptionSheet(document,'manee-android-billing'))return;
 const c=getContext();if(c?.role!=='storeOwner')return;
 const previous=document.getElementById('manee-subscription-status');if(previous)closeSubscriptionSheet(previous);
 const view=createSubscriptionSheet(document,{id:'manee-android-billing',title:'매니 구독',storeName:c.storeName});const sheet=view.sheet;
 const same=()=>{const n=getContext();return sheet.isConnected&&n?.userId===c.userId&&n?.storeId===c.storeId;};
 const {heading,status}=view;setSubscriptionPromotion(view);
 let busy=false,subscriptionActive=false;const buttons=[],purchaseButtons=[];
 const execute=async fn=>{if(busy)return;busy=true;buttons.forEach(b=>b.disabled=true);try{
  if(!same())throw Error('계정 또는 매장을 다시 선택해 주세요.');await fn();
 }catch(e){if(sheet.isConnected){status.textContent=e.message||'연결을 확인해 주세요.';if(/^PLAY_|PRODUCT_UNAVAILABLE|OFFER_CHANGED/.test(e.code||'')){purchaseButtons.forEach(b=>b.hidden=true);retry.hidden=false;}}}finally{busy=false;buttons.forEach(b=>b.disabled=false);}};
 const button=(label,fn,kind='primary')=>{const el=subscriptionButton(view,label,()=>execute(fn),kind);buttons.push(el);return el;};
 let testMode=true;
 const show=r=>{if(!same())return;
  if(r.status==='alreadyActive'||r.results?.some(x=>x.active===true||(testMode&&x.testActive===true))){
   subscriptionActive=true;purchaseButtons.forEach(b=>b.hidden=true);retry.hidden=true;
   view.label.textContent='이용 중인 구독';view.price.textContent='구독 이용 중';view.after.textContent='구독 관리에서 다음 결제일을 확인해 주세요.';
  }
  status.textContent=r.status==='alreadyActive'?'이 매장에 이미 이용 중인 구독이 있어요.':r.status==='cancelled'?'구매를 취소했어요.':r.status==='pending'?'승인을 기다리고 있어요. 잠시 후 구매 복원을 눌러 주세요.':r.status==='empty'?'복원할 구매가 없어요.':r.results?.some(x=>testMode?x.testActive:x.active)?(testMode?'테스트 구매·서버 검증이 완료됐어요.':'Google Play 구매·서버 검증이 완료됐어요.'):(testMode?'구매 내역을 확인했어요. 현재 활성 테스트 구독은 없어요.':'구매 내역을 확인했어요. 현재 활성 구독은 없어요.');};
 const retry=button('요금·혜택 다시 확인',async()=>{closeSubscriptionSheet(sheet);openAndroidBilling({billing,getContext,document});});retry.hidden=true;
 const close=button('닫기',()=>closeSubscriptionSheet(sheet),'secondary');
 sheet.addEventListener('cancel',e=>{if(busy)e.preventDefault();});sheet.addEventListener('close',()=>sheet.remove(),{once:true});
 document.body.append(sheet);sheet.showModal();
 void(async()=>{try{
  const info=await billing.status();if(!same())return;
  if(info.ready!==true||typeof info.testOnly!=='boolean'){status.textContent=info.reason==='app_update_required'?'유료 결제를 사용하려면 앱을 업데이트해 주세요.':info.reason==='additional_store_not_ready'?'추가 매장 구독 상품을 준비하고 있어요. 기존 매장의 구독은 유지됩니다.':'이 계정·매장은 구독 대상으로 등록되지 않았거나 상품 연결이 준비되지 않았어요.';return;}
  testMode=info.testOnly;
  heading.textContent=testMode?'Google Play 결제 테스트':info.billingScope==='account'?'계정 이용권 구독':'매장 이용권 구독';
  view.summary.textContent=info.billingScope==='account'?'사장님 아이디 하나로 연결된 모든 매장을 이용해요.':'선택한 매장의 매출·직원·비용을 관리해요.';
  view.terms.textContent=testMode?'Play 라이선스 테스트 계정으로 진행해 주세요. 결제창에 테스트 카드가 표시될 때만 완료하세요. 일반 카드가 보이면 취소해 주세요.':'구독은 매월 갱신돼요. 무료체험 기간과 이후 요금은 위에 표시된 상품 기준이며, 최종 청구일은 Google Play 결제창에서 확인해 주세요. 국내 무료체험의 유료 전환에는 Google Play 동의 절차가 적용돼요. 취소는 Play 스토어 구독 관리에서 할 수 있어요. 이용 기간 종료 후 출퇴근을 포함한 업무 입력·수정이 제한되며, 기존 기록 조회와 구독 복원은 가능해요.';
  subscriptionActive=info.active===true||(testMode&&info.testActive===true);
  if(subscriptionActive){view.label.textContent='이용 중인 구독';view.price.textContent='구독 이용 중';view.after.textContent='구독 관리에서 다음 결제일을 확인해 주세요.';}
  button('기존 구독 복원',async()=>show(await billing.restore()),'link');
  const data=await billing.products();if(!same())return;
  const offers=testOffers(data.products,info.productId);
  status.textContent=subscriptionActive?(testMode?'이 매장의 테스트 구독을 이용 중이에요.':'이 매장의 구독을 이용 중이에요.'):offers.length?'다음 화면에서 Google Play 결제 조건을 확인해 주세요.':(testMode?'현재 구매 가능한 상품이 없어요. Play 설치 계정과 내부 테스트 참여 상태를 확인해 주세요.':'현재 구매 가능한 상품이 없어요. Google Play 계정을 확인해 주세요.');
  if(subscriptionActive){view.label.textContent='이용 중인 구독';view.price.textContent='구독 이용 중';view.after.textContent='구독 관리에서 다음 결제일을 확인해 주세요.';}
  else if(!offers.length){retry.hidden=false;}
  let startTrial=null;
  if(!subscriptionActive)for(const offer of offers){
   if(offer.trialDays===60){
    const label=setSubscriptionOffer(view,offer);
    startTrial=async()=>{status.textContent='Google Play 결제창을 열고 있어요…';show(await billing.purchase(offer));};
    const buy=button(testMode?label+' · 테스트 구매':label,startTrial);buy.dataset.purchase='true';purchaseButtons.push(buy);
   }else{
    // An absent eligible trial is not permission to silently charge immediately.
    status.textContent='현재 Google Play 계정에는 무료체험 상품이 표시되지 않았어요. 대상 여부를 다시 확인하거나 무료체험 없는 구독 요금을 확인해 주세요.';
    retry.hidden=false;
    const paid=button('무료체험 없는 구독 요금 확인',()=>{
     if(subscriptionActive)return;
     paid.hidden=true;retry.hidden=true;setSubscriptionOffer(view,offer);
     view.after.textContent='무료체험 미적용 · 오늘 9,900원 결제 · 매월 갱신';
     status.textContent='무료체험 없이 시작하는 구독이에요. Google Play 결제창에서 최종 요금을 확인해 주세요.';
     const buy=button(testMode?'월 9,900원 테스트 구독':'월 9,900원으로 구독하기',async()=>show(await billing.purchase(offer)));
     buy.dataset.purchase='true';purchaseButtons.push(buy);view.actions.append(close);
    },'link');purchaseButtons.push(paid);
   }
  }
  // Keep the primary action before close, with restoration in a quiet footer.
  view.actions.append(close);
  // Only the explicit status-sheet action may open Play directly, and only for
  // the eligible 60-day offer returned by Play. Paid-only offers require review.
  if(launchTrial&&startTrial)await execute(startTrial);

 }catch(e){if(same()){status.textContent=e.message||'상품 연결을 확인하지 못했어요.';retry.hidden=false;}}})();
}
