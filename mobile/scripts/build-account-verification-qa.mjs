import {execFileSync} from 'node:child_process';
import {copyFileSync, readFileSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Script} from 'node:vm';
import {installEmailVerification} from './email-verification-html.mjs';
import {
  enableAccountVerificationConfig,
  installAccountVerificationGate,
  installAccountVerificationReauth,
} from './account-verification-html.mjs';

const [platform, environment, optIn] = process.argv.slice(2);
if (process.argv.length !== 5 || platform !== 'android' || environment !== 'staging' || optIn !== '--account-verification-gate') {
  throw Error('Specify android staging --account-verification-gate explicitly.');
}

const stagingRef = 'obpkzecgswnfuyhwvncd';
const productionRef = 'bhwuuxcrzxespkjlmqxr';
const mobile = fileURLToPath(new URL('..', import.meta.url));
execFileSync(process.execPath, ['scripts/build-feedback144.mjs', 'android', 'staging'], {
  cwd: mobile,
  stdio: 'inherit',
});

const output = resolve(mobile, 'www');
const read = name => readFileSync(resolve(output, name), 'utf8');
const write = (name, value) => writeFileSync(resolve(output, name), value);

function readStagingConfig(source) {
  const match = /^window\.MANEE_CONFIG\s*=\s*Object\.freeze\(([\s\S]+)\);\s*$/.exec(source);
  if (!match || source.includes(productionRef)) throw Error('Account verification QA requires isolated staging configuration.');
  const config = JSON.parse(match[1]);
  if (config.environment !== 'staging' || config.projectRef !== stagingRef || config.supabaseUrl !== `https://${stagingRef}.supabase.co`) {
    throw Error('Account verification QA refuses any backend except MANEE staging.');
  }
  return config;
}

const info = JSON.parse(read('build-info.json'));
if (info.platform !== 'android' || info.environment !== 'staging' || info.projectRef !== stagingRef ||
    info.versionCode !== 45 || info.nativeAuthStorage !== 'keystore-v1' ||
    info.pushEnabled !== false || info.signupCheckoutEnabled !== false || info.billingEnabled === true) {
  throw Error('Unexpected Android staging QA base or service configuration.');
}

const baseConfig = read('app-config.js');
if (readStagingConfig(baseConfig).accountVerificationEnabled === true) {
  throw Error('The default staging build already enables account verification.');
}
const config = enableAccountVerificationConfig(baseConfig);
const qaConfig = readStagingConfig(config);
if (qaConfig.accountVerificationEnabled !== true || qaConfig.accountVerificationPlatform !== 'android') {
  throw Error('The account verification QA opt-in is missing.');
}

const html = installAccountVerificationGate(installEmailVerification(read('index.html')));
const social = installAccountVerificationReauth(read('social-auth.js'));
for (const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
  if (match[1].trim()) new Script(match[1]);
}
new Script(social);

write('app-config.js', config);
write('index.html', html);
write('social-auth.js', social);
for (const asset of ['email-verification.js', 'email-verification.css']) {
  copyFileSync(resolve(mobile, 'src', asset), resolve(output, asset));
}
write('build-info.json', JSON.stringify({...info, candidate: 'account-verification-qa', accountVerificationEnabled: true}, null, 2) + '\n');
console.log('Prepared opt-in Android staging assets for account verification QA.');
