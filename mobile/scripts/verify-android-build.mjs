import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { androidFirebaseProject } from './android-firebase-config.mjs';

export function verifyAndroidAssets({info, appConfig, environment, environments, firebaseProject}) {
  assert.ok(['staging', 'production'].includes(environment), 'Unknown build environment.');
  assert.equal(info.platform, 'android');
  assert.equal(info.environment, environment, 'Packaged assets belong to a different environment.');
  assert.equal(info.projectRef, environments[environment].projectRef);
  assert.equal(info.androidPushProjectId, firebaseProject);
  assert.ok(appConfig.includes(environments[environment].projectRef));
  assert.ok(!appConfig.includes(environments[environment === 'production' ? 'staging' : 'production'].projectRef));
  if (environment === 'production') {
    assert.equal(info.releasePurpose, 'play-internal-setup', 'Public release is not ready.');
    assert.equal(info.billingEnabled, false, 'Billing requires a separate verified release.');
    assert.equal(firebaseProject, 'manee-production-3eafa');
  }
}

export function verifyUploadEnvironment(env, exists = existsSync) {
  for (const name of ['MANEE_ANDROID_UPLOAD_KEYSTORE', 'MANEE_ANDROID_UPLOAD_STORE_PASSWORD',
    'MANEE_ANDROID_UPLOAD_KEY_ALIAS', 'MANEE_ANDROID_UPLOAD_KEY_PASSWORD']) {
    assert.ok(typeof env[name] === 'string' && env[name].length > 0, `Missing ${name}.`);
  }
  assert.ok(exists(env.MANEE_ANDROID_UPLOAD_KEYSTORE), 'Upload keystore file is missing.');
  assert.ok(!/(^|[/\\])debug\.keystore$/i.test(env.MANEE_ANDROID_UPLOAD_KEYSTORE), 'Debug signing is not permitted.');
  assert.notEqual(env.MANEE_ANDROID_UPLOAD_KEY_ALIAS.toLowerCase(), 'androiddebugkey', 'Debug signing is not permitted.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const environment = process.argv[2];
  const mobile = fileURLToPath(new URL('..', import.meta.url));
  const assets = resolve(mobile, 'android/app/src/main/assets/public');
  const firebaseProject = androidFirebaseProject(resolve(mobile, environment === 'production'
    ? 'android/app/src/release/google-services.json' : 'android/app/google-services.json'), environment);
  verifyAndroidAssets({environment, firebaseProject,
    info: JSON.parse(readFileSync(resolve(assets, 'build-info.json'), 'utf8')),
    appConfig: readFileSync(resolve(assets, 'app-config.js'), 'utf8'),
    environments: JSON.parse(readFileSync(resolve(mobile, '../config/environments.json'), 'utf8'))});
  if (environment === 'production') verifyUploadEnvironment(process.env);
  console.log(`Verified Android ${environment} assets${environment === 'production' ? ' and upload-signing inputs (internal setup only)' : ''}.`);
}
