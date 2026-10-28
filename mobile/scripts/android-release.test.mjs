import test from 'node:test';
import assert from 'node:assert/strict';
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
test('debug variant cannot package production assets',()=>{
  assert.throws(()=>verifyAndroidAssets({...production(),environment:'staging'}));
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
