import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import { verifyAndroidAssets, verifyUploadEnvironment } from './verify-android-build.mjs';
const environments = {staging:{projectRef:'staging-ref'},production:{projectRef:'production-ref'}};
const production = () => ({environment:'production',environments,firebaseProject:'manee-production-3eafa',
  appConfig:'production-ref',info:{platform:'android',environment:'production',projectRef:'production-ref',
    androidPushProjectId:'manee-production-3eafa',releasePurpose:'play-internal-setup',billingEnabled:false}});
test('internal build accepts only matching production assets and billing disabled',()=>{
  verifyAndroidAssets(production());
  for(const change of [{environment:'staging'},{projectRef:'staging-ref'},
    {androidPushProjectId:'manee-staging'},{platform:'ios'},{releasePurpose:'public'},
    {billingEnabled:true}]) {
    const input=production();Object.assign(input.info,change);
    assert.throws(()=>verifyAndroidAssets(input));
  }
  assert.throws(()=>verifyAndroidAssets({...production(),appConfig:'production-ref staging-ref'}));
});
test('paid pilot assets have a distinct purpose and cannot pass the internal guard',()=>{
 const input=production();
 input.info.releasePurpose='paid-pilot';input.info.billingEnabled=true;
 assert.throws(()=>verifyAndroidAssets(input));
 verifyAndroidAssets({...input,releasePurpose:'paid-pilot'});
 for(const change of [{releasePurpose:'public'},{billingEnabled:false}]){
  const wrong=production();Object.assign(wrong.info,input.info,change);
  assert.throws(()=>verifyAndroidAssets({...wrong,releasePurpose:'paid-pilot'}));
 }
});
test('debug variant cannot package production assets',()=>{
  assert.throws(()=>verifyAndroidAssets({...production(),environment:'staging'}));
});
for(const [versionName,versionCode] of [['1.52',53],['1.53',54],['1.54',55],['1.55',56],['1.56',57],['1.57',58]])test(`${versionName} store update requires its exact version and all production services`,()=>{
  const input=production();input.releasePurpose='store-update';
  Object.assign(input.info,{releasePurpose:'store-update',billingEnabled:true,versionName,versionCode,
    usernameRecoveryEnabled:true,smsResendSeconds:30,pushEnabled:true,signupCheckoutEnabled:true,nativeAuthStorage:'keystore-v1'});
  verifyAndroidAssets(input);
  for(const change of [{versionCode:versionCode-1},{versionCode:versionCode+1},{versionName:'1.58'},{billingEnabled:false},{pushEnabled:false},{signupCheckoutEnabled:false},
    {nativeAuthStorage:'localstorage'},{usernameRecoveryEnabled:false},{smsResendSeconds:60}]) {
    assert.throws(()=>verifyAndroidAssets({...input,info:{...input.info,...change}}));
  }
});
for(const release of [153,154,155,156,157])test(`${release} builder refuses iOS, staging and implicit release inputs before building assets`,()=>{
  const builder=fileURLToPath(new URL(`./build-release${release}.mjs`,import.meta.url));
  for(const args of [[],['android'],['ios','production'],['android','staging']]) {
    const result=spawnSync(process.execPath,[builder,...args],{encoding:'utf8'});
    assert.notEqual(result.status,0);
    assert.match(result.stderr,/Specify android production explicitly/);
    assert.equal(result.stdout,'');
  }
});
test('upload signing requires every input, an existing file, and a non-debug identity',()=>{
  const env={MANEE_ANDROID_UPLOAD_KEYSTORE:'/private/upload.jks',MANEE_ANDROID_UPLOAD_STORE_PASSWORD:'fixture',
    MANEE_ANDROID_UPLOAD_KEY_ALIAS:'upload',MANEE_ANDROID_UPLOAD_KEY_PASSWORD:'fixture'};
  verifyUploadEnvironment(env,()=>true);
  for(const name of Object.keys(env))assert.throws(()=>verifyUploadEnvironment({...env,[name]:''},()=>true));
  assert.throws(()=>verifyUploadEnvironment(env,()=>false));
  assert.throws(()=>verifyUploadEnvironment({...env,MANEE_ANDROID_UPLOAD_KEY_ALIAS:'androiddebugkey'},()=>true));
  assert.throws(()=>verifyUploadEnvironment({...env,MANEE_ANDROID_UPLOAD_KEYSTORE:'/private/debug.keystore'},()=>true));
});
