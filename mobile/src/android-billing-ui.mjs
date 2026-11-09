import {createSubscriptionSheet,subscriptionButton,setSubscriptionOffer,setSubscriptionPromotion,closeSubscriptionSheet,reuseSubscriptionSheet} from './subscription-sheet.mjs';
// Only offers returned as eligible by Google Play are shown. Never invent prices.
export function testOffers(products,productId='manee.store1.monthly') {
 if(!/^manee\.store[1-9][0-9]*\.monthly$/.test(productId))return [];
 const product=products?.find(p=>p.productId===productId);
 // Console IDs name offers; their actual pricing phases define the promise.
 // An eligible 60-day offer may be renamed without changing its terms.
 const isTrial=o=>o.phases?.length===2 &&
  Number(o.phases[0]?.amountMicros)===0 && o.phases[0]?.period==='P60D' &&
  o.phases[0].cycles===1 && o.phases[0].recurrenceMode===2;
 // Keep the server-allocated base plan; receipt verification pins this ID.
 const offers=(product?.offers||[]).filter(o=>o.basePlanId==='monthly' &&
  typeof o.offerToken==='string' && o.offerToken && Array.isArray(o.phases) &&
  (isTrial(o)||o.phases.length===1) && o.phases.every(p=>p?.currency==='KRW') &&
  o.phases.at(-1).period==='P1M' && o.phases.at(-1).recurrenceMode===1 &&
  Number(o.phases.at(-1).amountMicros)===9900000000);
 // Prefer the exact trial, otherwise the regular base plan. Do not create
 // duplicate buttons when multiple eligible offers have identical terms.
 const selected=offers.find(isTrial)||offers.find(o=>!o.offerId)||offers[0];
 return (selected?[selected]:[]).map(o=>({productId:product.productId,offerToken:o.offerToken,trialDays:isTrial(o)?60:0,price:'9,900원',
  label:o.phases.map(p=>`${Number(p.amountMicros)===0?'무료':p.price} (${p.period==='P1M'?'1개월':p.period==='P60D'?'60일':p.period})`).join(' → ')}));
}

const diagnosticOfferKinds = ['trial-60days', 'trial-1month', 'base', 'other'];
const diagnosticCurrencies = new Set(['KRW', 'USD', 'JPY', 'EUR', 'GBP', 'CNY', 'CAD', 'AUD']);
const diagnosticOfferLimit = 8;
const diagnosticPhaseLimit = 4;

function diagnosticOfferKind(offer) {
 if (offer.offerId === 'trial-60days' || offer.offerId === 'trial-1month') return offer.offerId;
 return offer.offerId == null ? 'base' : 'other';
}

function diagnosticInteger(value, max) {
 return Number.isSafeInteger(value) && value >= 0 && value <= max ? String(value) : '기타';
}

