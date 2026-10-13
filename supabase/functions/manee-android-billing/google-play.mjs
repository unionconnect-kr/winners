// Generated from netlify/functions/lib/google-play-billing.cjs; keep parity test passing.
import {createHash,createPrivateKey,sign} from 'node:crypto';
const PACKAGE='kr.co.manee.app';
const GOOGLE='https://androidpublisher.googleapis.com/androidpublisher/v3/applications/'+PACKAGE;
const TOKEN_URL='https://oauth2.googleapis.com/token';
const STATES=new Set(['SUBSCRIPTION_STATE_PENDING','SUBSCRIPTION_STATE_ACTIVE','SUBSCRIPTION_STATE_PAUSED',
 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD','SUBSCRIPTION_STATE_ON_HOLD','SUBSCRIPTION_STATE_CANCELED',
 'SUBSCRIPTION_STATE_EXPIRED','SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED']);
const ACCESS=new Set(['SUBSCRIPTION_STATE_ACTIVE','SUBSCRIPTION_STATE_IN_GRACE_PERIOD','SUBSCRIPTION_STATE_CANCELED']);
function binding(userId,storeId) {
 const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
 if(!uuid.test(userId||'')||!uuid.test(storeId||''))throw Error('invalid_request');
 const hash=value=>createHash('sha256').update(PACKAGE+':'+value).digest('hex');
 return {accountId:hash('user:'+userId.toLowerCase()),profileId:hash('store:'+userId.toLowerCase()+':'+storeId.toLowerCase())};
}
function validToken(token){return typeof token==='string'&&token.length>0&&token.length<=4096&&!/[\s\x00-\x1f\x7f]/.test(token);}
function createGooglePlayApi({credentials,fetcher=fetch,now=Date.now}) {
 if(!credentials?.client_email?.endsWith('.iam.gserviceaccount.com')||!credentials.private_key)throw Error('billing_not_ready');
 const key=createPrivateKey(credentials.private_key);
 if(key.asymmetricKeyType!=='rsa')throw Error('billing_not_ready');
 let accessToken=null,expires=0,pending=null;
 async function bearer(){
  if(accessToken&&expires>now()+60000)return accessToken;
  if(pending)return pending;
  pending=(async()=>{
   const encode=v=>Buffer.from(JSON.stringify(v)).toString('base64url');
   const seconds=Math.floor(now()/1000);
   const unsigned=encode({alg:'RS256',typ:'JWT'})+'.'+encode({iss:credentials.client_email,
    scope:'https://www.googleapis.com/auth/androidpublisher',aud:TOKEN_URL,iat:seconds,exp:seconds+3600});
   const assertion=unsigned+'.'+sign('RSA-SHA256',Buffer.from(unsigned),key).toString('base64url');
   const response=await fetcher(TOKEN_URL,{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),
    headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion})});
   if(!response.ok)throw Error('billing_not_ready');
   const data=await response.json();
   if(typeof data.access_token!=='string'||!Number.isFinite(data.expires_in)||data.expires_in<=60)throw Error('billing_not_ready');
   accessToken=data.access_token;expires=now()+Math.min(data.expires_in,3600)*1000;return accessToken;
  })();
  try{return await pending;}finally{pending=null;}
 }
 async function request(path,method='GET'){
  const response=await fetcher(GOOGLE+path,{method,redirect:'error',signal:AbortSignal.timeout(15000),
   headers:{Authorization:'Bearer '+await bearer(),'Content-Type':'application/json'},...(method==='POST'?{body:'{}'}:{})});
  if(!response.ok){if(response.status===401){accessToken=null;expires=0;}throw Error('subscription_unavailable');}
  return method==='GET'?response.json():undefined;
 }
 return {
  async product(productId){
   if(!/^[a-z0-9][a-z0-9._]{0,149}$/.test(productId))throw Error('invalid_request');
   return request('/subscriptions/'+encodeURIComponent(productId));
  },
  async get(token){if(!validToken(token))throw Error('invalid_request');return request('/purchases/subscriptionsv2/tokens/'+encodeURIComponent(token));},
  async acknowledge(productId,token){
   if(!/^[a-z0-9][a-z0-9._]{0,149}$/.test(productId)||!validToken(token))throw Error('invalid_request');
   return request('/purchases/subscriptions/'+encodeURIComponent(productId)+'/tokens/'+encodeURIComponent(token)+':acknowledge','POST');
  },
 };
}
function verifiedRecord(resource,{purchaseToken,accountId,profileId,productId,basePlanId},now=Date.now()) {
 if(!validToken(purchaseToken)||!productId||!basePlanId||!Number.isFinite(now))throw Error('invalid_request');
 if(!/^[a-f0-9]{64}$/.test(accountId||'')||!/^[a-f0-9]{64}$/.test(profileId||'')||
  resource?.externalAccountIdentifiers?.obfuscatedExternalAccountId!==accountId||
  resource?.externalAccountIdentifiers?.obfuscatedExternalProfileId!==profileId)throw Error('purchase_mismatch');
 if(!STATES.has(resource.subscriptionState)||!Array.isArray(resource.lineItems)||resource.lineItems.length!==1)throw Error('purchase_mismatch');
 const line=resource.lineItems[0];
 if(line.productId!==productId||line.offerDetails?.basePlanId!==basePlanId||!line.autoRenewingPlan)throw Error('purchase_mismatch');
 const state=resource.subscriptionState,pending=state==='SUBSCRIPTION_STATE_PENDING'||state==='SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED';
 const expiry=Date.parse(line.expiryTime);
 if(!pending&&!Number.isFinite(expiry))throw Error('purchase_mismatch');
 if(!['ACKNOWLEDGEMENT_STATE_PENDING','ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED'].includes(resource.acknowledgementState))throw Error('purchase_mismatch');
 const test=Object.hasOwn(resource,'testPurchase');
 const eligible=!pending&&ACCESS.has(state)&&expiry>now;
 return {purchaseToken,accountId,profileId,productId,basePlanId,environment:test?'Sandbox':'Production',state,
  expiresAt:Number.isFinite(expiry)?new Date(expiry).toISOString():null,checkedAt:new Date(now).toISOString(),
  active:!test&&eligible,testActive:test&&eligible,
  acknowledge:eligible&&resource.acknowledgementState==='ACKNOWLEDGEMENT_STATE_PENDING'};
}
// The injected persist implementation must bind a token once, transactionally,
// reject a different owner/store, and supersede linked tokens. Never acknowledge
// until this durable write succeeds. Every verification re-queries Google.
async function verifyAndPersist({api,context,purchaseToken,persist,now=Date.now}) {
 const started=now();
 const resource=await api.get(purchaseToken);
 const record=verifiedRecord(resource,{...context,purchaseToken},now());
 // Order competing observations by request START, not network completion time.
 // A slow earlier request must not overwrite a newer cancellation/hold lookup.
 record.checkedAt=new Date(started).toISOString();
 if(resource.linkedPurchaseToken){
  if(!validToken(resource.linkedPurchaseToken)||resource.linkedPurchaseToken===purchaseToken)throw Error('purchase_mismatch');
  record.linkedPurchaseToken=resource.linkedPurchaseToken;
 }
 if(await persist(record)!==true)throw Error('save_failed');
 if(record.acknowledge)await api.acknowledge(record.productId,purchaseToken);
 return {verified:true,active:record.active,testActive:record.testActive,environment:record.environment,
  expiresAt:record.expiresAt,state:record.state};
}
export {PACKAGE,binding,createGooglePlayApi,verifiedRecord,verifyAndPersist};
