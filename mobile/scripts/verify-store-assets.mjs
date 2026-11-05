import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
const release150=process.argv.includes('--release150');
const release149=process.argv.includes('--release149');
const release148=process.argv.includes('--release148');
const release147=process.argv.includes('--release147');
const release146=process.argv.includes('--release146');
const root=resolve(process.argv.slice(2).find(x=>!['--release146','--release147','--release148','--release149','--release150'].includes(x))||fileURLToPath(new URL('../www',import.meta.url)));
const info=JSON.parse(readFileSync(resolve(root,'build-info.json'),'utf8'));
assert.equal(info.environment,'production');assert.equal(info.projectRef,'bhwuuxcrzxespkjlmqxr');
assert.equal(info.versionName,release150?'1.50':release149?'1.49':release148?'1.48':release147?'1.47':release146?'1.46':'1.45');assert.equal(info.versionCode,release150?51:release149?50:release148?49:release147?48:release146?47:46);assert.equal(info.releasePurpose,'store-update');
assert.equal(info.pushEnabled,true);assert.equal(info.billingEnabled,true);assert.equal(info.signupCheckoutEnabled,true);
assert.ok(['ios','android'].includes(info.platform));
const config=readFileSync(resolve(root,'app-config.js'),'utf8'),html=readFileSync(resolve(root,'index.html'),'utf8'),native=readFileSync(resolve(root,'native.js'),'utf8');
assert.match(config,/bhwuuxcrzxespkjlmqxr/);assert.doesNotMatch(config,/obpkzecgswnfuyhwvncd/);
assert.doesNotMatch(html+native,/staging-services-disabled\.invalid|이 테스트 버전은 휴대폰 푸시|이 테스트 버전에서는 휴대폰 푸시|매니 1\.44 · 테스트 데이터만/);
assert.doesNotMatch(html,/class="(?:ios|android)-test-banner"/);
assert.match(html,/manee_manager_permissions/);assert.match(html,/manee_staff_expenses/);assert.match(html,/maneeServiceHeaders/);
assert.match(html,/secure-auth\.js/);assert.match(html,/\/launch-144\.png/);
assert.match(native,info.platform==='ios'?/ManeeStoreKit/:/ManeePlayBilling/);
assert.match(native,info.platform==='ios'?/ios-push/:/manee-android-push/);
assert.doesNotMatch(native,info.platform==='ios'?/ManeePlayBilling/:/ManeeStoreKit/);
assert.match(readFileSync(resolve(root,`${info.platform}-ui.css`),'utf8'),new RegExp(`--${info.platform}-banner-height:0px`));
for(const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))if(match[1].trim())new vm.Script(match[1]);
console.log('Verified complete production '+info.versionName+' assets: '+info.platform);

if(release147||release148||release149||release150)assert.equal(info.smsResendSeconds,30);
if(release146||release147||release148||release149||release150){assert.equal(info.usernameRecoveryEnabled,true);assert.match(html,/src="\/username-recovery\.js"/);assert.match(html,/href="\/username-recovery\.css"/);new vm.Script(readFileSync(resolve(root,'username-recovery.js'),'utf8'));}

if(release148||release149||release150){assert.equal(info.passwordGuidanceEnabled,true);assert.equal(info.passwordPrecheckEnabled,false);assert.match(html,/password-validation\.js/);assert.match(html,/password-validation\.css/);new vm.Script(readFileSync(resolve(root,'password-validation.js'),'utf8'));}

if(release149||release150){assert.equal(info.subscriptionDesignEnabled,true);assert.match(native,/subscription-sheet|기존 구독 복원|\\uAE30\\uC874/);}
