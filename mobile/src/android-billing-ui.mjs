// Only offers returned as eligible by Google Play are shown. Never invent prices.
export function testOffers(products,productId='manee.store1.monthly') {
 if(!/^manee\.store[1-9][0-9]*\.monthly$/.test(productId))return [];
 const product=products?.find(p=>p.productId===productId);
 const offers=(product?.offers||[]).filter(o=>o.basePlanId==='monthly' && o.offerToken &&
  (o.offerId==='trial-1month' ? o.phases?.length===2 &&
    Number(o.phases[0].amountMicros)===0 && o.phases[0].period==='P1M' &&
    o.phases[0].cycles===1 && o.phases[0].recurrenceMode===2 :
    !o.offerId && o.phases?.length===1) &&
  o.phases.every(p=>p.currency==='KRW') &&
  o.phases.at(-1).period==='P1M' && o.phases.at(-1).recurrenceMode===1 &&
  Number(o.phases.at(-1).amountMicros)===9900000000
 );
 const trial=offers.find(o=>o.offerId==='trial-1month');
 return (trial?[trial]:offers).map(o=>({productId:product.productId,offerToken:o.offerToken,
  label:o.phases.map(p=>`${Number(p.amountMicros)===0?'무료':p.price} (${p.period==='P1M'?'1개월':p.period})`).join(' → ')}));
}
export function openAndroidBilling({billing,getContext,document}) {
 if(document.getElementById('manee-android-billing'))return;
 const c=getContext();if(c?.role!=='storeOwner')return;
 const sheet=document.createElement('dialog');sheet.id='manee-android-billing';
 sheet.style.cssText='border:0;border-radius:20px;padding:24px;width:90%;max-width:420px;max-height:85vh;overflow:auto;color:#18352a';
 const add=(tag,text)=>{const el=document.createElement(tag);el.textContent=text;sheet.append(el);return el;};
 const same=()=>{const n=getContext();return sheet.isConnected&&n?.userId===c.userId&&n?.storeId===c.storeId;};
 const heading=add('h2','Google Play 구독 확인');add('p',c.storeName||'선택한 매장');
 const explanation=add('p','결제 가능 여부를 확인하고 있어요.');
 const status=add('p','테스트 권한과 상품을 확인하고 있어요…');status.setAttribute('role','status');
 let busy=false,subscriptionActive=false;const buttons=[],purchaseButtons=[];
 const button=(label,fn)=>{const el=add('button',label);el.type='button';el.style.cssText='width:100%;padding:13px;margin:8px 0';buttons.push(el);
 el.onclick=async()=>{if(busy)return;busy=true;buttons.forEach(b=>b.disabled=true);try{
  if(!same())throw Error('계정 또는 매장을 다시 선택해 주세요.');await fn();
 }catch(e){if(sheet.isConnected)status.textContent=e.message||'연결을 확인해 주세요.';}finally{busy=false;buttons.forEach(b=>b.disabled=false);}};return el;};
 let testMode=true;
 const show=r=>{if(!same())return;
  if(r.status==='alreadyActive'||r.results?.some(x=>x.active===true||(testMode&&x.testActive===true))){
   subscriptionActive=true;purchaseButtons.forEach(b=>b.hidden=true);
  }
  status.textContent=r.status==='alreadyActive'?'이 매장에 이미 이용 중인 구독이 있어요.':r.status==='cancelled'?'구매를 취소했어요.':r.status==='pending'?'승인을 기다리고 있어요. 잠시 후 구매 복원을 눌러 주세요.':r.status==='empty'?'복원할 구매가 없어요.':r.results?.some(x=>testMode?x.testActive:x.active)?(testMode?'테스트 구매·서버 검증이 완료됐어요.':'Google Play 구매·서버 검증이 완료됐어요.'):(testMode?'구매 내역을 확인했어요. 현재 활성 테스트 구독은 없어요.':'구매 내역을 확인했어요. 현재 활성 구독은 없어요.');};
 button('닫기',()=>sheet.close());
 sheet.addEventListener('cancel',e=>{if(busy)e.preventDefault();});sheet.addEventListener('close',()=>sheet.remove(),{once:true});
 document.body.append(sheet);sheet.showModal();
 void(async()=>{try{
  const info=await billing.status();if(!same())return;
  if(info.ready!==true||typeof info.testOnly!=='boolean'){status.textContent=info.reason==='app_update_required'?'유료 결제를 사용하려면 앱을 업데이트해 주세요.':info.reason==='additional_store_not_ready'?'추가 매장 구독 상품을 준비하고 있어요. 기존 매장의 구독은 유지됩니다.':'이 계정·매장은 구독 대상으로 등록되지 않았거나 상품 연결이 준비되지 않았어요.';return;}
  testMode=info.testOnly;
  heading.textContent=testMode?'Google Play 결제 테스트':'매장 이용권 구독';
  explanation.textContent=testMode?'Play 스토어의 라이선스 테스트 계정으로 진행해 주세요. Google 결제창에 “테스트 카드”가 표시될 때만 구매를 완료하세요. 일반 카드가 보이면 취소해 주세요.':'구독은 매월 자동 갱신됩니다. 1개월 무료 체험이 표시되면 체험 종료 후 월 9,900원이 청구됩니다. Google Play 결제창에서 요금과 청구 시작일을 확인해 주세요. 취소는 Play 스토어 구독 관리에서 할 수 있습니다. 이용 기간이 끝나면 출퇴근을 포함한 업무 입력·수정이 제한됩니다. 기존 기록 조회와 구독 복원은 가능합니다.';
  subscriptionActive=info.active===true||(testMode&&info.testActive===true);
  button('구매 복원',async()=>show(await billing.restore()));
  const data=await billing.products();if(!same())return;
  const offers=testOffers(data.products,info.productId);
  status.textContent=subscriptionActive?(testMode?'이 매장의 테스트 구독을 이용 중이에요.':'이 매장의 구독을 이용 중이에요.'):offers.length?'아래 상품을 선택하면 Google Play 결제창이 열립니다.':(testMode?'현재 구매 가능한 상품이 없어요. Play 설치 계정과 내부 테스트 참여 상태를 확인해 주세요.':'현재 구매 가능한 상품이 없어요. Google Play 계정을 확인해 주세요.');
  if(!subscriptionActive)for(const offer of offers)purchaseButtons.push(button(offer.label+(testMode?' · 테스트 구매':' · 구독 시작'),async()=>show(await billing.purchase(offer))));
 }catch(e){if(same())status.textContent=e.message||'상품 연결을 확인하지 못했어요.';}})();
}
