const {createClient}=require('@supabase/supabase-js');
const {apple,currentRecord}=require('./lib/apple-billing.cjs');
const {response,preflight,failure}=require('./lib/native-request.cjs');
exports.handler=async event=>{
 const early=preflight(event);if(early)return early;
 try{
  let body;try{body=JSON.parse(event.body||'{}');}catch{throw Error('invalid_request');}
  if(typeof body.signedPayload!=='string'||body.signedPayload.length>60000)throw Error('invalid_request');
  const api=apple();
  const notification=await api.verifier.verifyAndDecodeNotification(body.signedPayload);
  if(notification.notificationType==='TEST')return response(200,{received:true},event);
  const signed=notification.data?.signedTransactionInfo;
  if(!signed)return response(200,{received:true,ignored:true},event);
  const t=await api.verifier.verifyAndDecodeTransaction(signed);
  if(t.productId!=='manee.store1.monthly')return response(200,{received:true,ignored:true},event);
  const record=await currentRecord(api,t.originalTransactionId,t.appAccountToken);
  const db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const saved=await db.rpc('manee_ios_save_subscription',{p_record:record});
  if(saved.error||saved.data!==true)throw Error('save_failed');
  return response(200,{received:true},event);
 }catch(error){return failure(error,event);}
};
