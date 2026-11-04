import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { androidFirebaseProject } from './android-firebase-config.mjs';

function fixture(t, projectId, packageName) {
  const dir = mkdtempSync(join(tmpdir(), 'manee-firebase-'));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  const file = join(dir, 'google-services.json');
  writeFileSync(file, JSON.stringify({project_info: {project_id: projectId, project_number: '123456'},
    client: [{client_info: {mobilesdk_app_id: '1:123456:android:fixture',
      android_client_info: {package_name: packageName}}, api_key: [{current_key: 'test-fixture-only'}]}]}));
  return file;
}
test('config-free builds are permitted only for staging', t => {
  const absent = fixture(t, 'unused', 'unused') + '.absent';
  assert.equal(androidFirebaseProject(absent, 'staging'), null);
  assert.throws(() => androidFirebaseProject(absent, 'production'), /requires/);
  assert.throws(() => androidFirebaseProject(absent, 'typo'), /explicitly/);
});
test('production and staging configurations cannot be interchanged', t => {
  const staging = fixture(t, 'manee-staging', 'kr.co.manee.app.staging');
  const production = fixture(t, 'manee-production-3eafa', 'kr.co.manee.app');
  assert.equal(androidFirebaseProject(staging), 'manee-staging');
  assert.equal(androidFirebaseProject(production, 'production'), 'manee-production-3eafa');
  assert.throws(() => androidFirebaseProject(staging, 'production'), /must match/);
  assert.throws(() => androidFirebaseProject(production, 'staging'), /must match/);
});
test('matching package in an unrelated Firebase project is rejected', t => {
  const unrelated = fixture(t, 'other-project', 'kr.co.manee.app');
  assert.throws(() => androidFirebaseProject(unrelated, 'production'), /must match/);
});
test('a production project with only the test package is rejected', t => {
  const mismatch = fixture(t, 'manee-production-3eafa', 'kr.co.manee.app.staging');
  assert.throws(() => androidFirebaseProject(mismatch, 'production'), /must match/);
});
