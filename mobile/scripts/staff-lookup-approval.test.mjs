import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {JSDOM} from 'jsdom';
import {installStaffLookupApproval} from './build-release164.mjs';
import {bindStaffLookupApproval} from '../src/staff-lookup-approval.mjs';

const recovery = readFileSync(new URL('../src/username-recovery.js', import.meta.url), 'utf8');
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

function screen(t, html) {
  const dom = new JSDOM(html, {runScripts: 'outside-only', url: 'https://example.test'});
  const w = dom.window;
  t.after(() => w.close());
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new w.Event('close')); };
  const q = selector => w.document.querySelector(selector);
  const type = (selector, value) => {
    const input = q(selector);
    input.value = value;
    input.dispatchEvent(new w.Event('input', {bubbles: true}));
  };
  const submit = () => q('dialog form').dispatchEvent(new w.Event('submit', {bubbles: true, cancelable: true}));
  return {w, q, type, submit};
}

function ownerScreen(t, rpc, role = 'storeOwner') {
  const view = screen(t, '<section><div class="s2-identity"><h3>테스트 직원</h3></div>' +
    '<button data-s2-go="employee-manage" data-s2-id="crew-1">계정 관리</button></section>');
  const owner = {db: {rpc}, role, storeId: 'store-1', userId: 'owner-1', storeName: '테스트 매장'};
  const bind = () => view.w.eval('(' + bindStaffLookupApproval.toString() + ')')(() => owner);
  bind();
  return {...view, owner, bind};
}

test('the actual native owner screen installs its approval once, preserving the existing refresh hook', () => {
  const html = readFileSync(new URL('../release139/assets/index.html', import.meta.url), 'utf8');
  const built = installStaffLookupApproval(html);
  assert.match(built, /function bindOwnerUIEvents\(\)\{\s*bindStaffLookupApproval\([^;]+;\s*window\.MANEE_NATIVE\.refresh\(\)/);
  assert.ok(html.includes("s2Button('퇴사·계정 연결 관리','employee-manage',c.id)"));
  assert.throws(() => installStaffLookupApproval('<html></html>'), /one owner screen/);
});

test('only the owner can approve and a changed store or employee invalidates an open request', t => {
  let calls = 0;
  const view = ownerScreen(t, () => { calls++; }, 'manager');
  const button = () => view.q('#manee-staff-lookup-button');
  assert.equal(button(), null);
  view.owner.role = 'storeOwner';
  view.bind();
  view.bind();
  assert.equal(view.w.document.querySelectorAll('#manee-staff-lookup-button').length, 1);
  button().click();
  view.type('dialog input', 'abcd-ef01-2345');
  view.owner.storeId = 'store-2';
  view.submit();
  assert.equal(view.q('dialog'), null);
  view.owner.storeId = 'store-1';
  button().click();
  view.type('dialog input', 'abcd-ef01-2345');
  view.q('[data-s2-go]').dataset.s2Id = 'crew-2';
  view.submit();
  assert.equal(calls, 0);
  assert.equal(view.q('dialog'), null);
});

test('one normalized reference is sent for the displayed employee, without sending their pay or personal data', async t => {
  let finish;
  const calls = [];
  const view = ownerScreen(t, (method, args) => {
    calls.push([method, {...args}]);
    return new Promise(resolve => { finish = resolve; });
  });
  view.q('#manee-staff-lookup-button').click();
  assert.equal(view.q('[data-employee]').textContent, '테스트 매장 · 테스트 직원');
  view.type('dialog input', '123');
  view.submit();
  assert.match(view.q('[role=status]').textContent, /12자리/);
  assert.equal(calls.length, 0);
  view.type('dialog input', 'ABCD-EF01-2345');
  view.submit();
  view.submit();
  assert.deepEqual(calls, [['manee_approve_staff_id_lookup', {
    p_store_id: 'store-1', p_crew_id: 'crew-1', p_reference: 'abcdef012345'
  }]]);
  finish({data: true, error: null});
  await settle();
  assert.equal(view.q('dialog form').hidden, true);
  assert.match(view.q('[role=status]').textContent, /직원이 문자 인증/);
});

test('an expired reference or a transport error leaves the owner able to retry', async t => {
  let call = 0;
  const view = ownerScreen(t, async () => {
    if (++call === 1) return {data: false, error: null};
    throw Error('connection lost');
  });
  view.q('#manee-staff-lookup-button').click();
  view.type('dialog input', 'ABCD-EF01-2345');
  view.submit();
  await settle();
  assert.match(view.q('[role=status]').textContent, /유효시간/);
  view.submit();
  await settle();
  assert.match(view.q('[role=status]').textContent, /다시 확인/);
  assert.equal(view.q('dialog form button').disabled, false);
});

for (const serverIncludesReference of [false, true]) {
  test('employee sees one reference, waits 30 seconds to resend, then verifies by SMS (' + serverIncludesReference + ')', async t => {
    const view = screen(t, '<div id="app"><input id="store-login-username-input"><input id="store-login-password-input">' +
      '<button data-staff-auth-action="recovery-forgot">복구</button></div>');
    const challengeId = '01234567-89ab-cdef-0123-abcdef012345';
    const calls = [];
    view.w.MANEE_CONFIG = {supabaseUrl: 'https://example.test', publishableKey: 'test'};
    view.w.fetch = async (_url, options) => {
      const body = JSON.parse(options.body);
      calls.push(body);
      return Response.json(body.action === 'request' ? {
        ok: true, challenge_id: challengeId, expires_in: 180, resend_after: 30,
        message: serverIncludesReference ? '접수번호 ABCD-EF01-2345' : '문자를 보냈어요.'
      } : {ok: true, usernames: serverIncludesReference ? [] : ['직원__']});
    };
    view.w.eval(recovery);
    view.q('[data-find-username]').click();
    view.type('#manee-id-phone', '01000000000');
    view.q('[data-mir-send]').click();
    await settle();
    assert.equal(view.q('[data-mir-status]').textContent.split('ABCD-EF01-2345').length, 2);
    assert.equal(view.q('[data-mir-send]').disabled, true);
    assert.match(view.q('[data-mir-send]').textContent, /재전송 30초/);
    assert.equal(view.q('[data-mir-verify]').disabled, true);
    view.type('#manee-id-code', '012345');
    view.submit();
    await settle();
    assert.deepEqual(calls, [{action: 'request', phone: '01000000000', resend_seconds: 30},
      {action: 'verify', challenge_id: challengeId, code: '012345'}]);
    if (serverIncludesReference) {
      assert.match(view.q('[data-mir-intro]').textContent, /문자 인증 전에 사장님/);
    } else {
      view.q('.mir-account').click();
      assert.equal(view.q('#store-login-username-input').value, '직원__');
    }
  });
}
