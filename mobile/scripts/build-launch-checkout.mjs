// Integration candidate only. No production toggle or automatic upload.
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {build} from 'esbuild';
import {signupCheckoutHtml} from './signup-checkout-html.mjs';
const mobile=fileURLToPath(new URL('..',import.meta.url));
const platform=process.argv[2],environment=process.argv[3];
if(!['android','ios'].includes(platform)||environment!=='staging')throw Error('Specify android|ios staging. Checkout candidate cannot publish paid services.');
execFileSync(process.execPath,['scripts/build-launch143.mjs',platform,'staging'],{cwd:mobile,stdio:'inherit'});
const out=resolve(mobile,'www');
writeFileSync(resolve(out,'index.html'),signupCheckoutHtml(readFileSync(resolve(out,'index.html'),'utf8')));
if(platform==='android')await build({entryPoints:[resolve(mobile,'src/native-android-launch.js')],bundle:true,format:'iife',target:'chrome100',minify:true,
 define:{ANDROID_PAID_BILLING:'false',ANDROID_PRODUCTION:'false',ANDROID_FIREBASE_PROJECT:'null'},outfile:resolve(out,'native.js')});
const info=JSON.parse(readFileSync(resolve(out,'build-info.json'),'utf8'));
writeFileSync(resolve(out,'build-info.json'),JSON.stringify({...info,candidate:'account-checkout-integration',servicesReady:false,signupCheckoutEnabled:false},null,2)+'\n');
console.log('Account checkout candidate built; staging only, purchases and push remain disabled.');
