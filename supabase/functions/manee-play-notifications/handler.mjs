export function createNotificationHandler({authenticate,client,subscription}) {
 return async request=>{
  const reply=(status,data)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
  if(request.method!=='POST')return reply(405,{error:'method_not_allowed'});
  const token=/^Bearer ([A-Za-z0-9_.-]+)$/.exec(request.headers.get('authorization')||'')?.[1];
  if(!token||token.length>8192)return reply(401,{error:'unauthorized'});
  try{if(await authenticate(token)!==true)throw Error();}catch{return reply(401,{error:'unauthorized'});}
  let body,event;
  try{
   const raw=await request.text();if(raw.length>20000)throw Error();body=JSON.parse(raw);
   if(body.subscription!==subscription||!/^\d{1,200}$/.test(body.message?.messageId||'')||typeof body.message?.data!=='string'||body.message.data.length>12000)throw Error();
   event=JSON.parse(atob(body.message.data));
   if(event.packageName!=='kr.co.manee.app')throw Error();
   if(event.testNotification)return reply(200,{received:true,test:true});
   const purchaseToken=event.subscriptionNotification?.purchaseToken||event.voidedPurchaseNotification?.purchaseToken;
   if(typeof purchaseToken!=='string'||purchaseToken.length<1||purchaseToken.length>4096||/[\s\x00-\x1f\x7f]/.test(purchaseToken))throw Error();
   // Notification types and event timestamps never directly change entitlement.
   const queued=await client.rpc('manee_billing_enqueue',{p_message_id:body.message.messageId,p_token:purchaseToken});
   if(queued.error||queued.data!==true)return reply(503,{error:'enqueue_failed'});
   return reply(200,{received:true});
  }catch{return reply(400,{error:'invalid_notification'});}
 };
}
