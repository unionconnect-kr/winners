import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

if (process.argv[2] !== 'android' || process.argv[3] !== 'production') {
  throw Error('Specify android production explicitly');
}

const mobile = fileURLToPath(new URL('..', import.meta.url));
execFileSync(process.execPath, ['scripts/build-release154.mjs', 'android', 'production'], {
  cwd: mobile,
  stdio: 'inherit',
});

const infoPath = resolve(mobile, 'www/build-info.json');
const info = JSON.parse(readFileSync(infoPath, 'utf8'));
const updatedInfo = {...info, versionName: '1.55', versionCode: 56, releaseVersion: '1.55', sourceVersion: '1.54'};
writeFileSync(infoPath, JSON.stringify(updatedInfo, null, 2) + '\n');
