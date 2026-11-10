// Generated from netlify/functions/lib/google-play-billing.cjs; keep parity test passing.
import {Buffer} from 'node:buffer';
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
// Take each diagnostic value once, without coercing provider objects or retaining
// raw identifiers. These facts never participate in receipt validation.
function receiptFacts(resource,now) {
 const read=(object,key)=>{try{return object?.[key];}catch{return undefined;}};
 const identifiers=read(resource,'externalAccountIdentifiers'),lines=read(resource,'lineItems');
 let line;try{if(Array.isArray(lines))line=read(lines,0);}catch{/* Revoked/untrusted proxy. */}
 const account=read(identifiers,'obfuscatedExternalAccountId'),profile=read(identifiers,'obfuscatedExternalProfileId');
 const state=read(resource,'subscriptionState'),expiry=read(line,'expiryTime');
 const outOfApp=read(resource,'outOfAppPurchaseContext');
 const expires=typeof expiry==='string'&&expiry.length>0?Date.parse(expiry):NaN;
 const reference=value=>{
  if(typeof value!=='string'||value.length>128)return 'unknown';
  const order=/^(GPA\.\d{4}-\d{4}-\d{4}-\d{5})(?:\.\.\d+)?$/.exec(value);
  return order&&order[0].length===value.length?createHash('sha256').update(PACKAGE+':order:'+order[1]).digest('hex').slice(0,16):'unknown';
 };
 // subscriptionsv2 supplies the latest successful order on the line item.
 // Accept the legacy top-level field only as a fallback for older responses.
 const latest=reference(read(line,'latestSuccessfulOrderId'));
 const orderReference=latest==='unknown'?reference(read(resource,'latestOrderId')):latest;
 let test=false;try{test=Object.hasOwn(resource,'testPurchase');}catch{/* Missing/malformed resource. */}
 return Object.freeze({accountBinding:typeof account==='string'&&account.length>0?'present':'missing',
  profileBinding:typeof profile==='string'&&profile.length>0?'present':'missing',
  environment:test?'Sandbox':'Production',state:STATES.has(state)?state:'unknown',
  expiry:expiry===undefined||expiry===null||expiry===''?'missing':!Number.isFinite(expires)?'invalid':expires>now?'future':'past',
  outOfAppResubscription:outOfApp!==null&&typeof outOfApp==='object'?'present':'absent',
  orderReference});
}
// Only billingReason is enumerable, preserving existing JSON/error behavior.
function purchaseMismatch(billingReason,resource,now){
 return Object.defineProperty(Object.assign(Error('purchase_mismatch'),{billingReason}),
  'receiptFacts',{value:receiptFacts(resource,now)});
}
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
  if(!response.ok){if(response.status===401){accessToken=null;expires=0;}throw Object.assign(Error('subscription_unavailable'),{httpStatus:response.status});}
  return method==='GET'?response.json():undefined;
 }
 return {
  async order(orderId){if(!/^GPA\.\d{4}-\d{4}-\d{4}-\d{5}(?:\.\.\d+)?$/.test(orderId||''))throw Error('invalid_request');return request('/orders/'+encodeURIComponent(orderId));},
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
 const mismatch=reason=>purchaseMismatch(reason,resource,now);
 if(!/^[a-f0-9]{64}$/.test(accountId||''))throw mismatch('account_binding_mismatch');
 if(!/^[a-f0-9]{64}$/.test(profileId||''))throw mismatch('profile_binding_mismatch');
 if(resource?.externalAccountIdentifiers?.obfuscatedExternalAccountId!==accountId)throw mismatch('account_binding_mismatch');
 if(resource?.externalAccountIdentifiers?.obfuscatedExternalProfileId!==profileId)throw mismatch('profile_binding_mismatch');
 if(!STATES.has(resource.subscriptionState)||!Array.isArray(resource.lineItems)||resource.lineItems.length!==1)throw mismatch('subscription_shape_mismatch');
 const line=resource.lineItems[0];
 if(line.productId!==productId||line.offerDetails?.basePlanId!==basePlanId||!line.autoRenewingPlan)throw mismatch('product_plan_mismatch');
 const state=resource.subscriptionState,pending=state==='SUBSCRIPTION_STATE_PENDING'||state==='SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED';
 const expiry=Date.parse(line.expiryTime);
 if(!pending&&!Number.isFinite(expiry))throw mismatch('subscription_expiry_invalid');
 if(!['ACKNOWLEDGEMENT_STATE_PENDING','ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED'].includes(resource.acknowledgementState))throw mismatch('acknowledgement_state_invalid');
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
 const checked=now();
 const record=verifiedRecord(resource,{...context,purchaseToken},checked);
 // Order competing observations by request START, not network completion time.
 // A slow earlier request must not overwrite a newer cancellation/hold lookup.
 record.checkedAt=new Date(started).toISOString();
 if(resource.linkedPurchaseToken){
  if(!validToken(resource.linkedPurchaseToken)||resource.linkedPurchaseToken===purchaseToken)throw purchaseMismatch('linked_token_invalid',resource,checked);
  record.linkedPurchaseToken=resource.linkedPurchaseToken;
 }
 if(await persist(record)!==true)throw Error('save_failed');
 if(record.acknowledge)await api.acknowledge(record.productId,purchaseToken);
 return {verified:true,active:record.active,testActive:record.testActive,environment:record.environment,
  expiresAt:record.expiresAt,state:record.state};
}
export {PACKAGE,binding,createGooglePlayApi,verifiedRecord,verifyAndPersist};
