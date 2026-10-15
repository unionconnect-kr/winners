const {createClient}=require('@supabase/supabase-js');
const {PRODUCTS,apple,currentRecord}=require('./lib/apple-billing.cjs');
const {response,preflight,failure}=require('./lib/native-request.cjs');
exports.handler=async event=>{
 const early=preflight(event);if(early)return early;
 try{
  let body;try{body=JSON.parse(event.body||'{}');}catch{throw Error('invalid_request');}
  if(typeof body.signedPayload!=='string'||body.signedPayload.length>60000)throw Error('invalid_request');
  let api,notification;
  for(const environment of ['Production','Sandbox']){
   try{const candidate=apple(process.env,environment);notification=await candidate.verifier.verifyAndDecodeNotification(body.signedPayload);api=candidate;break;}catch{}
  }
  if(!notification||!api)throw Error('purchase_mismatch');
  if(notification.notificationType==='TEST')return response(200,{received:true},event);
  const signed=notification.data?.signedTransactionInfo;
  if(!signed)return response(200,{received:true,ignored:true},event);
  const t=await api.verifier.verifyAndDecodeTransaction(signed);
  if(!PRODUCTS.has(t.productId))return response(200,{received:true,ignored:true},event);
  const record=await currentRecord(api,t.originalTransactionId,t.appAccountToken,t.productId);
  const db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const saved=await db.rpc('manee_ios_save_subscription',{p_record:record});
  if(saved.error||saved.data!==true)throw Error('save_failed');
  return response(200,{received:true},event);
 }catch(error){return failure(error,event);}
};
