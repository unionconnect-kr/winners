const {response,preflight,authenticate,ownerContext,failure}=require('./lib/native-request.cjs');
const {configured,apple,verifyPurchase,currentRecord,entitlement}=require('./lib/apple-billing.cjs');
exports.handler=async event=>{
 const early=preflight(event);if(early)return early;
 try{
  let body;try{body=JSON.parse(event.body||'{}');}catch{throw Error('invalid_request');}
  if(!['status','verify','prepare'].includes(body.action))throw Error('invalid_request');
  const {user,service}=await authenticate(event);
  const context=await ownerContext(user,body.storeId);
  if(!configured())return response(200,{ready:false,appAccountToken:context.appAccountToken,
   productId:context.productId,subscriptions:[]},event);
  // Explicit server feature gate remains off until sandbox and entitlement QA.
  const privacyUrl=process.env.IOS_PRIVACY_URL,termsUrl=process.env.IOS_TERMS_URL;
  const purchasesEnabled=process.env.IOS_PURCHASES_ENABLED==='true'&&context.catalogEnabled===true&&[privacyUrl,termsUrl].every(url=>typeof url==='string'&&/^https:\/\/[^\s]+$/.test(url));
  if(body.action==='prepare'&&(!purchasesEnabled||context.otherStoreSubscribed)){
   if(context.otherStoreSubscribed)throw Error('other_store_subscribed');
   throw Error('billing_not_ready');
  }
  if(body.action==='prepare'&&context.otherPlatformActive)throw Error('other_platform_subscribed');
  let records=[];
  if(body.action==='verify'){
   if(!context.productId)throw Error('billing_not_ready');
   // TestFlight signs Sandbox transactions. Both paths still use Apple's
   // cryptographic verifier and fresh server status, never unverified JWS claims.
   let mismatch;
   for(const environment of ['Production','Sandbox']){
    try{records=[await verifyPurchase(apple(process.env,environment),body.signedTransaction,context.appAccountToken,context.productId)];break;}
    catch(error){mismatch=error;}
   }
   if(!records.length)throw mismatch;
  }
  else{
   for(const s of context.subscriptions){
    records.push(await currentRecord(apple(process.env,s.environment),s.originalId,context.appAccountToken,s.productId||context.productId));
   }
  }
  for(const record of records){
   const saved=await service.rpc('manee_ios_save_subscription',{p_record:record});
   if(saved.error||saved.data!==true)throw Error('save_failed');
  }
  // Recheck live access after the Apple round trip, before exposing account data.
  await ownerContext(user,body.storeId);
  return response(200,{ready:purchasesEnabled&&!context.otherPlatformActive,privacyUrl,termsUrl,productId:context.productId,appAccountToken:context.appAccountToken,
   otherPlatformActive:context.otherPlatformActive===true,
   otherStoreSubscribed:context.otherStoreSubscribed,subscriptions:records.map(r=>entitlement(r))},event);
 }catch(error){return failure(error,event);}
};
