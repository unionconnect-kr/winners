import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync,existsSync} from 'node:fs';
assert.equal(process.argv[2],'android');
const out=new URL('../www/',import.meta.url),info=JSON.parse(readFileSync(new URL('build-info.json',out),'utf8'));
assert.equal(info.versionName,'1.61');assert.equal(info.versionCode,62);
assert.equal(info.environment,'production');assert.equal(info.projectRef,'bhwuuxcrzxespkjlmqxr');assert.equal(info.platform,'android');
assert.equal(info.checklistPhotos,true);assert.equal(info.ownerGuide,true);assert.equal(info.billingEnabled,true);assert.equal(info.nativeAuthStorage,'keystore-v1');
const html=readFileSync(new URL('index.html',out),'utf8');
for(const marker of ['manee_checklist_photos','manee_checklist_photo','photoRequired','m157-store-icon','사장님 사용법','https://youtube.com/@manee-official','store-guide-checklist.css'])assert.ok(html.includes(marker),marker);
for(const m of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))if(m[1].trim())new vm.Script(m[1]);
assert.ok(existsSync(new URL('store-guide-checklist.css',out)));
console.log('Verified MANEE 1.61 Android production assets and feature hooks.');

for(const marker of ['m159OnboardingChecklist','m159CreateItem','checklistTemplatesLoaded','7nJ2DIiPXlE','Fo5V3UtxXAo'])assert.ok(html.includes(marker),marker);
const loader=html.slice(html.indexOf('  async function loadChecklist('),html.indexOf('  async function loadChecklistLog('));
assert.doesNotMatch(loader,/callAuthChecklist|\.upsert\(|\.insert\(/);

assert.equal(info.checklistThumbnails,true);
for(const marker of ['m160-photo-thumb','m160ThumbnailScope','m160-photo-large'])assert.ok(html.includes(marker),marker);

for(const flag of ['privatePhotoStorage','mandatoryUpdate','releaseNotes','managerPayHelp','employmentPermissionsSeparated'])assert.equal(info[flag],true);
assert.equal(info.maxChecklistPhotos,4);
for(const marker of ['manee-checklist-photo-upload','manee_checklist_prepare_photos','photo_ids','photo_sets','시급·월급 설정','월별 급여 정산','m161-pay-help'])assert.ok(html.includes(marker),marker);
assert.doesNotMatch(html,/<summary>권한·급여 조건<|s2Check\('매출·리포트 조회 권한'/);
assert.match(readFileSync(new URL('native.js',out),'utf8'),/manee_mobile_update_policy/);
