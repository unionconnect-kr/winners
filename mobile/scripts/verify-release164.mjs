import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {verifySevenUpdates} from './verify-release163.mjs';

const androidVersion = process.argv[3] || '1.64';
assert.ok(['1.64', '1.65', '1.66'].includes(androidVersion));
const {html, info} = verifySevenUpdates(process.argv[2], androidVersion, {'1.64': 65, '1.65': 66, '1.66': 67}[androidVersion]);
if (androidVersion === '1.66') {
  assert.ok(html.includes('bindSalesAmount(inp)'));
  assert.ok(!html.includes('manee_manager_save_sales'));
  assert.ok(!html.includes('다른 직원의 매출보고는 수정할 수 없어요.'));
}
assert.equal(info.storeAssistedUsernameRecovery, true);
assert.equal(info.usernameRecoveryEnabled, true);
assert.equal(info.smsResendSeconds, 30);
assert.ok(html.includes('bindStaffLookupApproval(() => ({db, role: state.role'));
assert.ok(html.includes("owner.db.rpc('manee_approve_staff_id_lookup'"));
assert.ok(html.includes('src="/username-recovery.js"'));
const recovery = readFileSync(new URL('../www/username-recovery.js', import.meta.url), 'utf8');
assert.equal(recovery, readFileSync(new URL('../src/username-recovery.js', import.meta.url), 'utf8'));
assert.ok(recovery.includes('문자 인증 전에 사장님께 접수번호'));
new vm.Script(recovery);
console.log('Verified employee reference, owner approval and existing phone recovery in the packaged app.');
