import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import vm from 'node:vm';

const mobile = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const root = resolve(mobile, '..');
const read = path => readFileSync(resolve(mobile, path), 'utf8');
test('build isolates environments and leaves canonical web/backend sources untouched', () => {
  const canonicalPaths = ['index.html', 'netlify/functions/lib/manee-environment.json'];
  const original = canonicalPaths.map(p => readFileSync(resolve(root, p), 'utf8'));
  assert.notEqual(spawnSync(process.execPath, ['scripts/build-web.mjs'], { cwd: mobile }).status, 0);
  for (const environment of ['production', 'staging']) {
    execFileSync(process.execPath, ['scripts/build-web.mjs', environment], { cwd: mobile });
    const sandbox = { window: {} };
    vm.runInNewContext(read('www/app-config.js'), sandbox);
    assert.equal(sandbox.window.MANEE_CONFIG.environment, environment);
    const html = read('www/index.html');
    assert.match(html, /const MANEE_STAFF_AUTH_ENABLED = true/);
    assert.doesNotMatch(html, /navigator\.geolocation|location\.origin|'"serviceWorker" in navigator'/);
    assert.doesNotMatch(html, /fetch\("\/\.netlify\/functions\//);
    assert.match(html, /window\.MANEE_GEOLOCATION\.getCurrentPosition/);
    assert.doesNotMatch(html, /cdn\.jsdelivr\.net/);
    if (environment === 'staging') {
      assert.match(html, /https:\/\/staging-services-disabled\.invalid\/\.netlify\/functions\//);
      assert.doesNotMatch(html, /https:\/\/winners-staffapp\.netlify\.app\/\.netlify\/functions\//);
    }
    for (const asset of ['native.js', 'vendor/supabase.js', 'vendor/xlsx.bundle.js', 'report-assets/monthly-report.js']) {
      assert.ok(existsSync(resolve(mobile, 'www', asset)));
    }
    for (const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
      if (match[1].trim()) new vm.Script(match[1]);
    }
  }
  canonicalPaths.forEach((p, i) => assert.equal(readFileSync(resolve(root, p), 'utf8'), original[i]));
});

test('Android production requires explicit internal setup; staging cannot invoke Apple services', () => {
  assert.notEqual(spawnSync(process.execPath, ['scripts/build-web.mjs', 'production', 'android'], { cwd: mobile }).status, 0);
  assert.notEqual(spawnSync(process.execPath, ['scripts/build-web.mjs', 'staging', 'unknown'], { cwd: mobile }).status, 0);
  execFileSync(process.execPath, ['scripts/build-web.mjs', 'staging', 'android'], { cwd: mobile });
  const info = JSON.parse(read('www/build-info.json'));
  assert.equal(info.environment, 'staging');
  assert.equal(info.platform, 'android');
  const native = read('www/native.js');
  assert.doesNotMatch(native, /ManeeStoreKit|ios-billing|ios-push|manee_ios_push/);
  assert.match(native, /Geolocation/);
  assert.match(native, /manee_android_push/);
  assert.match(native, /manee-android-push/);
  const html = read('www/index.html');
  assert.match(html, /테스트 앱 안내/);
  assert.match(html, /return nativeAndroidPushAction\("enable"\)/);
  assert.match(html, /return nativeAndroidPushAction\("disable"\)/);
  assert.doesNotMatch(html, /아이폰 구독·알림/);
  for (const name of ['askApp', 'startVoiceInput', 'autoFillFromPhoto']) {
    // Exercise the generated functions: unsupported services must return before any I/O.
    const start = html.indexOf(`function ${name}(){`);
    const guard = html.slice(start, html.indexOf('return;', start) + 7) + '}';
    const messages = [];
    vm.runInNewContext(`${guard}; ${name}();`, { showToast: message => messages.push(message) });
    assert.equal(messages.length, 1);
  }
  for (const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
    if (match[1].trim()) new vm.Script(match[1]);
  }
});


test('explicit Play internal setup bundles production Firebase and backend without test UI', () => {
  const path = resolve(mobile, 'android/app/src/release/google-services.json');
  const existed = existsSync(path);
  if (!existed) {
    mkdirSync(dirname(path), {recursive:true});
    writeFileSync(path, JSON.stringify({project_info:{project_id:'manee-production-3eafa',project_number:'123456'},
      client:[{client_info:{mobilesdk_app_id:'1:123456:android:fixture',android_client_info:{package_name:'kr.co.manee.app'}},
        api_key:[{current_key:'fixture-only'}]}]}));
  }
  try {
    execFileSync(process.execPath, ['scripts/build-android-internal.mjs'], {cwd:mobile});
    const info=JSON.parse(read('www/build-info.json'));
    assert.equal(info.environment,'production');
    assert.equal(info.androidPushProjectId,'manee-production-3eafa');
    assert.equal(info.releasePurpose,'play-internal-setup');
    assert.equal(info.billingEnabled,false);
    assert.doesNotMatch(read('www/index.html'),/매니 Android 테스트 · 테스트 데이터만 입력해 주세요|테스트 앱 안내/);
    assert.doesNotMatch(read('www/native.js'),/ManeeStoreKit|ios-billing|ios-push|매니 테스트 앱/);
    for (const match of read('www/index.html').matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
      if (match[1].trim()) new vm.Script(match[1]);
    }
  } finally {
    if (!existed) rmSync(path);
    execFileSync(process.execPath, ['scripts/build-web.mjs','staging','android'], {cwd:mobile});
  }
});
