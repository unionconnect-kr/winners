'use strict';
const {SignedDataVerifier,AppStoreServerAPIClient,Environment}=require('@apple/app-store-server-library');
const root=require('./apple-root.cjs');
const PRODUCT='manee.store1.monthly',BUNDLE='kr.co.manee.app';
const PRODUCTS=new Set(Array.from({length:10},(_,i)=>`manee.store${i+1}.monthly`));
function configured(env=process.env){return ['APPLE_IAP_KEY_ID','APPLE_IAP_ISSUER_ID','APPLE_IAP_PRIVATE_KEY'].every(k=>!!env[k])&&['Production','Sandbox'].includes(env.APPLE_IAP_ENVIRONMENT);}
function apple(env=process.env,selectedEnvironment=env.APPLE_IAP_ENVIRONMENT){
 if(!configured(env))throw Error('billing_not_ready');
 if(!['Production','Sandbox'].includes(selectedEnvironment))throw Error('billing_not_ready');
 const environment=selectedEnvironment=== 'Production'?Environment.PRODUCTION:Environment.SANDBOX;
 return {environment,verifier:new SignedDataVerifier([root],true,environment,BUNDLE,6820833544),
  client:new AppStoreServerAPIClient(env.APPLE_IAP_PRIVATE_KEY.replace(/\\n/g,'\n'),env.APPLE_IAP_KEY_ID,env.APPLE_IAP_ISSUER_ID,BUNDLE,environment)};
}
function validateTransaction(t,environment,token,productId=PRODUCT){
 if(!PRODUCTS.has(productId)||t.bundleId!==BUNDLE||t.productId!==productId||t.environment!==environment||t.type!=='Auto-Renewable Subscription'
  ||t.inAppOwnershipType!=='PURCHASED'||t.quantity!==1||!/^\d{1,30}$/.test(t.originalTransactionId||'')
  ||!/^\d{1,30}$/.test(t.transactionId||'')||!Number.isSafeInteger(t.expiresDate)||!Number.isSafeInteger(t.signedDate)
  ||!/^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.test(t.appAccountToken||'')
  ||(token&&t.appAccountToken.toLowerCase()!==token.toLowerCase()))throw Error('purchase_mismatch');
 return t;
}
// Device JWS establishes identity only. A fresh server lookup decides entitlement,
// so replaying a pre-refund receipt cannot reactivate a refunded subscription.
async function currentRecord(api,originalId,token,productId=PRODUCT){
 const response=await api.client.getAllSubscriptionStatuses(originalId);
 if(response.bundleId!==BUNDLE||response.environment!==api.environment)throw Error('purchase_mismatch');
 const candidates=(response.data||[]).flatMap(g=>g.lastTransactions||[]).filter(t=>t.originalTransactionId===originalId);
 if(candidates.length!==1)throw Error('subscription_unavailable');
 const item=candidates[0];
 if(![1,2,3,4,5].includes(item.status))throw Error('subscription_unavailable');
 const t=validateTransaction(await api.verifier.verifyAndDecodeTransaction(item.signedTransactionInfo),api.environment,token,productId);
 if(t.originalTransactionId!==originalId)throw Error('purchase_mismatch');
 let expiry=t.expiresDate;
 if(item.status===4){
  const r=await api.verifier.verifyAndDecodeRenewalInfo(item.signedRenewalInfo);
  if(r.originalTransactionId!==originalId||r.productId!==productId||r.environment!==api.environment||!Number.isSafeInteger(r.gracePeriodExpiresDate))throw Error('purchase_mismatch');
  expiry=r.gracePeriodExpiresDate;
 }
 return {productId,environment:api.environment,originalId,transactionId:t.transactionId,
  token:t.appAccountToken.toLowerCase(),status:item.status,expiresAt:new Date(expiry).toISOString(),
  revoked:!!t.revocationDate||item.status===5,signedAt:new Date(t.signedDate).toISOString()};
}
async function verifyPurchase(api,signed,token,productId=PRODUCT){
 if(typeof signed!=='string'||signed.length>50000)throw Error('invalid_request');
 const t=validateTransaction(await api.verifier.verifyAndDecodeTransaction(signed),api.environment,token,productId);
 return currentRecord(api,t.originalTransactionId,token,productId);
}
function entitlement(record,now=Date.now()){
 return {active:record.environment==='Production'&&[1,4].includes(record.status)&&!record.revoked&&Date.parse(record.expiresAt)>now,
  testActive:record.environment==='Sandbox'&&[1,4].includes(record.status)&&!record.revoked&&Date.parse(record.expiresAt)>now,
  environment:record.environment,expiresAt:record.expiresAt,status:record.status};
}
module.exports={PRODUCTS,configured,apple,validateTransaction,currentRecord,verifyPurchase,entitlement};
