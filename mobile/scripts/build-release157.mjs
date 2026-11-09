import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {applyAndroidAppInfoChanges} from './android-app-info-html.mjs';

if (process.argv[2] !== 'android' || process.argv[3] !== 'production') {
  throw Error('Specify android production explicitly');
}

const mobile = fileURLToPath(new URL('..', import.meta.url));
execFileSync(process.execPath, ['scripts/build-release155.mjs', 'android', 'production'], {
  cwd: mobile,
  stdio: 'inherit',
});

const output = resolve(mobile, 'www');
const htmlPath = resolve(output, 'index.html');
const html = readFileSync(htmlPath, 'utf8');
writeFileSync(htmlPath, applyAndroidAppInfoChanges(html, {includeTestNotification: false}));

const infoPath = resolve(output, 'build-info.json');
const info = JSON.parse(readFileSync(infoPath, 'utf8'));
const updatedInfo = {...info, versionName: '1.57', versionCode: 58, releaseVersion: '1.57', sourceVersion: '1.56'};
writeFileSync(infoPath, JSON.stringify(updatedInfo, null, 2) + '\n');
