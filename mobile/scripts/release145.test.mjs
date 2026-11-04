import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {adaptIos139} from './adapt-ios139.mjs';
import {launch143Html} from './launch143-html.mjs';
import {feedback144Html} from './feedback144-html.mjs';
import {signupCheckoutHtml} from './signup-checkout-html.mjs';
import {hardenUi} from '../../scripts/harden-ui.mjs';
import {release145Html} from './release145-html.mjs';
import {verifyAndroidAssets} from './verify-android-build.mjs';
import {uploadTestFlight} from './upload-testflight.mjs';
const baseline=readFileSync(new URL('../release139/assets/index.html',import.meta.url),'utf8');
const environments=JSON.parse(readFileSync(new URL('../../config/environments.json',import.meta.url),'utf8'));
for(const platform of ['android','ios'])test(`1.45 ${platform} promotes approved screens while retaining calendar, roles and guarded service calls`,()=>{
 const qa=feedback144Html(signupCheckoutHtml(launch143Html(hardenUi(adaptIos139(baseline,platform)),platform)));
 const html=release145Html(qa,platform,'https://winners-staffapp.netlify.app');
 for(const m of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))if(m[1].trim())new vm.Script(m[1]);
 const calendar=s=>s.slice(s.indexOf('  function renderSector3Sales(){'),s.indexOf('  function renderSector3Expenses(){'));
 assert.equal(calendar(html),calendar(qa));
 assert.match(html,/manee_staff_expenses/);assert.match(html,/manee_manager_permissions/);
 assert.match(html,/maneeServiceHeaders/);assert.match(html,/maneeRequireMfa/);
 assert.match(html,/att-confirm-wrong">시간 수정/);assert.match(html,/att-confirm-right">확인/);
 assert.match(html,/\/launch-144.png/);assert.match(html,/owner-push-toggle-btn/);
 assert.doesNotMatch(html,/staging-services-disabled\.invalid|class="(?:ios|android)-test-banner"|이 테스트 버전에서는 휴대폰 푸시|이 테스트 앱은|apple:'Apple'/);
 assert.match(html,/https:\/\/winners-staffapp.netlify.app\/\.netlify\/functions\/read-receipt/);
 const start=html.indexOf('  function renderPushSettings144(){'),end=html.indexOf('  function s4SettingBody(',start);
 const context={state:{pushBusy:true},escapeHtml:s=>s.replaceAll('<','&lt;')};vm.createContext(context);vm.runInContext(html.slice(start,end),context);
 assert.match(context.renderPushSettings144(),/ disabled/);
 context.state={pushSubscribed:true,pushRegistrationError:'<denied>'};
 assert.match(context.renderPushSettings144(),/알림 끄기/);assert.match(context.renderPushSettings144(),/&lt;denied>/);
});
test('store-update verification rejects staging, disabled push and old versions',()=>{
 const info={platform:'android',environment:'production',projectRef:environments.production.projectRef,androidPushProjectId:'manee-production-3eafa',releasePurpose:'store-update',billingEnabled:true,pushEnabled:true,signupCheckoutEnabled:true,versionName:'1.45',versionCode:46,nativeAuthStorage:'keystore-v1'};
 const args={info,appConfig:JSON.stringify(environments.production),environment:'production',environments,firebaseProject:'manee-production-3eafa',releasePurpose:'store-update'};
 verifyAndroidAssets(args);
 for(const override of [{environment:'staging'},{projectRef:environments.staging.projectRef},{pushEnabled:false},{billingEnabled:false},{versionCode:45},{nativeAuthStorage:null}])assert.throws(()=>verifyAndroidAssets({...args,info:{...info,...override}}));
 assert.throws(()=>verifyAndroidAssets({...args,appConfig:JSON.stringify(environments.staging)}));
});
test('release upload requires the designated branch, workflow and explicit request',async()=>{
 const env={GITHUB_EVENT_NAME:'push',GITHUB_REF:'refs/heads/codex/mobile-release-145-20261105',GITHUB_WORKFLOW_REF:'unionconnect-kr/winners/.github/workflows/mobile145-release.yml@refs/heads/codex/mobile-release-145-20261105',GITHUB_REPOSITORY:'unionconnect-kr/winners',MANEE_UPLOAD_TESTFLIGHT:'true',ASC_KEY_ID:'TESTKEY123',ASC_ISSUER_ID:'test-issuer',ASC_PRIVATE_KEY:'test-key'};
 for(const override of [{GITHUB_REF:'refs/heads/other'},{GITHUB_WORKFLOW_REF:'other'},{MANEE_UPLOAD_TESTFLIGHT:'false'}])await assert.rejects(uploadTestFlight({...env,...override},'/tmp/app.ipa',{platform:'darwin',check:()=>assert.fail('No Apple call')}),/UPLOAD_NOT_REQUESTED/);
 const temp=mkdtempSync(join(tmpdir(),'manee145-upload-'));
 try{assert.equal((await uploadTestFlight({...env,RUNNER_TEMP:temp},'/tmp/app.ipa',{platform:'darwin',check:async()=>{},run:()=>({status:0})})).uploaded,true);}finally{rmSync(temp,{recursive:true,force:true});}
});
