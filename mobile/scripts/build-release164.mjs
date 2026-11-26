import {execFileSync} from 'node:child_process';
import {readFileSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {bindStaffLookupApproval} from '../src/staff-lookup-approval.mjs';

export function installStaffLookupApproval(html) {
  const hook = '  function bindOwnerUIEvents(){';
  if (html.split(hook).length !== 2) throw Error('Expected one owner screen event hook');
  const context = '() => ({db, role: state.role, userId: state.authProfile?.user_id, storeId: currentStoreId(), storeName: state.store})';
  return html.replace(hook, () => '  ' + bindStaffLookupApproval.toString() + '\n' + hook +
    '\n    bindStaffLookupApproval(' + context + ');');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const platform = process.argv[2];
  if (!['android','ios'].includes(platform) || process.argv[3] !== 'production') {
    throw Error('Specify android|ios production');
  }
  execFileSync(process.execPath, ['scripts/build-release163.mjs', platform, 'production'], {
    cwd: new URL('..', import.meta.url), stdio: 'inherit'
  });
  const index = new URL('../www/index.html', import.meta.url);
  writeFileSync(index, installStaffLookupApproval(readFileSync(index, 'utf8')));
  const manifest = new URL('../www/build-info.json', import.meta.url);
  const info = JSON.parse(readFileSync(manifest, 'utf8'));
  const version = platform === 'ios' ? '1.58' : '1.64';
  writeFileSync(manifest, JSON.stringify({
    ...info, versionName: version, releaseVersion: version, versionCode: 65, storeAssistedUsernameRecovery: true
  }, null, 2) + '\n');
}
