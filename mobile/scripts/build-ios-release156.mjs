import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

if (process.argv.length !== 4 || process.argv[2] !== 'ios' || process.argv[3] !== 'production') {
  throw Error('Specify ios production explicitly');
}

const mobile = fileURLToPath(new URL('..', import.meta.url));
execFileSync(process.execPath, ['scripts/build-release152.mjs', 'ios', 'production'], {
  cwd: mobile,
  env: {...process.env, MANEE_IOS_PUBLIC_RELEASE: 'true'},
  stdio: 'inherit',
});

const output = resolve(mobile, 'www');
const htmlPath = resolve(output, 'index.html');
let html = readFileSync(htmlPath, 'utf8');
function replaceOnce(before, after) {
  if (html.split(before).length !== 2) throw Error('iOS 1.56 release anchor changed: ' + before);
  html = html.replace(before, () => after);
}
replaceOnce("+s4Hint('매니 1.45')+", '+');
replaceOnce(
  'document.getElementById("native-settings-btn")?.addEventListener("click",()=>window.MANEE_NATIVE.openSettings());',
  'document.getElementById("native-settings-btn")?.addEventListener("click",()=>void window.MANEE_NATIVE.openAppInfo());',
);
replaceOnce(
  `+(state.pushSubscribed?'<button type="button" class="owner-primary" id="native-staff-push-test">테스트 알림 보내기</button>':'')`,
  '',
);
replaceOnce(
  "    document.getElementById('native-staff-push-test')?.addEventListener('click',()=>nativeAndroidPushAction('test'));\n",
  '',
);
writeFileSync(htmlPath, html);

const infoPath = resolve(output, 'build-info.json');
const info = JSON.parse(readFileSync(infoPath, 'utf8'));
const updatedInfo = {...info, versionName: '1.56', versionCode: 57, releaseVersion: '1.56', sourceVersion: '1.52', appInfoEnabled: true};
writeFileSync(infoPath, JSON.stringify(updatedInfo, null, 2) + '\n');
