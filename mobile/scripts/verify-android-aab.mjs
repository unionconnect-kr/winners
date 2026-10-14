import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { verifyAndroidAssets } from './verify-android-build.mjs';
const aab = resolve(process.argv[2] || 'android/app/build/outputs/bundle/release/app-release.aab');
const unpack = path => execFileSync('unzip', ['-p', aab, path], {encoding:'utf8',maxBuffer:8*1024*1024});
const entries = execFileSync('unzip',['-Z1',aab],{encoding:'utf8'}).trim().split('\n');
assert.ok(entries.includes('base/manifest/AndroidManifest.xml'));
assert.ok(entries.includes('BundleConfig.pb'));
verifyAndroidAssets({environment:'production',firebaseProject:'manee-production-3eafa',
  info:JSON.parse(unpack('base/assets/public/build-info.json')),
  appConfig:unpack('base/assets/public/app-config.js'),
  environments:JSON.parse(readFileSync(new URL('../../config/environments.json',import.meta.url),'utf8'))});
assert.doesNotMatch(unpack('base/assets/public/index.html'), /매니 Android 테스트 · 테스트 데이터만 입력해 주세요/);
assert.doesNotMatch(unpack('base/assets/public/native.js'), /ManeeStoreKit|ios-billing|ios-push/);
const verified = execFileSync('jarsigner',['-J-Duser.language=en','-verify',aab],{encoding:'utf8'});
assert.match(verified,/jar verified\./);
assert.doesNotMatch(verified,/unsigned entries|jar is unsigned/);
const certificate = execFileSync('keytool',['-J-Duser.language=en','-printcert','-jarfile',aab],{encoding:'utf8'});
assert.doesNotMatch(certificate,/CN=Android Debug/i);
const actual = certificate.match(/SHA256:\s*([A-F0-9:]+)/i)?.[1].replaceAll(':','').toUpperCase();
const expected = (process.env.MANEE_ANDROID_UPLOAD_CERT_SHA256 || '').replaceAll(':','').toUpperCase();
assert.match(expected,/^[A-F0-9]{64}$/,'Configure the public upload certificate SHA-256.');
assert.equal(actual,expected,'Bundle signature does not match the expected upload certificate.');
console.log('Verified signed production-backend AAB for Play internal setup; public rollout and billing remain disabled.');
