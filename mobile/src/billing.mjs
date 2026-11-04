export function createBillingClient({storeKit,request,getContext}) {
 let busy=false;
 const context=()=>{const c=getContext();if(!c?.userId||!c.storeId)throw Error('다시 로그인하고 매장을 선택해 주세요.');return c;};
 const unchanged=c=>{const next=context();if(next.userId!==c.userId||next.storeId!==c.storeId)throw Error('계정 또는 매장이 바뀌었어요. 다시 확인해 주세요.');};
 const saved=async(c,t)=>{
  unchanged(c);
  const result=await request(c,'ios-billing',{action:'verify',signedTransaction:t.signedTransaction});
  unchanged(c);
  if(!Array.isArray(result.subscriptions)||result.subscriptions.length!==1)throw Error('구매 내역을 확인하지 못했어요. 구매 복원을 눌러 주세요.');
  await storeKit.finish({transactionId:t.transactionId});return result;
 };
 const run=async task=>{if(busy)throw Error('처리 중이에요. 잠시 기다려 주세요.');busy=true;try{return await task(context());}finally{busy=false;}};
 return {
  async status(){const c=context();const status=await request(c,'ios-billing',{action:'status'});unchanged(c);return status;},
  async products(){return storeKit.products();},
  purchase:()=>run(async c=>{
   const status=await request(c,'ios-billing',{action:'prepare'});unchanged(c);
   if(!status.ready)throw Error('구독 연결을 준비하고 있어요.');
   if(status.otherStoreSubscribed)throw Error('다른 매장에서 이용 중인 구독이 있어요. 추가 매장 결제는 준비 중이에요.');
   if(status.subscriptions?.some(s=>s.active||s.testActive))return {...status,status:'alreadyActive'};
   // Recover interrupted purchases before attempting a second charge.
   const pending=await storeKit.pending();unchanged(c);
   if(pending.transactions?.length){
    let result;for(const t of pending.transactions)result=await saved(c,t);
    return {...result,status:'restored'};
   }
   const result=await storeKit.purchase({appAccountToken:status.appAccountToken});unchanged(c);
   if(result.status!=='purchased')return result;
   return {...await saved(c,result),status:'purchased'};
  }),
  restore:()=>run(async c=>{
   const status=await request(c,'ios-billing',{action:'status'});unchanged(c);
   if(!status.appAccountToken)throw Error('구독 연결을 준비하고 있어요.');
   const restored=await storeKit.restore();unchanged(c);
   let result;for(const t of restored.transactions||[])result=await saved(c,t);
   return result?{...result,status:'restored'}:{status:'empty'};
  }),
  sync:()=>run(async c=>{
   const pending=await storeKit.pending();unchanged(c);
   for(const t of pending.transactions||[])await saved(c,t);
  }),
  isBusy:()=>busy,
 };
}
