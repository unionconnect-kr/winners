import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {hardenUi} from '../../scripts/harden-ui.mjs';
import {adaptIos139} from './adapt-ios139.mjs';
import {launch143Html} from './launch143-html.mjs';
import {signupCheckoutHtml} from './signup-checkout-html.mjs';
import {feedback144Html} from './feedback144-html.mjs';
import {release145Html} from './release145-html.mjs';
import {applyAndroidAppInfoChanges} from './android-app-info-html.mjs';

const baseline = readFileSync(new URL('../release139/assets/index.html', import.meta.url), 'utf8');
const settle = () => new Promise(resolve => setImmediate(resolve));
const bundles = new Map();

function nativeBundle(production) {
  if (!bundles.has(production)) {
    bundles.set(production, build({
      entryPoints: [fileURLToPath(new URL('../src/native-android.js', import.meta.url))],
      bundle: true,
      format: 'iife',
      write: false,
      define: {
        ANDROID_PRODUCTION: String(production),
        ANDROID_PAID_BILLING: String(production),
        ANDROID_FIREBASE_PROJECT: JSON.stringify('fixture-firebase'),
      },
      plugins: [{
        name: 'capacitor-app-info-fixture',
        setup(builder) {
          builder.onResolve({filter: /^@capacitor\/app$/}, () => ({path: 'app', namespace: 'fixture'}));
          builder.onLoad({filter: /^app$/, namespace: 'fixture'}, () => ({
            contents: 'export const App = window.fixtureApp;',
          }));
        },
      }],
    }).then(result => result.outputFiles[0].text));
  }
  return bundles.get(production);
}

async function appInfoFixture(production, getInfo) {
  const dom = new JSDOM('<!doctype html><body></body>', {
    url: 'https://localhost/',
    runScripts: 'outside-only',
  });
  const {window} = dom;
  window.fixtureApp = {getInfo};
  window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  window.HTMLDialogElement.prototype.close = function () {
    this.open = false;
    this.dispatchEvent(new window.Event('close'));
  };
  window.eval(await nativeBundle(production));
  return dom;
}

test('production app information reads the installed name and version and closes cleanly', async () => {
  let requests = 0;
  const name = '매니 <img src=x>';
  const version = '1.56 <b>fixture</b>';
  const dom = await appInfoFixture(true, async () => { requests++; return {name, version}; });
  try {
    const {document, MANEE_NATIVE: native} = dom.window;
    native.openSettings();
    native.openSettings();
    await settle();
    const info = document.querySelector('#manee-android-info');
    assert.equal(requests, 1);
    assert.equal(info.getAttribute('aria-labelledby'), 'android-info-title');
    assert.equal(info.querySelector('h2').textContent, '앱 정보');
    assert.equal(info.querySelector('#android-info-name').textContent, name);
    assert.equal(info.querySelector('#android-info-version').textContent, version);
    assert.equal(info.querySelector('img,b'), null);
    assert.deepEqual([...info.querySelectorAll('button')].map(button => button.textContent), ['닫기']);
    assert.doesNotMatch(info.textContent, /구독|테스트 알림|PDF/);
    info.querySelector('#android-info-close').click();
    assert.equal(document.querySelector('dialog'), null);
  } finally {
    dom.window.close();
  }
});

test('production app information reports an unavailable package version without exposing errors', async () => {
  const dom = await appInfoFixture(true, async () => { throw Error('private plugin error'); });
  try {
    dom.window.MANEE_NATIVE.openSettings();
    await settle();
    const info = dom.window.document.querySelector('#manee-android-info');
    assert.equal(info.querySelector('#android-info-name').textContent, '매니');
    assert.equal(info.querySelector('#android-info-version').textContent, '확인할 수 없어요');
    assert.doesNotMatch(info.textContent, /private plugin error/);
  } finally {
    dom.window.close();
  }
});

test('staging keeps the diagnostic dialog and test notification entry', async () => {
  let requests = 0;
  const dom = await appInfoFixture(false, async () => { requests++; return {}; });
  try {
    dom.window.MANEE_NATIVE.openSettings();
    const info = dom.window.document.querySelector('#manee-android-info');
    assert.match(info.textContent, /매니 테스트 앱/);
    assert.ok(info.querySelector('#android-test-push'));
    assert.equal(info.querySelector('#android-info-version'), null);
    assert.equal(requests, 0);
  } finally {
    dom.window.close();
  }
});

function productionHtml(platform) {
  const platformHtml = hardenUi(adaptIos139(baseline, platform));
  const approved = feedback144Html(signupCheckoutHtml(launch143Html(platformHtml, platform)));
  return release145Html(approved, platform, 'https://winners-staffapp.netlify.app');
}

test('production Android removes the old footer and preserves app info and subscription access', () => {
  const html = applyAndroidAppInfoChanges(productionHtml('android'));
  for (const script of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
    if (script[1].trim()) new vm.Script(script[1]);
  }
  assert.doesNotMatch(html, /s4Hint\('매니 1\.45'\)/);
  assert.match(html, /id="native-settings-btn">앱 정보/);
  assert.match(html, /id="native-subscription-btn">매니 구독/);
  assert.match(html, /알림 수신 설정/);
  assert.match(productionHtml('ios'), /s4Hint\('매니 1\.45'\)/);
});

test('the owner can send a test from notification settings without changing the enabled state', async () => {
  const html = applyAndroidAppInfoChanges(productionHtml('android'));
  const slice = (start, end) => html.slice(html.indexOf(start), html.indexOf(end, html.indexOf(start)));
  const dom = new JSDOM('<!doctype html><body></body>', {runScripts: 'outside-only'});
  try {
    const {window} = dom;
    const actions = [];
    window.state = {role: 'storeOwner', pushSubscribed: true, pushBusy: false};
    window.maneeLoadGuard = () => () => true;
    window.escapeHtml = String;
    window.showToast = () => {};
    window.render = () => {};
    window.subscribeToPush = () => actions.push('enable');
    window.unsubscribeFromPush = () => actions.push('disable');
    window.MANEE_NATIVE = {
      async push(action) {
        actions.push(action);
        throw Error('테스트 알림 전송 실패');
      },
    };
    window.eval(slice('  function renderPushSettings144(){', '  function s4SettingBody(t){'));
    window.eval(slice('  async function nativeAndroidPushAction(action){', '  async function refreshPushSubStatus(){'));
    window.document.body.innerHTML = window.renderPushSettings144();
    window.eval(slice('    document.getElementById("owner-push-test-btn")?.addEventListener', "    app.querySelectorAll('[data-calendar-weekday]')"));
    window.document.getElementById('owner-push-test-btn').click();
    await settle();
    assert.deepEqual(actions, ['test']);
    assert.equal(window.state.pushSubscribed, true);
    assert.match(window.renderPushSettings144(), /테스트 알림 전송 실패/);
    window.document.getElementById('owner-push-toggle-btn').click();
    assert.deepEqual(actions, ['test', 'disable']);
    window.state.pushBusy = true;
    assert.match(window.renderPushSettings144(), /id="owner-push-test-btn" disabled/);
    window.state.role = 'staff';
    assert.doesNotMatch(window.renderPushSettings144(), /owner-push-test-btn/);
  } finally {
    dom.window.close();
  }
});