function addOfferDiagnostics(view, products, productId, selected) {
 const product = products.find(item => item?.productId === productId);
 const returned = Array.isArray(product?.offers) ? product.offers.filter(offer => offer && typeof offer === 'object') : [];
 const rows = returned.map(offer => {
  const kind = diagnosticOfferKind(offer);
  const phases = Array.isArray(offer.phases) ? offer.phases : [];
  const trialCandidate = kind === 'trial-60days' || phases.some(phase => phase?.period === 'P60D' && phase.amountMicros === 0);
  return {offer, kind, phases, trialCandidate, chosen: Boolean(selected && offer.offerToken === selected.offerToken)};
 });
 const hasTrialCandidate = rows.some(row => row.trialCandidate);
 const trialStatus = selected?.trialDays === 60 ? '선택됨' : hasTrialCandidate ? '수신 · 미선택' : '미수신';

 const panel = view.el('details', null, view.sheet, 'margin-top:12px;color:#52675b;font-size:12px;line-height:1.7');
 view.el('summary', 'Play 혜택 진단', panel, 'cursor:pointer;padding:10px 0;font-weight:600;min-height:24px');
 view.el('p', `60일 제안: ${trialStatus}`, panel, 'margin:4px 0 8px;font-weight:600');
 if (typeof productId === 'string' && /^manee\.store[1-9]\d{0,3}\.monthly$/.exec(productId)?.[0] === productId) {
  view.el('p', productId, panel, 'margin:4px 0 8px');
 }
 if (!rows.length) {
  view.el('p', '조회된 제안이 없어요.', panel, 'margin:4px 0 8px');
  return;
 }

 // Keep the selected offer and the known trials visible in a long response.
 rows.sort((a, b) => Number(b.chosen) - Number(a.chosen) || diagnosticOfferKinds.indexOf(a.kind) - diagnosticOfferKinds.indexOf(b.kind));
 const list = view.el('ul', null, panel, 'margin:0;padding-left:20px');
 for (const {offer, kind, phases, trialCandidate, chosen} of rows.slice(0, diagnosticOfferLimit)) {
  const plan = offer.basePlanId === 'monthly' ? 'monthly' : '기타 플랜';
  const choice = chosen ? '선택됨' : '미선택';
  const renewal = phases.at(-1);
  const priceMatch = renewal?.currency === 'KRW' && renewal.amountMicros === 9900000000;
  const row = view.el('li', `${kind} · ${plan} · ${choice} · 기준 요금 ${priceMatch ? '일치' : '불일치'}`, list, 'margin:6px 0');
  if (!phases.length) {
   view.el('p', '가격 단계 없음', row, 'margin:0');
   continue;
  }
  if (trialCandidate && !chosen) {
   const mismatches = [];
   if (phases.some(phase => phase?.currency !== 'KRW')) mismatches.push('통화 불일치');
   if (phases.length === 2 && (phases[0]?.recurrenceMode !== 2 || renewal?.recurrenceMode !== 1)) {
    mismatches.push('반복 유형 불일치');
   }
   if (mismatches.length) view.el('p', mismatches.join(' · '), row, 'margin:0');
  }
  const phaseList = view.el('ul', null, row, 'margin:0;padding-left:16px');
  const phasesTruncated = phases.length > diagnosticPhaseLimit;
  const shownPhases = phasesTruncated ? [...phases.slice(0, diagnosticPhaseLimit - 1), renewal] : phases;
  for (const phase of shownPhases) {
   const period = typeof phase?.period === 'string' && /^P(?:\d{1,3}[DWMY]|T\d{1,3}[HMS])$/.exec(phase.period)?.[0] === phase.period
    ? phase.period : '기타';
   const currency = diagnosticCurrencies.has(phase?.currency) ? phase.currency : '기타';
   const amount = diagnosticInteger(phase?.amountMicros, 1_000_000_000_000);
   const cycles = diagnosticInteger(phase?.cycles, 99);
   const recurrence = [1, 2, 3].includes(phase?.recurrenceMode) ? phase.recurrenceMode : '기타';
   view.el('li', `${period} · ${currency} ${amount} micros · 횟수 ${cycles} · 반복 ${recurrence}`, phaseList);
  }
  if (phasesTruncated) view.el('p', '중간 가격 단계 생략', row, 'margin:0');
 }
 if (rows.length > diagnosticOfferLimit) view.el('p', '추가 제안 생략', panel, 'margin:4px 0 8px');
}

