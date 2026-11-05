import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { checkConnection } from './check-apple-connection.mjs';

// Explicit main upload or the user-requested 1.43 update workflow only. No review submission or tester invitations.
export async function uploadTestFlight(env, ipa, {
  check = checkConnection, run = spawnSync, platform = process.platform,
} = {}) {
  const manual = env.GITHUB_EVENT_NAME === 'workflow_dispatch' && env.GITHUB_REF === 'refs/heads/main';
  const matched143 = env.GITHUB_EVENT_NAME === 'push' && env.GITHUB_REF === 'refs/heads/codex/mobile-launch-143-20261104' &&
    env.GITHUB_WORKFLOW_REF === 'unionconnect-kr/winners/.github/workflows/mobile143.yml@refs/heads/codex/mobile-launch-143-20261104';
  const feedback144 = env.GITHUB_EVENT_NAME === 'push' && env.GITHUB_REF === 'refs/heads/codex/mobile-feedback-144-20261104' &&
    env.GITHUB_WORKFLOW_REF === 'unionconnect-kr/winners/.github/workflows/mobile144.yml@refs/heads/codex/mobile-feedback-144-20261104';
  const release145 = env.GITHUB_EVENT_NAME === 'push' && env.GITHUB_REF === 'refs/heads/codex/mobile-release-145-20261105' &&
    env.GITHUB_WORKFLOW_REF === 'unionconnect-kr/winners/.github/workflows/mobile145-release.yml@refs/heads/codex/mobile-release-145-20261105';
  const release146 = env.GITHUB_EVENT_NAME === 'push' && env.GITHUB_REF === 'refs/heads/codex/mobile-release-146-20261105' &&
    env.GITHUB_WORKFLOW_REF === 'unionconnect-kr/winners/.github/workflows/mobile146-release.yml@refs/heads/codex/mobile-release-146-20261105';
  const release147 = env.GITHUB_EVENT_NAME === 'push' && env.GITHUB_REF === 'refs/heads/codex/mobile-release-147-20261105' &&
    env.GITHUB_WORKFLOW_REF === 'unionconnect-kr/winners/.github/workflows/mobile147-release.yml@refs/heads/codex/mobile-release-147-20261105';
  const release148 = env.GITHUB_EVENT_NAME === 'push' && env.GITHUB_REF === 'refs/heads/codex/mobile-release-148-20261105' &&
    env.GITHUB_WORKFLOW_REF === 'unionconnect-kr/winners/.github/workflows/mobile148-release.yml@refs/heads/codex/mobile-release-148-20261105';
  const release149 = env.GITHUB_EVENT_NAME === 'push' && env.GITHUB_REF === 'refs/heads/codex/mobile-release-149-20261105' &&
    env.GITHUB_WORKFLOW_REF === 'unionconnect-kr/winners/.github/workflows/mobile149-release.yml@refs/heads/codex/mobile-release-149-20261105';
  const release150 = env.GITHUB_EVENT_NAME === 'push' && env.GITHUB_REF === 'refs/heads/codex/mobile-release-150-20261105' &&
    env.GITHUB_WORKFLOW_REF === 'unionconnect-kr/winners/.github/workflows/mobile150-release.yml@refs/heads/codex/mobile-release-150-20261105';
  const release152 = env.GITHUB_EVENT_NAME === 'push' && env.GITHUB_REF === 'refs/heads/codex/final-email-billing-152-20261106' &&
    env.GITHUB_WORKFLOW_REF === 'unionconnect-kr/winners/.github/workflows/mobile152-release.yml@refs/heads/codex/final-email-billing-152-20261106';
  if ((!manual && !matched143 && !feedback144 && !release145 && !release146 && !release147 && !release148 && !release149 && !release150 && !release152) ||
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
