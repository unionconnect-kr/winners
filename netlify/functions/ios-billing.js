const {response,preflight,authenticate,ownerContext,failure}=require('./lib/native-request.cjs');
const {configured,apple,verifyPurchase,currentRecord,entitlement}=require('./lib/apple-billing.cjs');
exports.handler=async event=>{
 const early=preflight(event);if(early)return early;
 try{
  let body;try{body=JSON.parse(event.body||'{}');}catch{throw Error('invalid_request');}
  if(!['status','verify','prepare'].includes(body.action))throw Error('invalid_request');
  const {user,service}=await authenticate(event);
  const context=await ownerContext(user,body.storeId);
  if(!configured())return response(200,{ready:false},event);
  const api=apple();
  // Explicit server feature gate remains off until sandbox and entitlement QA.
  const privacyUrl=process.env.IOS_PRIVACY_URL,termsUrl=process.env.IOS_TERMS_URL;
  const purchasesEnabled=process.env.IOS_PURCHASES_ENABLED==='true'&&[privacyUrl,termsUrl].every(url=>typeof url==='string'&&/^https:\/\/[^\s]+$/.test(url));
  if(body.action==='prepare'&&(!purchasesEnabled||context.otherStoreSubscribed)){
   if(context.otherStoreSubscribed)throw Error('other_store_subscribed');
   throw Error('billing_not_ready');
  }
  let records=[];
  if(body.action==='verify')records=[await verifyPurchase(api,body.signedTransaction,context.appAccountToken)];
  else{
   for(const s of context.subscriptions.filter(s=>s.environment===api.environment)){
    records.push(await currentRecord(api,s.originalId,context.appAccountToken));
   }
  }
  for(const record of records){
   const saved=await service.rpc('manee_ios_save_subscription',{p_record:record});
   if(saved.error||saved.data!==true)throw Error('save_failed');
  }
  // Recheck live access after the Apple round trip, before exposing account data.
  await ownerContext(user,body.storeId);
  return response(200,{ready:purchasesEnabled,privacyUrl,termsUrl,environment:api.environment,appAccountToken:context.appAccountToken,
   otherStoreSubscribed:context.otherStoreSubscribed,subscriptions:records.map(r=>entitlement(r))},event);
 }catch(error){return failure(error,event);}
};
