const {response,preflight,authenticate,ownerContext,failure}=require('./lib/native-request.cjs');
const {configured,apple,verifyPurchase,currentRecord,entitlement}=require('./lib/apple-billing.cjs');
const {checkoutPolicy}=require('./lib/ios-checkout.cjs');
const {randomUUID}=require('node:crypto');
const UUID=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
exports.handler=async event=>{
 const early=preflight(event);if(early)return early;
 try{
  let body;try{body=JSON.parse(event.body||'{}');}catch{throw Error('invalid_request');}
  if(!['status','verify','prepare','release'].includes(body.action))throw Error('invalid_request');
  const {user,service}=await authenticate(event);
  const context=await ownerContext(user,body.storeId);
  if(body.action==='release'){
   if(!UUID.test(body.checkoutId||''))throw Error('invalid_request');
   const released=await user.rpc('manee_account_billing_checkout_release',{p_store_id:body.storeId,p_provider:'ios',p_checkout_id:body.checkoutId});
   if(released.error)throw Error('billing_not_ready');
   return response(200,{released:released.data===true},event);
  }
  if(!configured())return response(200,{ready:false,appAccountToken:context.appAccountToken,
   productId:context.productId,subscriptions:[]},event);
  // Keep the existing public release and bounded TestFlight pilot gates.
  const privacyUrl=process.env.IOS_PRIVACY_URL,termsUrl=process.env.IOS_TERMS_URL;
  const policy=checkoutPolicy(body.storeId,context),purchasesEnabled=policy.enabled;
  if(body.action==='prepare'&&(!purchasesEnabled||context.otherStoreSubscribed)){
   if(context.otherStoreSubscribed)throw Error('other_store_subscribed');
   throw Error('billing_not_ready');
  }
  if(body.action==='prepare'&&context.otherPlatformActive)throw Error('other_platform_subscribed');
  let records=[];
  if(body.action==='verify'){
   if(!context.productId)throw Error('billing_not_ready');
   if(policy.sandboxOnly&&!purchasesEnabled)throw Error('billing_not_ready');
   // Candidate bindings belong to this authenticated account. Each candidate
   // still goes through Apple's signature, token, product and current-status checks.
   const bindings=context.bindings||[{appAccountToken:context.appAccountToken,productId:context.productId}];
   const candidates=bindings.filter(b=>(!body.appAccountToken||b.appAccountToken.toLowerCase()===body.appAccountToken.toLowerCase())&&(!body.productId||b.productId===body.productId));
   if(!candidates.length)throw Error('purchase_mismatch');
   let mismatch;
   outer:for(const b of candidates){
    for(const environment of policy.sandboxOnly?['Sandbox']:['Production','Sandbox']){
     try{records=[await verifyPurchase(apple(process.env,environment),body.signedTransaction,b.appAccountToken,b.productId)];break outer;}
     catch(error){mismatch=error;}
    }
   }
   if(!records.length)throw mismatch;

  }
  else{
   for(const s of context.subscriptions){
    records.push(await currentRecord(apple(process.env,s.environment),s.originalId,s.appAccountToken||context.appAccountToken,s.productId||context.productId));
   }
  }
  for(const record of records){
   const saved=await service.rpc('manee_ios_save_subscription',{p_record:record});
   if(saved.error||saved.data!==true)throw Error('save_failed');
  }
  // Recheck live access after the Apple round trip, before exposing account data.
  await ownerContext(user,body.storeId);
  let checkout={};
  if(body.action==='prepare'&&!records.some(r=>{const e=entitlement(r);return e.active||e.testActive;})){
   const checkoutId=body.checkoutId||randomUUID();if(!UUID.test(checkoutId))throw Error('invalid_request');
   const claimed=await user.rpc('manee_account_billing_checkout_claim',{p_store_id:body.storeId,p_provider:'ios',p_product_id:context.productId,p_checkout_id:checkoutId});
   if(claimed.error||!['claimed','active','in_progress'].includes(claimed.data?.status))throw Error('billing_not_ready');
   if(claimed.data.status==='in_progress')throw Error('checkout_in_progress');
   if(claimed.data.status==='active')throw Error('other_platform_subscribed');
   checkout={checkoutId};
  }
  return response(200,{...checkout,billingScope:'account',bindings:context.bindings,ready:purchasesEnabled&&!context.otherPlatformActive,privacyUrl,termsUrl,productId:context.productId,appAccountToken:context.appAccountToken,
   otherPlatformActive:context.otherPlatformActive===true,
   otherStoreSubscribed:context.otherStoreSubscribed,subscriptions:records.map(r=>entitlement(r))},event);
 }catch(error){return failure(error,event);}
};
