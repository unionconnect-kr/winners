import { execFileSync } from 'node:child_process';
execFileSync(process.execPath, ['scripts/build-web.mjs', 'production', 'android'], {
  cwd: new URL('..', import.meta.url), stdio: 'inherit',
  env: {...process.env, MANEE_ANDROID_RELEASE_PURPOSE: 'play-internal-setup'},
});
