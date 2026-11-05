import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,copyFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
const mobile=fileURLToPath(new URL('..',import.meta.url));
const platform=process.argv[2];
if(!['android','ios'].includes(platform)||process.argv[3]!=='production')throw Error('Specify android|ios production explicitly');
execFileSync(process.execPath,['scripts/build-release145.mjs',platform,'production'],{cwd:mobile,stdio:'inherit'});
const out=resolve(mobile,'www');
let html=readFileSync(resolve(out,'index.html'),'utf8');
if(html.split('</head>').length!==2||html.split('</body>').length!==2)throw Error('Unexpected document anchors');
html=html.replace('</head>','<link rel="stylesheet" href="/username-recovery.css"></head>')
  .replace('</body>','<script src="/username-recovery.js"></script></body>');
writeFileSync(resolve(out,'index.html'),html);
for(const asset of ['username-recovery.js','username-recovery.css'])copyFileSync(resolve(mobile,'src',asset),resolve(out,asset));
const info=JSON.parse(readFileSync(resolve(out,'build-info.json'),'utf8'));
writeFileSync(resolve(out,'build-info.json'),JSON.stringify({...info,versionName:'1.46',versionCode:47,releaseVersion:'1.46',sourceVersion:'1.45',usernameRecoveryEnabled:true},null,2)+'\n');
console.log('Prepared production '+platform+' 1.46 with verified-phone username recovery.');
