// One version and baseline for both platforms. Staging artifacts remain QA builds.
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {launch143Html} from './launch143-html.mjs';
const mobile=fileURLToPath(new URL('..',import.meta.url));
const platform=process.argv[2],environment=process.argv[3];
if(!['android','ios'].includes(platform)||environment!=='staging')throw Error('Specify android|ios staging. Production promotion requires verified store offers and service parity.');
execFileSync(process.execPath,[`scripts/build-${platform==='android'?'android142':'ios139'}.mjs`,'staging'],{cwd:mobile,stdio:'inherit'});
const out=resolve(mobile,'www');
writeFileSync(resolve(out,'index.html'),launch143Html(readFileSync(resolve(out,'index.html'),'utf8'),platform));
if(platform==='ios'){
 const bridge=readFileSync(resolve(out,'native.js'),'utf8');
 writeFileSync(resolve(out,'native.js'),bridge.replaceAll('매니 1.39','매니 1.43'));
}
const info=JSON.parse(readFileSync(resolve(out,'build-info.json'),'utf8'));
writeFileSync(resolve(out,'build-info.json'),JSON.stringify({...info,platform,versionName:'1.43',versionCode:44,releaseVersion:'1.43',buildDate:'2026-11-04',promotion:{androidDays:60,iosMonths:2,requiresStoreSubscription:true,requiresConversionConsent:true},servicesReady:false},null,2)+'\n');
console.log(`Prepared matching ${platform} 1.43 staging build; no production release or store offer activation.`);
