// Receipts never grant access on the client: only the server verifies, persists
// and acknowledges Google purchases. Prices and eligible offers come from Play.
export function createAndroidBillingClient({playBilling, request, getContext, allowPaid=false}) {
  let busy = false;
  const context = () => {
    const c = getContext();
    if (!c?.userId || !c.storeId || c.role !== 'storeOwner') throw Error('사장님 계정으로 매장을 선택해 주세요.');
    return {...c};
  };
  const unchanged = c => {
    const next = context();
    if (next.userId !== c.userId || next.storeId !== c.storeId) throw Error('계정 또는 매장이 바뀌었어요. 다시 확인해 주세요.');
  };
  const call = async (c, body) => {
    unchanged(c);
    const result = await request(c, 'android-billing', body);
    unchanged(c);
    return result;
  };
  const verify = async (c, purchases) => {
    const results = [];
    for (const purchase of purchases || []) {
      unchanged(c);
      if (purchase.state !== 'purchased') continue;
      if (!purchase.purchaseToken) throw Error('구매 내역을 확인하지 못했어요.');
      const result = await call(c, {action: 'verify', purchaseToken: purchase.purchaseToken});
      if (result.verified !== true) throw Error('구매 확인이 지연되고 있어요. 구매 복원을 눌러 주세요.');
      results.push(result);
    }
    return results;
  };
  const run = async task => {
    if (busy) throw Error('결제 처리 중이에요. 잠시 기다려 주세요.');
    busy = true;
    try { return await task(context()); } finally { busy = false; }
  };
  return {
    status: async () => {
      const info=await call(context(), {action:'status'});
      return !allowPaid && info.testOnly===false ? {...info,ready:false,reason:'app_update_required'} : info;
    },
    products: async () => {
      const c = context(), info = await call(c, {action: 'status'});
      if (!info.ready || !info.productId) return {ready: false, products: []};
      if(info.testOnly===false && !allowPaid)return {ready:false,products:[]};
      const result = await playBilling.products({productId: info.productId});
      unchanged(c);
      return result;
    },
    purchase: selection => run(async c => {
      const checkoutId=globalThis.crypto.randomUUID();
      const info = await call(c, {action: 'prepare',checkoutId});
      const claimed=info.testOnly===false && info.checkoutId===checkoutId;
      const release=async()=>{if(claimed)try{await call(c,{action:'release',checkoutId});}catch{/* Lease expires if the network is unavailable. */}};
      if(info.testOnly===false && !allowPaid){await release();throw Error('이 앱은 유료 결제를 지원하지 않아요. 앱을 업데이트해 주세요.');}
      if (!info.ready || !info.productId || !info.accountId || !info.profileId) throw Error('구독 연결을 준비하고 있어요.');
      if (info.active===true || (info.testOnly===true && info.testActive===true)){
        await release();
        return {status: 'alreadyActive',testActive:info.testOnly===true&&info.testActive===true};
      }
      if(info.testOnly===false && !claimed)throw Error('결제 연결을 다시 시도해 주세요.');
      let playStarted=false;
      try{
        const current = await playBilling.purchases();
        unchanged(c);
        const relevant = (current.purchases || []).filter(p => p.productIds?.includes(info.productId));
        if (relevant.length) {
          const results = await verify(c, relevant);
          if(results.length)await release();
          return {status: results.length ? 'restored' : 'pending', results};
        }
        if (selection?.productId !== info.productId || !selection.offerToken) throw Error('구독 요금을 다시 확인해 주세요.');
        playStarted=true;
        const purchased = await playBilling.purchase({productId: info.productId,
          offerToken: selection.offerToken, accountId: info.accountId, profileId: info.profileId});
        unchanged(c);
        if (purchased.status==='cancelled')await release();
        if (purchased.status !== 'purchased') return purchased;
        const results = await verify(c, purchased.purchases);
        if (!results.length) throw Error('구매 확인이 지연되고 있어요. 구매 복원을 눌러 주세요.');
        await release();
        return {status: 'purchased', results};
      }catch(error){if(!playStarted)await release();throw error;}
    }),
    restore: () => run(async c => {
      const info=await call(c,{action:'status'});
      if(info.testOnly===false && !allowPaid)throw Error('이 앱은 유료 결제를 지원하지 않아요. 앱을 업데이트해 주세요.');
      if(!info.ready || !info.productId)throw Error('이 매장의 구독 연결을 준비하고 있어요.');
      const current = await playBilling.purchases();
      unchanged(c);
      const relevant=(current.purchases||[]).filter(p=>p.productIds?.includes(info.productId));
      const results = await verify(c, relevant);
      return {status: results.length ? 'restored' : relevant.some(p => p.state === 'pending') ? 'pending' : 'empty', results};
    }),
    isBusy: () => busy,
  };
}
