import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {verifyAndroidAssets} from './verify-android-build.mjs';
import {uploadTestFlight} from './upload-testflight.mjs';
const environments=JSON.parse(readFileSync(new URL('../../config/environments.json',import.meta.url),'utf8'));
test('1.47 artifact validation binds username recovery to the new Android version pair',()=>{
  const info={platform:'android',environment:'production',projectRef:environments.production.projectRef,androidPushProjectId:'manee-production-3eafa',releasePurpose:'store-update',billingEnabled:true,pushEnabled:true,signupCheckoutEnabled:true,versionName:'1.47',versionCode:48,nativeAuthStorage:'keystore-v1',usernameRecoveryEnabled:true,smsResendSeconds:30};
  const args={info,appConfig:JSON.stringify(environments.production),environment:'production',environments,firebaseProject:'manee-production-3eafa',releasePurpose:'store-update'};
  verifyAndroidAssets(args);
  for(const override of [{versionCode:47},{usernameRecoveryEnabled:false},{versionName:'1.48'},{projectRef:environments.staging.projectRef}])assert.throws(()=>verifyAndroidAssets({...args,info:{...info,...override}}));
});
test('1.47 TestFlight upload accepts only the exact designated repository, branch and workflow',async()=>{
  const temp=mkdtempSync(join(tmpdir(),'manee147-upload-'));
  const env={GITHUB_EVENT_NAME:'push',GITHUB_REF:'refs/heads/codex/mobile-release-147-20261105',GITHUB_WORKFLOW_REF:'unionconnect-kr/winners/.github/workflows/mobile147-release.yml@refs/heads/codex/mobile-release-147-20261105',GITHUB_REPOSITORY:'unionconnect-kr/winners',MANEE_UPLOAD_TESTFLIGHT:'true',RUNNER_TEMP:temp,ASC_KEY_ID:'TESTKEY123',ASC_ISSUER_ID:'test-issuer',ASC_PRIVATE_KEY:'test-key'};
  try{
    for(const override of [{GITHUB_REPOSITORY:'other/repo'},{GITHUB_REF:'refs/heads/other'},{GITHUB_WORKFLOW_REF:'other'},{MANEE_UPLOAD_TESTFLIGHT:'false'}])await assert.rejects(uploadTestFlight({...env,...override},'/tmp/app.ipa',{platform:'darwin',check:()=>assert.fail('must not contact Apple')}),/UPLOAD_NOT_REQUESTED/);
    assert.equal((await uploadTestFlight(env,'/tmp/app.ipa',{platform:'darwin',check:async()=>{},run:()=>({status:0})})).uploaded,true);
  }finally{rmSync(temp,{recursive:true,force:true});}
});
