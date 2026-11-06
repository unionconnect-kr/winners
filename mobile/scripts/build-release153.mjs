import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

const mobile=fileURLToPath(new URL('..',import.meta.url));
if(process.argv[2]!=='android'||process.argv[3]!=='production')throw Error('Specify android production explicitly');
execFileSync(process.execPath,['scripts/build-release152.mjs','android','production'],{cwd:mobile,stdio:'inherit'});
const infoPath=resolve(mobile,'www/build-info.json');
const info=JSON.parse(readFileSync(infoPath,'utf8'));
writeFileSync(infoPath,JSON.stringify({...info,versionName:'1.53',versionCode:54,releaseVersion:'1.53',sourceVersion:'1.52'},null,2)+'\n');
