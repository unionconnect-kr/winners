import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
if(process.argv[2]!=='android'||process.argv[3]!=='production')throw Error('Specify android production');
execFileSync(process.execPath,['scripts/build-release158.mjs','android','production'],{cwd:new URL('..',import.meta.url),stdio:'inherit'});
execFileSync(process.execPath,['scripts/verify-release158.mjs','android'],{cwd:new URL('..',import.meta.url),stdio:'inherit'});
const out=new URL('../www/build-info.json',import.meta.url),info=JSON.parse(readFileSync(out,'utf8'));
writeFileSync(out,JSON.stringify({...info,versionName:'1.59',versionCode:60,releaseVersion:'1.59'},null,2)+'\n');
