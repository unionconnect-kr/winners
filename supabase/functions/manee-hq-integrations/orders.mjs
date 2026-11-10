const ORDER=/^GPA\.\d{4}-\d{4}-\d{4}-\d{5}(?:\.\.\d+)?$/;
export const validOrder=id=>typeof id==='string'&&id.length<=128&&ORDER.test(id);
const billion=1000000000n;
export function money(value){
 if(!value||!/^[A-Z]{3}$/.test(value.currencyCode||'')||!/^\d{1,15}$/.test(String(value.units??'0'))||!Number.isInteger(value.nanos??0)||(value.nanos??0)<0||(value.nanos??0)>=1e9)throw Error('invalid_money');
 return {currency:value.currencyCode,nanos:BigInt(value.units??0)*billion+BigInt(value.nanos??0)};
}
const decimal=n=>(n/billion).toString()+'.'+(n%billion).toString().padStart(9,'0');
export function orderRecord(order,job,id){
 if(!validOrder(id)||order?.orderId!==id||order.purchaseToken!==job.purchaseToken||!Array.isArray(order.lineItems)||order.lineItems.length!==1||order.lineItems[0].productId!==job.productId)throw Error('order_mismatch');
 const statuses={PENDING:'pending',PROCESSED:'paid',CANCELED:'canceled',PENDING_REFUND:'refund_pending',PARTIALLY_REFUNDED:'partial_refund',REFUNDED:'refunded'};
 if(!statuses[order.state])throw Error('order_mismatch');
 const total=money(order.total),history=order.orderHistory||{};
 const partials=history.partialRefundEvents||[];
 if(!Array.isArray(partials))throw Error('order_mismatch');
 let refunded=0n,refundAt=null,refundKnown=true;
 for(const event of partials){
  if(event.state!=='PROCESSED_SUCCESSFULLY')continue;
  const m=money(event.refundDetails?.total);if(m.currency!==total.currency)throw Error('currency_mismatch');
  refunded+=m.nanos;
  if(!Number.isFinite(Date.parse(event.processTime)))throw Error('order_mismatch');
  if(!refundAt||event.processTime>refundAt)refundAt=event.processTime;
 }
 if(history.refundEvent){
  const m=money(history.refundEvent.refundDetails?.total);if(m.currency!==total.currency)throw Error('currency_mismatch');
  refunded+=m.nanos;refundAt=history.refundEvent.eventTime;
 }
 if(['REFUNDED','PARTIALLY_REFUNDED'].includes(order.state)&&!history.refundEvent&&!partials.some(x=>x.state==='PROCESSED_SUCCESSFULLY'))refundKnown=false;
 if(refunded>total.nanos)throw Error('invalid_refund');
 const purchasedAt=history.processedEvent?.eventTime||order.createTime,updatedAt=order.lastEventTime||order.createTime;
 if(!Number.isFinite(Date.parse(purchasedAt))||!Number.isFinite(Date.parse(updatedAt))||refundAt&&!Number.isFinite(Date.parse(refundAt)))throw Error('order_mismatch');
 return {provider:'google',environment:job.environment,transactionId:id,binding:job.purchaseToken,productId:job.productId,
  currency:total.currency,amount:decimal(total.nanos),refundAmount:refundKnown?decimal(refunded):null,status:statuses[order.state],purchasedAt,updatedAt,refundAt};
}
export function createHandler({client,api,binding,verifiedRecord}){
 return async req=>{
  const reply=(status,data)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
  if(req.method!=='POST')return reply(405,{error:'method_not_allowed'});
  const dispatch=/^Bearer ([a-f0-9]{64})$/.exec(req.headers.get('authorization')||'')?.[1];
  if(!dispatch)return reply(401,{error:'authentication_required'});
  const claimed=await client.rpc('hq_billing_sync_claim',{p_dispatch_token:dispatch});
  if(claimed.error)return reply(claimed.error.code==='42501'?403:503,{error:'claim_failed'});
  if(!Array.isArray(claimed.data)||claimed.data.length>10)return reply(503,{error:'claim_failed'});
  let succeeded=0,failed=0,records=0;
  for(const job of claimed.data){
   let result='unavailable';
   try{
    if(!api)throw Error('not_ready');
    const subscription=await api.get(job.purchaseToken);
    const verified=verifiedRecord(subscription,{...binding(job.userId,job.storeId),purchaseToken:job.purchaseToken,productId:job.productId,basePlanId:'monthly'});
    if(verified.environment!==job.environment)throw Error('order_mismatch');
    const latest=subscription.lineItems?.[0]?.latestSuccessfulOrderId||subscription.latestOrderId;
    const ids=[...new Set([latest,...(job.orders||[])].filter(validOrder))].slice(0,11);
    for(const id of ids){
     const record=orderRecord(await api.order(id),job,id);
     const saved=await client.rpc('manee_hq_record_transaction',{p_record:record});
     if(saved.error||saved.data!==true)throw Error('save_failed');records++;
    }
    result=ids.length?'ok':'no_order';succeeded++;
   }catch(e){result=e?.httpStatus===403?'permission_denied':e?.message==='order_mismatch'?'mismatch':'unavailable';failed++;}
   const finished=await client.rpc('hq_billing_sync_finish',{p_token:job.purchaseToken,p_result:result});
   if(finished.error)failed++;
  }
  // Raw order payloads, buyer addresses, tokens, user IDs and provider errors never leave the worker.
  return reply(200,{accounts:claimed.data.length,succeeded,failed,records});
 };
}
