import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { checkConnection } from './ios-qa-connection.mjs';

// Operator-authorized overnight upload of the exact reviewed QA artifact.
// The workflow verifies the fixed run, source SHA and artifact digest before keys are exposed.
// No review, invitations, permissions or purchases are changed.
export async function uploadTestFlight(env, ipa, {
  check = checkConnection, run = spawnSync, platform = process.platform,
} = {}) {
  if (!['push','workflow_dispatch'].includes(env.GITHUB_EVENT_NAME) || env.GITHUB_REF !== 'refs/heads/main' ||
      env.GITHUB_WORKFLOW !== 'Upload reviewed iOS QA 1.7.1' ||
      env.MANEE_AUTHORIZED_QA_UPLOAD !== 'ios-20261016-1.7.1' ||
      env.MANEE_UPLOAD_TESTFLIGHT !== 'true' || env.GITHUB_REPOSITORY !== 'unionconnect-kr/winners') {
    throw Error('UPLOAD_NOT_REQUESTED');
  }
  if (platform !== 'darwin' || !env.RUNNER_TEMP || !ipa?.endsWith('.ipa')) throw Error('INVALID_UPLOAD_CONTEXT');
  await check(env); // Authenticate the existing ASC key and pin the destination app.
  const dir = mkdtempSync(join(env.RUNNER_TEMP, 'manee-upload-'));
  try {
    mkdirSync(join(dir, 'private_keys'), { mode: 0o700 });
    writeFileSync(join(dir, 'private_keys', `AuthKey_${env.ASC_KEY_ID.trim()}.p8`),
      env.ASC_PRIVATE_KEY.trim() + '\n', { mode: 0o600 });
    // altool reads ./private_keys. Avoid carrying any credentials in the child env.
    const childEnv = Object.fromEntries(Object.entries(env).filter(([key]) =>
      ['PATH', 'HOME', 'TMPDIR', 'DEVELOPER_DIR', 'LANG'].includes(key)));
    const args = ['-f', resolve(ipa), '-t', 'ios', '--apiKey', env.ASC_KEY_ID.trim(),
      '--apiIssuer', env.ASC_ISSUER_ID.trim(), '--output-format', 'json'];
    for (const operation of ['--validate-app', '--upload-app']) {
      const result = run('xcrun', ['altool', operation, ...args], {
        cwd: dir, env: childEnv, encoding: 'utf8', timeout: 20 * 60 * 1000,
        maxBuffer: 4 * 1024 * 1024,
      });
      if (result.error || result.status !== 0) {
        // Apple output is not echoed: it may include paths, account data or tokens.
        throw Error(operation === '--validate-app' ? 'APPLE_IPA_VALIDATION_FAILED' : 'APPLE_IPA_UPLOAD_FAILED');
      }
    }
    return { uploaded: true, appId: '6820833544', processing: 'pending', reviewSubmitted: false };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { console.log(JSON.stringify(await uploadTestFlight(process.env, process.argv[2]))); }
  catch (error) {
    console.error(/^(UPLOAD_NOT_REQUESTED|INVALID_UPLOAD_CONTEXT|APPLE_[A-Z_]+(?:_\d{3})?|MISSING_ASC_[A-Z_]+|INVALID_ASC_[A-Z_]+)$/.test(error.message)
      ? error.message : 'TESTFLIGHT_UPLOAD_FAILED');
    process.exitCode = 1;
  }
}
