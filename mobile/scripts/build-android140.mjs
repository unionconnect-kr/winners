import {readFileSync,writeFileSync,cpSync,rmSync,mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {adaptIos139,adaptIos139Social} from './adapt-ios139.mjs';
const mobile=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const baseline=process.argv[3];
if(process.argv[2]!=='staging'||!baseline)throw Error('Usage: build-android140.mjs staging EXTRACTED_139_PUBLIC_ASSETS');
const assets=resolve(mobile,'release139/assets'),out=resolve(mobile,'www');
const info=JSON.parse(readFileSync(resolve(assets,'build-info.json'),'utf8'));
if(info.environment!=='staging'||info.projectRef!=='obpkzecgswnfuyhwvncd'||info.versionCode!==40)throw Error('Unexpected baseline');
// Match each tracked source asset against the actual 1.39 APK before updating it.
for(const name of ['index.html','social-auth.js','owner-ui.css','app-config.js']){
 if(!readFileSync(resolve(assets,name)).equals(readFileSync(resolve(baseline,name))))throw Error('APK/source mismatch: '+name);
}
rmSync(out,{recursive:true,force:true});mkdirSync(out,{recursive:true});cpSync(baseline,out,{recursive:true});
writeFileSync(resolve(out,'index.html'),adaptIos139(readFileSync(resolve(assets,'index.html'),'utf8'),'android').replaceAll('매니 1.39','매니 1.40'));
writeFileSync(resolve(out,'social-auth.js'),adaptIos139Social(readFileSync(resolve(assets,'social-auth.js'),'utf8'),'android'));
// Android's native shell already supplies system-bar/keyboard insets.
const css=readFileSync(resolve(mobile,'src/ios-ui.css'),'utf8')
 .replace('/* iPhone presentation for every role; keep the archived Android source intact. */','/* Shared input and sheet corrections; Android system insets remain native. */')
 .replaceAll('--ios-','--android-').replaceAll('.ios-test-banner','.android-test-banner')
 .replace('env(safe-area-inset-top,0px)','0px').replace('env(safe-area-inset-bottom,0px)','0px');
writeFileSync(resolve(out,'android-ui.css'),css);
const bridge=readFileSync(resolve(baseline,'native.js'),'utf8');
const guard=await build({stdin:{contents:"import {guardAndroidSocial} from './src/android-social-guard.js'; guardAndroidSocial(window.MANEE_SOCIAL_NATIVE,new URL(window.MANEE_CONFIG.supabaseUrl).origin);",resolveDir:mobile},bundle:true,format:'iife',target:'chrome100',minify:true,write:false});
writeFileSync(resolve(out,'native.js'),bridge+'\n'+guard.outputFiles[0].text);
writeFileSync(resolve(out,'build-info.json'),JSON.stringify({...info,versionName:'1.40-sector1-4-test',versionCode:41,buildDate:'2026-11-04',sourceAndroidVersion:40,sourceIosBuild:'1.14.1',baselineNativeSha256:createHash('sha256').update(bridge).digest('hex')},null,2)+'\n');
console.log('Prepared Android 1.40 staging assets; existing Android native bridge preserved.');
