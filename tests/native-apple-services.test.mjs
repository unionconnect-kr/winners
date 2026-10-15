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

test('native HTTP endpoints reject unauthenticated and foreign-origin calls before server access',async()=>{
 const config=require('../netlify/functions/lib/manee-environment.json'),previous={...config};
 Object.assign(config,{environment:'production',externalServicesEnabled:true});
 try{for(const name of ['ios-billing','ios-push']){
  const {handler}=require('../netlify/functions/'+name+'.js');
  const body=JSON.stringify({action:'status',storeId:token});
  const denied=await handler({httpMethod:'POST',headers:{origin:'capacitor://localhost'},body});
  assert.equal(denied.statusCode,401);
  assert.equal(JSON.parse(denied.body).error,'authentication_required');
  const origin=await handler({httpMethod:'POST',headers:{origin:'https://untrusted.invalid'},body});
  assert.equal(origin.statusCode,403);
 }}finally{Object.assign(config,previous);}
});
test('official Apple verifier rejects unsigned or malformed JWS without accepting claims',async()=>{
 const {SignedDataVerifier,Environment}=require('@apple/app-store-server-library');
 const verifier=new SignedDataVerifier([require('../netlify/functions/lib/apple-root.cjs')],true,Environment.PRODUCTION,'kr.co.manee.app',6820833544);
 await assert.rejects(()=>verifier.verifyAndDecodeTransaction('eyJhbGciOiJub25lIn0.e30.'));
});

test('APNs business payload contains only fixed copy and validated routing identifiers',()=>{
 const data=push.apnsPayload({storeId:token,kind:'monthly_costs',eventId:token,monthKey:'2026-10',eventDate:'2026-10-16',customerName:'private',amount:123});
 assert.equal(data.kind,'monthly_costs');assert.equal(data.monthKey,'2026-10');
 assert.doesNotMatch(JSON.stringify(data),/private|123|customerName/);
 assert.throws(()=>push.apnsPayload({storeId:token,kind:'attacker'}),/invalid_notification/);
 assert.throws(()=>push.apnsPayload({storeId:'bad',kind:'test'}),/invalid_notification/);
});

test('additional products require exact allocated product and transaction bindings',async()=>{
 const t={...transaction,productId:'manee.store2.monthly'};
 assert.throws(()=>billing.validateTransaction(t,'Production',token),/purchase_mismatch/);
 assert.equal(billing.validateTransaction(t,'Production',token,t.productId).productId,t.productId);
 assert.throws(()=>billing.validateTransaction({...t,productId:'manee.store11.monthly'},'Production',token,'manee.store11.monthly'));
});
