export const purchaseAccountMessage='이 Apple 계정의 구독은 다른 매니 계정에 연결되어 있어요. 처음 구독한 매니 계정으로 로그인해 주세요. 현재 계정에는 구독이 적용되지 않았어요.';
const accountMismatch=()=>Object.assign(Error(purchaseAccountMessage),{code:'purchase_account_mismatch'});
export function createBillingClient({storeKit,request,getContext}) {
 let busy=false;
 const context=()=>{const c=getContext();if(!c?.userId||!c.storeId||c.role!=='storeOwner')throw Error('사장님 계정으로 로그인하고 매장을 선택해 주세요.');return {...c};};
 const unchanged=c=>{const next=context();if(next.userId!==c.userId||next.storeId!==c.storeId)throw Error('계정 또는 매장이 바뀌었어요. 다시 확인해 주세요.');};
 const saved=async(c,t)=>{
  unchanged(c);
  const result=await request(c,'ios-billing',{action:'verify',signedTransaction:t.signedTransaction,productId:t.productId,appAccountToken:t.appAccountToken});
  unchanged(c);
  if(!Array.isArray(result.subscriptions)||result.subscriptions.length!==1)throw Error('구매 내역을 확인하지 못했어요. 구매 복원을 눌러 주세요.');
  await storeKit.finish({transactionId:t.transactionId});return result;
 };
 const run=async task=>{if(busy)throw Error('처리 중이에요. 잠시 기다려 주세요.');busy=true;try{return await task(context());}finally{busy=false;}};
 const bindings=info=>info.billingScope==='account'&&Array.isArray(info.bindings)?info.bindings:[{productId:info.productId||'manee.store1.monthly',appAccountToken:info.appAccountToken}];
 const matching=(transactions,info)=>(transactions||[]).filter(t=>bindings(info).some(b=>t.productId===b.productId&&typeof t.appAccountToken==='string'&&t.appAccountToken.toLowerCase()===b.appAccountToken?.toLowerCase()));
 const hasActiveSubscription=info=>info.subscriptions?.some(s=>s.active||s.testActive);
 const foreignPurchase=(transactions,info)=>(transactions||[]).some(t=>t.productId===(info.productId||'manee.store1.monthly')&&!matching([t],info).length);
 return {
  async status(){
   const c=context();const status=await request(c,'ios-billing',{action:'status'});unchanged(c);
   if(status.ready&&status.appAccountToken&&!hasActiveSubscription(status)){
    const pending=await storeKit.pending();unchanged(c);
    if(foreignPurchase(pending.transactions,status))return {...status,accountConflict:true};
   }
   return status;
  },
  async products(productId='manee.store1.monthly'){return storeKit.products({productId});},
  manage:()=>run(async c=>{await storeKit.manageSubscriptions();unchanged(c);}),
  purchase:(selection)=>run(async c=>{
   const checkoutId=globalThis.crypto.randomUUID();
   const status=await request(c,'ios-billing',{action:'prepare',checkoutId});unchanged(c);
   const claimed=status.checkoutId===checkoutId;
   const release=async()=>{if(claimed)try{unchanged(c);await request(c,'ios-billing',{action:'release',checkoutId});}catch{/* Server lease expires after an interrupted session. */}};
   let storeStarted=false;
   try{
   if(status.otherPlatformActive)throw Error('이 계정은 다른 스토어에서 구독 중이에요. 기존 구독을 확인해 주세요.');
   if(!status.ready)throw Error('구독 연결을 준비하고 있어요.');
   if(status.otherStoreSubscribed)throw Error('다른 매장에서 이용 중인 구독이 있어요. 추가 매장 결제는 준비 중이에요.');
   if(hasActiveSubscription(status)){await release();return {...status,status:'alreadyActive'};}
   if(status.billingScope==='account'&&!claimed)throw Error('결제 연결을 다시 시도해 주세요.');
   // Recover interrupted purchases before attempting a second charge.
   const pending=await storeKit.pending();unchanged(c);
   const relevant=matching(pending.transactions,status);
   let restored;
   for(const transaction of relevant){
    const result=await saved(c,transaction);
    if(hasActiveSubscription(result))restored=result;
   }
   if(restored){await release();return {...restored,status:'restored'};}
   if(foreignPurchase(pending.transactions,status))throw accountMismatch();
   const product=await storeKit.products({productId:status.productId||'manee.store1.monthly'});unchanged(c);
   if(product.monthly!==true||product.priceApproved!==true)throw Error('월 구독 상품과 요금을 확인하고 있어요.');
   if(selection?.twoMonthsFree===true&&product.twoMonthsFree!==true)throw Error('무료체험 대상이 변경됐어요. 구독 화면을 닫고 요금·혜택을 다시 확인해 주세요.');
   if(selection?.price&&product.price!==selection.price)throw Error('구독 요금이 변경됐어요. 구독 화면을 닫고 다시 확인해 주세요.');
   storeStarted=true;
   const result=await storeKit.purchase({appAccountToken:status.appAccountToken,productId:status.productId||'manee.store1.monthly',twoMonthsFree:selection?.twoMonthsFree===true});unchanged(c);
   if(result.status==='cancelled')await release();
   if(result.status!=='purchased')return result;
   if(!matching([result],status).length)throw accountMismatch();
   const verified=await saved(c,result);await release();
   if(!hasActiveSubscription(verified))throw Error('Apple 구매 내역은 확인했지만 현재 계정의 활성 구독을 확인하지 못했어요. 다시 결제하지 말고 기존 구독 복원을 눌러 주세요.');
   return {...verified,status:'purchased'};
   }catch(error){if(!storeStarted||['storekit_not_started','purchase_account_mismatch'].includes(error?.code))await release();throw error;}
  }),
  restore:()=>run(async c=>{
   const status=await request(c,'ios-billing',{action:'status'});unchanged(c);
   if(!status.appAccountToken)throw Error('구독 연결을 준비하고 있어요.');
   const restored=await storeKit.restore();unchanged(c);
   let result;for(const t of matching(restored.transactions,status)){
    const next=await saved(c,t);if(!result||hasActiveSubscription(next)||!hasActiveSubscription(result))result=next;
   }
   if(!result&&restored.transactions?.length)throw accountMismatch();
   return result?{...result,status:'restored'}:{status:'empty'};
  }),
  sync:()=>run(async c=>{
   const status=await request(c,'ios-billing',{action:'status'});unchanged(c);
   if(!status.appAccountToken)return;
   const pending=await storeKit.pending();unchanged(c);
   for(const t of matching(pending.transactions,status))await saved(c,t);
  }),
  isBusy:()=>busy,
 };
}
