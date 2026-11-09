import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
import {JSDOM} from 'jsdom';

const nativeScript = new Script(readFileSync(new URL('../src/native.js', import.meta.url), 'utf8')
  .replace(/^import .*;\r?\n/gm, ''));

function fixture(getInfo) {
  const dom = new JSDOM('<!doctype html><body></body>', {url:'https://localhost/', runScripts:'outside-only'});
  const {window} = dom;
  window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  window.HTMLDialogElement.prototype.close = function () {
    this.open = false;
    this.dispatchEvent(new window.Event('close'));
  };
  Object.assign(window, {
    App:{getInfo},
    registerPlugin:()=>({addListener(){}}),
    createNativeGeolocation:()=>({}), Geolocation:{}, PushNotifications:{},
    createIosPush:()=>({}), createSignupCheckout:()=>()=>{},
    createNotificationNavigation:()=>({start:async()=>{},flush:async()=>{}}),
    createBillingClient:()=>({status(){assert.fail('App information must not request billing');}}),
  });
  nativeScript.runInContext(dom.getInternalVMContext());
  return dom;
}

test('iOS app information reads the installed version without opening StoreKit', async () => {
  let calls = 0;
  const name = '매니 <img src=x>';
  const version = '1.56 <b>fixture</b>';
  const dom = fixture(async () => { calls++; return {name, version, build:'156.1.1'}; });
  try {
    const {document, MANEE_NATIVE:native} = dom.window;
    await Promise.all([native.openAppInfo(), native.openAppInfo()]);
    assert.equal(calls, 1);
    const sheet = document.querySelector('#manee-ios-info');
    assert.equal(sheet.getAttribute('aria-labelledby'), 'ios-info-title');
    assert.equal(sheet.querySelector('h2').textContent, '앱 정보');
    assert.equal(sheet.querySelector('#ios-info-name').textContent, name);
    assert.equal(sheet.querySelector('#ios-info-version').textContent, version);
    assert.equal(sheet.querySelector('img,b'), null);
    assert.doesNotMatch(sheet.textContent, /구독|알림|156\.1\.1/);
    assert.equal(sheet.querySelector('button').textContent, '닫기');
    sheet.querySelector('button').click();
    assert.equal(document.querySelector('dialog'), null);
  } finally { dom.window.close(); }
});

test('iOS app information handles an unavailable version and never shows plugin errors', async () => {
  const dom = fixture(async () => { throw Error('private plugin error'); });
  try {
    const {document, MANEE_NATIVE:native} = dom.window;
    await native.openAppInfo();
    const sheet = document.querySelector('#manee-ios-info');
    assert.equal(sheet.querySelector('#ios-info-name').textContent, '매니');
    assert.equal(sheet.querySelector('#ios-info-version').textContent, '확인할 수 없어요');
    assert.doesNotMatch(sheet.textContent, /private plugin error/);
  } finally { dom.window.close(); }
});

test('closing iOS app information while loading discards the late version', async () => {
  let finish;
  const dom = fixture(() => new Promise(resolve => { finish = resolve; }));
  try {
    const {document, MANEE_NATIVE:native} = dom.window;
    const pending = native.openAppInfo();
    const sheet = document.querySelector('#manee-ios-info');
    sheet.querySelector('button').click();
    finish({name:'stale name',version:'stale version'});
    await pending;
    assert.equal(document.querySelector('dialog'), null);
    assert.doesNotMatch(sheet.textContent, /stale/);
  } finally { dom.window.close(); }
});
