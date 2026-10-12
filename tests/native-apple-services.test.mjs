import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {generateKeyPairSync,verify} from 'node:crypto';
const require=createRequire(import.meta.url);
const billing=require('../netlify/functions/lib/apple-billing.cjs');
const push=require('../netlify/functions/lib/native-push.cjs');
const token='00000000-0000-4000-8000-000000000001';
const transaction={bundleId:'kr.co.manee.app',productId:'manee.store1.monthly',environment:'Production',type:'Auto-Renewable Subscription',inAppOwnershipType:'PURCHASED',quantity:1,originalTransactionId:'123',transactionId:'124',expiresDate:Date.now()+86400000,signedDate:Date.now(),appAccountToken:token};
function api({status=1,t=transaction}={}){return {environment:'Production',client:{getAllSubscriptionStatuses:async()=>({bundleId:transaction.bundleId,environment:'Production',data:[{lastTransactions:[{originalTransactionId:'123',status,signedTransactionInfo:'fresh',signedRenewalInfo:'renewal'}]}]})},verifier:{verifyAndDecodeTransaction:async s=>s==='fresh'?t:transaction,verifyAndDecodeRenewalInfo:async()=>({originalTransactionId:'123',productId:transaction.productId,environment:'Production',gracePeriodExpiresDate:Date.now()+86400000})}};}
test('fresh Apple state overrides replayed pre-refund device receipts',async()=>{
 const record=await billing.verifyPurchase(api({status:5,t:{...transaction,revocationDate:Date.now()}}),'old-receipt',token);
 assert.equal(billing.entitlement(record).active,false);assert.equal(record.revoked,true);
});
test('other store/account, wrong product, environment and family-sharing claims fail closed',()=>{
 for(const t of [{...transaction,productId:'other'},{...transaction,environment:'Sandbox'},{...transaction,appAccountToken:token.replace(/1$/,'2')},{...transaction,inAppOwnershipType:'FAMILY_SHARED'}])assert.throws(()=>billing.validateTransaction(t,'Production',token),/purchase_mismatch/);
});
test('sandbox purchases never grant a production entitlement; grace and expiration are explicit',async()=>{
 const live=await billing.verifyPurchase(api(),'signed',token);assert.equal(billing.entitlement(live).active,true);
 const sandbox=billing.entitlement({...live,environment:'Sandbox'});assert.equal(sandbox.active,false);assert.equal(sandbox.testActive,true);
 assert.equal(billing.entitlement({...live,expiresAt:'2000-01-01T00:00:00Z'}).active,false);
 const grace=await billing.verifyPurchase(api({status:4}),'signed',token);assert.equal(billing.entitlement(grace).active,true);
});
test('APNs JWT is ES256 and time bounded; signing credentials never enter payload',()=>{
 const {privateKey,publicKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
 const env={APNS_TEAM_ID:'J7AWFKW86N',APNS_KEY_ID:'TESTKEY123',APNS_PRIVATE_KEY:privateKey.export({format:'pem',type:'pkcs8'})};
 const value=push.providerToken(env,1000),[h,p,s]=value.split('.');assert.equal(JSON.parse(Buffer.from(p,'base64url')).iat,1000);
 assert.ok(verify('sha256',Buffer.from(h+'.'+p),{key:publicKey,dsaEncoding:'ieee-p1363'},Buffer.from(s,'base64url')));
 assert.equal(push.providerToken(env,1100),value);assert.notEqual(push.providerToken(env,5000),value);
 assert.throws(()=>push.providerToken({}),/push_not_ready/);
});
test('APNs targets come only from server RPC, expired tokens are removed and failures isolated',async()=>{
 const calls=[],db={rpc:async(name,args)=>{calls.push({name,args});return {data:name==='manee_ios_push_targets'?[{token:'expired'},{token:'valid'}]:null};}};
 const env={APNS_TEAM_ID:'J7AWFKW86N',APNS_KEY_ID:'key',APNS_PRIVATE_KEY:'not used by mock'};
 const result=await push.sendNativePush(db,{storeId:'store',userId:'owner'},env,async token=>({sent:token==='valid',expired:token==='expired'}));
 assert.equal(result.sent,1);assert.equal(result.failed,1);assert.equal(calls[0].args.p_user_id,'owner');assert.equal(calls[1].name,'manee_ios_drop_push');
});
