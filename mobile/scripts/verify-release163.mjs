import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

export function verifySevenUpdates(platform, androidVersion = '1.63', versionCode = 64) {
  assert.ok(['ios', 'android'].includes(platform));
  const asset = name => readFileSync(new URL('../www/' + name, import.meta.url), 'utf8');
  const info = JSON.parse(asset('build-info.json'));
  const html = asset('index.html');
  assert.equal(info.versionName, platform === 'ios' ? '1.58' : androidVersion);
  assert.equal(info.versionCode, versionCode);
  assert.equal(info.environment, 'production');
  assert.equal(info.projectRef, 'bhwuuxcrzxespkjlmqxr');
  assert.equal(info.storeTitle, '매니 - 우리가게 매니저');
  for (const flag of ['managerWorkConfirmation', 'payrollHalfHourApproval', 'ownerChangeNotifications',
    'clientVersions', 'quietStartup', 'clockConfirmation', 'retiredPayrollSeparated', 'privatePhotoStorage']) {
    assert.equal(info[flag], true, flag);
  }
  for (const marker of ['m163WorkRows(dateStr)', 'm163ClockSheet', 'manee_manager_write_v2',
    'manee_owner_activity_read', 'pay_check_in', '퇴사자 급여·최종 정산', 'manee_checklist_prepare_photos']) {
    assert.ok(html.includes(marker), marker);
  }
  for (const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
    if (match[1].trim()) new vm.Script(match[1]);
  }
  const native = asset('native.js');
  assert.ok(native.includes('manee_report_client_version'));
  assert.ok(!native.includes('앱 버전을 확인하고 있어요'));
  console.log('Verified ' + platform + ' features, production identity, native reporter, quiet startup and script syntax.');
  return {html, info};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  verifySevenUpdates(process.argv[2]);
}
