export function createBillingClient({storeKit,request,getContext}) {
 let busy=false;
 const context=()=>{const c=getContext();if(!c?.userId||!c.storeId||c.role!=='storeOwner')throw Error('사장님 계정으로 로그인하고 매장을 선택해 주세요.');return c;};
 const unchanged=c=>{const next=context();if(next.userId!==c.userId||next.storeId!==c.storeId)throw Error('계정 또는 매장이 바뀌었어요. 다시 확인해 주세요.');};
 const saved=async(c,t)=>{
  unchanged(c);
  const result=await request(c,'ios-billing',{action:'verify',signedTransaction:t.signedTransaction,appAccountToken:t.appAccountToken,productId:t.productId});
  unchanged(c);
  if(!Array.isArray(result.subscriptions)||result.subscriptions.length!==1)throw Error('구매 내역을 확인하지 못했어요. 구매 복원을 눌러 주세요.');
  await storeKit.finish({transactionId:t.transactionId});return result;
 };
 const run=async task=>{if(busy)throw Error('처리 중이에요. 잠시 기다려 주세요.');busy=true;try{return await task(context());}finally{busy=false;}};
 const matching=(transactions,info)=>(transactions||[]).filter(t=>(info.bindings||[info]).some(b=>t.productId===(b.productId||'manee.store1.monthly')&&typeof t.appAccountToken==='string'&&t.appAccountToken.toLowerCase()===b.appAccountToken?.toLowerCase()));
 return {
  async status(){const c=context();const status=await request(c,'ios-billing',{action:'status'});unchanged(c);return status;},
  async products(productId='manee.store1.monthly'){return storeKit.products({productId});},
  purchase:()=>run(async c=>{
   const checkoutId=globalThis.crypto.randomUUID();
   const status=await request(c,'ios-billing',{action:'prepare',checkoutId});unchanged(c);
   const release=async()=>{if(status.checkoutId===checkoutId)try{await request(c,'ios-billing',{action:'release',checkoutId});}catch{/* Lease expires after ambiguous failures. */}};
   let playStarted=false;try{
   if(!status.ready)throw Error('구독 연결을 준비하고 있어요.');
   if(status.otherStoreSubscribed)throw Error('구독 연결을 확인하고 있어요. 잠시 후 다시 시도해 주세요.');
   if(status.subscriptions?.some(s=>s.active||s.testActive)){await release();return {...status,status:'alreadyActive'};}
   // Recover interrupted purchases before attempting a second charge.
   const pending=await storeKit.pending();unchanged(c);
   const relevant=matching(pending.transactions,status);
   if(relevant.length){
    let result;for(const t of relevant)result=await saved(c,t);
    await release();return {...result,status:'restored'};
   }
   if(pending.transactions?.some(t=>t.productId===(status.productId||'manee.store1.monthly')))throw Error('이 Apple 계정의 구독이 다른 매니 아이디에 연결되어 있어요. 처음 구독한 아이디에서 구매 복원을 눌러 주세요.');
   const product=await storeKit.products({productId:status.productId||'manee.store1.monthly'});unchanged(c);
   if(product.monthly!==true||product.priceApproved!==true)throw Error('월 구독 상품과 요금을 확인하고 있어요.');
   playStarted=true;
   const result=await storeKit.purchase({appAccountToken:status.appAccountToken,productId:status.productId||'manee.store1.monthly'});unchanged(c);
   if(result.status==='cancelled')await release();
   if(result.status!=='purchased')return result;
   const verified=await saved(c,result);await release();
   return {...verified,status:'purchased'};
   }catch(error){if(!playStarted)await release();throw error;}
  }),
  restore:()=>run(async c=>{
   const status=await request(c,'ios-billing',{action:'status'});unchanged(c);
   if(!status.appAccountToken)throw Error('구독 연결을 준비하고 있어요.');
   const restored=await storeKit.restore();unchanged(c);
   let result;for(const t of matching(restored.transactions,status))result=await saved(c,t);
   if(!result&&restored.transactions?.length)throw Error('이 아이디와 연결된 구매가 없어요. 처음 구독한 매니 계정에서 복원해 주세요.');
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
