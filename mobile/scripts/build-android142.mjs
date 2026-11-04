import {readFileSync,writeFileSync,cpSync,rmSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {hardenUi} from '../../scripts/harden-ui.mjs';
import {adaptIos139,adaptIos139Social} from './adapt-ios139.mjs';
import {secureAuthHtml} from './secure-auth-html.mjs';
const mobile=resolve(dirname(fileURLToPath(import.meta.url)),'..');
if(process.argv[2]!=='staging')throw Error('Android 1.42 is staging-only.');
const assets=resolve(mobile,'release139/assets'),out=resolve(mobile,'www');
const info=JSON.parse(readFileSync(resolve(assets,'build-info.json'),'utf8'));
if(info.environment!=='staging'||info.projectRef!=='obpkzecgswnfuyhwvncd'||info.versionCode!==40)throw Error('Unexpected source baseline');
// The same archived JS bridge used by 1.39–1.41, with its social listener,
// geolocation, notifications, billing and file adapter. Native classes are
// rebuilt from source, including the new Keystore plugin.
const bridge=readFileSync(resolve(mobile,'release139/android-native.js'),'utf8');
const baselineNativeSha256=createHash('sha256').update(bridge).digest('hex');
if(baselineNativeSha256!=='a99b6ef582408bd28d5aa6c507982a25c2c7f7640b14f5195cfbeea97bce5440')throw Error('Unexpected archived Android bridge');
rmSync(out,{recursive:true,force:true});mkdirSync(out,{recursive:true});cpSync(assets,out,{recursive:true});
const html=hardenUi(adaptIos139(readFileSync(resolve(assets,'index.html'),'utf8'),'android')).replaceAll('매니 1.39','매니 1.42').replaceAll('매니 1.40','매니 1.42');
writeFileSync(resolve(out,'index.html'),secureAuthHtml(html));
writeFileSync(resolve(out,'social-auth.js'),adaptIos139Social(readFileSync(resolve(assets,'social-auth.js'),'utf8'),'android'));
const css=readFileSync(resolve(mobile,'src/ios-ui.css'),'utf8')
 .replace('/* iPhone presentation for every role; keep the archived Android source intact. */','/* Shared input and sheet corrections; Android system insets remain native. */')
 .replaceAll('--ios-','--android-').replaceAll('.ios-test-banner','.android-test-banner')
 .replace('env(safe-area-inset-top,0px)','0px').replace('env(safe-area-inset-bottom,0px)','0px');
writeFileSync(resolve(out,'android-ui.css'),css);
mkdirSync(resolve(out,'vendor'),{recursive:true});
cpSync(resolve(mobile,'node_modules/xlsx-js-style/dist/xlsx.bundle.js'),resolve(out,'vendor/xlsx.bundle.js'));
cpSync(resolve(mobile,'node_modules/@supabase/supabase-js/dist/umd/supabase.js'),resolve(out,'vendor/supabase.js'));
const guard=await build({stdin:{contents:"import {guardAndroidSocial} from './src/android-social-guard.js'; guardAndroidSocial(window.MANEE_SOCIAL_NATIVE,new URL(window.MANEE_CONFIG.supabaseUrl).origin);",resolveDir:mobile},bundle:true,format:'iife',target:'chrome100',minify:true,write:false});
writeFileSync(resolve(out,'native.js'),bridge+'\n'+guard.outputFiles[0].text);
await build({entryPoints:[resolve(mobile,'src/secure-auth-bootstrap.js')],bundle:true,format:'iife',target:'chrome100',outfile:resolve(out,'secure-auth.js'),minify:true});
writeFileSync(resolve(out,'build-info.json'),JSON.stringify({...info,versionName:'1.42-sector1-4-test',versionCode:43,buildDate:'2026-11-04',sourceAndroidVersion:40,sourceIosBuild:'1.14.1',nativeAuthStorage:'keystore-v1',baselineNativeSha256,servicesReady:false},null,2)+'\n');
console.log('Prepared complete Android 1.42 staging assets for a source-built native shell.');
