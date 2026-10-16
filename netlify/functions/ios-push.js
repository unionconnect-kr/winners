const {response,preflight,authenticate,pushContext,failure}=require('./lib/native-request.cjs');
const {configured,sendNativePush}=require('./lib/native-push.cjs');
exports.handler=async event=>{
 const early=preflight(event);if(early)return early;
 try{
  let body;try{body=JSON.parse(event.body||'{}');}catch{throw Error('invalid_request');}
  if(!['status','test'].includes(body.action))throw Error('invalid_request');
  const {user,service,userId}=await authenticate(event);
  await pushContext(user,body.storeId);
  if(!configured())return response(200,{ready:false},event);
  if(body.action==='status')return response(200,{ready:true},event);
  // Only the authenticated account's devices (owner or linked staff). Never accept targetUserId or message
  // from the caller, nor extend the legacy unauthenticated web-push endpoint.
  const result=await sendNativePush(service,{storeId:body.storeId,userId,kind:'test'});
  return response(200,result,event);
 }catch(error){return failure(error,event);}
};
