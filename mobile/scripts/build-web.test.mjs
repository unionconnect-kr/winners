import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
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

test('Android only builds staging and cannot invoke Apple billing or APNs', () => {
  assert.notEqual(spawnSync(process.execPath, ['scripts/build-web.mjs', 'production', 'android'], { cwd: mobile }).status, 0);
  assert.notEqual(spawnSync(process.execPath, ['scripts/build-web.mjs', 'staging', 'unknown'], { cwd: mobile }).status, 0);
  execFileSync(process.execPath, ['scripts/build-web.mjs', 'staging', 'android'], { cwd: mobile });
  const info = JSON.parse(read('www/build-info.json'));
  assert.equal(info.environment, 'staging');
  assert.equal(info.platform, 'android');
  const native = read('www/native.js');
  assert.doesNotMatch(native, /ManeeStoreKit|ios-billing|ios-push|manee_ios_push|PushNotifications/);
  assert.match(native, /Geolocation/);
  const html = read('www/index.html');
  assert.match(html, /테스트 앱 안내/);
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
