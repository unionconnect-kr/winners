import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const mobile=fileURLToPath(new URL('..',import.meta.url));
const env={...process.env,MANEE_ANDROID_RELEASE_PURPOSE:'paid-pilot'};
execFileSync(process.execPath,['scripts/build-web.mjs','production','android'],{cwd:mobile,env,stdio:'inherit'});
execFileSync('npm',['run','sync:android'],{cwd:mobile,env,stdio:'inherit'});
execFileSync('./gradlew',['bundleRelease'],{cwd:fileURLToPath(new URL('../android/',import.meta.url)),env,stdio:'inherit'});
execFileSync(process.execPath,['scripts/verify-android-aab.mjs','--paid-pilot'],{cwd:mobile,env,stdio:'inherit'});