export function openAndroidBilling({billing,getContext,document,launchTrial=false}) {
 if(reuseSubscriptionSheet(document,'manee-android-billing'))return;
 const c=getContext();if(c?.role!=='storeOwner')return;
 const previous=document.getElementById('manee-subscription-status');if(previous)closeSubscriptionSheet(previous);
 const view=createSubscriptionSheet(document,{id:'manee-android-billing',title:'매니 구독',storeName:c.storeName});const sheet=view.sheet;
 const same=()=>{const n=getContext();return sheet.isConnected&&n?.userId===c.userId&&n?.storeId===c.storeId;};
 const {heading,status}=view;setSubscriptionPromotion(view);
 let busy=false,subscriptionActive=false,purchaseBlocked=false;const buttons=[],purchaseButtons=[];
 const execute=async fn=>{if(busy)return;busy=true;buttons.forEach(b=>b.disabled=true);try{
  if(!same())throw Error('계정 또는 매장을 다시 선택해 주세요.');await fn();
 }catch(e){if(sheet.isConnected){status.textContent=e.message||'연결을 확인해 주세요.';if(e.code==='PURCHASE_BINDING_MISMATCH'){purchaseBlocked=true;purchaseButtons.forEach(b=>b.hidden=true);retry.hidden=true;}else if(!purchaseBlocked&&/^PLAY_|PRODUCT_UNAVAILABLE|OFFER_CHANGED/.test(e.code||'')){purchaseButtons.forEach(b=>b.hidden=true);retry.hidden=false;}}}finally{busy=false;buttons.forEach(b=>b.disabled=false);}};
 const button=(label,fn,kind='primary')=>{const el=subscriptionButton(view,label,()=>execute(fn),kind);buttons.push(el);return el;};
 let testMode=true;
 const show=r=>{if(!same())return;
  if(r.status==='alreadyActive'||r.results?.some(x=>x.active===true||(testMode&&x.testActive===true))){
   subscriptionActive=true;purchaseButtons.forEach(b=>b.hidden=true);retry.hidden=true;
   view.label.textContent='이용 중인 구독';view.price.textContent='구독 이용 중';view.after.textContent='구독 관리에서 다음 결제일을 확인해 주세요.';
  }
  status.textContent=r.status==='alreadyActive'?'이 매장에 이미 이용 중인 구독이 있어요.':r.status==='cancelled'?'구매를 취소했어요.':r.status==='pending'?'승인을 기다리고 있어요. 잠시 후 구매 복원을 눌러 주세요.':r.status==='empty'?'복원할 구매가 없어요.':r.results?.some(x=>testMode?x.testActive:x.active)?(testMode?'테스트 구매·서버 검증이 완료됐어요.':'Google Play 구매·서버 검증이 완료됐어요.'):(testMode?'구매 내역을 확인했어요. 현재 활성 테스트 구독은 없어요.':'구매 내역을 확인했어요. 현재 활성 구독은 없어요.');};
 const retry=button('요금·혜택 다시 확인',async()=>{closeSubscriptionSheet(sheet);openAndroidBilling({billing,getContext,document});},'link');retry.hidden=true;
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
  const data=await billing.products();if(!same()||purchaseBlocked)return;
  const offers=testOffers(data.products,info.productId);
  if (info.testOnly === true && data.ready !== false && Array.isArray(data.products)) {
   addOfferDiagnostics(view, data.products, info.productId, offers[0]);
  }
  status.textContent=subscriptionActive?(testMode?'이 매장의 테스트 구독을 이용 중이에요.':'이 매장의 구독을 이용 중이에요.'):offers.length?'다음 화면에서 Google Play 결제 조건을 확인해 주세요.':(testMode?'현재 구매 가능한 상품이 없어요. Play 설치 계정과 내부 테스트 참여 상태를 확인해 주세요.':'현재 구매 가능한 상품이 없어요. Google Play 계정을 확인해 주세요.');
  if(subscriptionActive){view.label.textContent='이용 중인 구독';view.price.textContent='구독 이용 중';view.after.textContent='구독 관리에서 다음 결제일을 확인해 주세요.';}
  else if(!offers.length){retry.hidden=false;}
  let startTrial=null;
  if(!subscriptionActive&&!purchaseBlocked)for(const offer of offers){
   if(offer.trialDays===60){
    const label=setSubscriptionOffer(view,offer);
    startTrial=async()=>{if(purchaseBlocked)return;status.textContent='Google Play 결제창을 열고 있어요…';show(await billing.purchase(offer));};
    const buy=button(testMode?label+' · 테스트 구매':label,startTrial);buy.dataset.purchase='true';purchaseButtons.push(buy);
   }else{
    // An absent eligible trial is not permission to silently charge immediately.
    setSubscriptionOffer(view,offer);
    view.label.textContent='현재 Google Play 계정에 제공된 요금';
    view.after.textContent='무료체험 미적용 · 오늘 9,900원 결제 · 매월 갱신';
    status.textContent='현재 Google Play 계정에는 60일 무료체험 상품이 제공되지 않았어요. 아래에서 무료체험 없는 구독 조건을 확인한 뒤 진행할 수 있어요.';
    retry.hidden=false;
    const paid=button('무료체험 없는 구독 요금 확인',()=>{
     if(subscriptionActive||purchaseBlocked)return;
     paid.hidden=true;retry.hidden=true;setSubscriptionOffer(view,offer);
     view.after.textContent='무료체험 미적용 · 오늘 9,900원 결제 · 매월 갱신';
     status.textContent='60일 무료체험 없이 오늘 9,900원을 결제하고 매월 갱신하는 조건이에요. 동의하시면 아래 버튼을 눌러 Google Play 결제창에서 최종 조건을 확인해 주세요.';
     const buy=button(testMode?'9,900원 테스트 결제 진행':'오늘 9,900원 결제하고 구독하기',async()=>{if(purchaseBlocked)return;status.textContent='Google Play 결제창을 열고 있어요…';show(await billing.purchase(offer));});
     buy.dataset.purchase='true';purchaseButtons.push(buy);view.actions.append(close);
    });purchaseButtons.push(paid);
   }
  }
  // Keep the primary action before close, with restoration in a quiet footer.
  view.actions.append(close);
  // Only the explicit status-sheet action may open Play directly, and only for
  // the eligible 60-day offer returned by Play. Paid-only offers require review.
  if(launchTrial&&startTrial)await execute(startTrial);

 }catch(e){if(same()&&!purchaseBlocked){status.textContent=e.message||'상품 연결을 확인하지 못했어요.';retry.hidden=false;}}})();
}
