import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {installSevenUpdates} from './seven-updates-html.mjs';
const platform=process.argv[2];if(!['ios','android'].includes(platform)||process.argv[3]!=='production')throw Error('Specify ios|android production');
execFileSync(process.execPath,['scripts/'+(platform==='ios'?'build-release157.mjs':'build-release162.mjs'),platform,'production'],{cwd:new URL('..',import.meta.url),stdio:'inherit'});
const out=new URL('../www/',import.meta.url);
writeFileSync(new URL('index.html',out),installSevenUpdates(readFileSync(new URL('index.html',out),'utf8')));
const p=new URL('build-info.json',out),info=JSON.parse(readFileSync(p,'utf8'));
writeFileSync(p,JSON.stringify({...info,versionName:platform==='ios'?'1.58':'1.63',versionCode:64,releaseVersion:platform==='ios'?'1.58':'1.63',storeTitle:'매니 - 우리가게 매니저',managerWorkConfirmation:true,payrollHalfHourApproval:true,ownerChangeNotifications:true,clientVersions:true,quietStartup:true,clockConfirmation:true,retiredPayrollSeparated:true},null,2)+'\n');
