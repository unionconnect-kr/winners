import {makeToken} from './ios-qa-connection.mjs';
import {pathToFileURL} from 'node:url';
const app='6820833544',group='b5982888-0280-4513-8f78-74ca63dcd342';
export const buildNumber='1.10.1',marketingVersion='1.39';
export function appleClient(env,{request=fetch,token=()=>makeToken(env)}={}){
 return async(path,body)=>{
  const r=await request('https://api.appstoreconnect.apple.com'+path,{method:body?'POST':'GET',redirect:'error',signal:AbortSignal.timeout(20000),headers:{Authorization:'Bearer '+token(),Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  if(!r.ok)throw Error('IOS139_HTTP_'+r.status);
  return r.status===204?null:await r.json();
 };
}
export async function exactBuild(api){
 const identity=await api('/v1/apps/'+app+'?fields%5Bapps%5D=bundleId');
 if(identity.data?.id!==app||identity.data?.attributes?.bundleId!=='kr.co.manee.app')throw Error('IOS139_WRONG_APP');
 const r=await api('/v1/builds?filter%5Bapp%5D='+app+'&filter%5Bversion%5D='+buildNumber+'&include=preReleaseVersion,buildBetaDetail&limit=10');
 const rows=r.data||[];if(rows.length>1)throw Error('IOS139_AMBIGUOUS_BUILD');
 const row=rows[0];if(!row)return null;
 const versionId=row.relationships?.preReleaseVersion?.data?.id;
 const version=r.included?.find(x=>x.type==='preReleaseVersions'&&x.id===versionId);
 if(row.type!=='builds'||row.attributes?.version!==buildNumber||version?.attributes?.version!==marketingVersion)throw Error('IOS139_WRONG_VERSION');
 const betaId=row.relationships?.buildBetaDetail?.data?.id;
 const beta=r.included?.find(x=>x.type==='buildBetaDetails'&&x.id===betaId);
 return {id:row.id,type:row.type,version:buildNumber,marketingVersion,processingState:row.attributes.processingState,usesNonExemptEncryption:row.attributes.usesNonExemptEncryption,
  internalBuildState:beta?.attributes?.internalBuildState,externalBuildState:beta?.attributes?.externalBuildState};
}
export async function connectBuild(env,{api=appleClient(env),wait=ms=>new Promise(r=>setTimeout(r,ms)),attempts=12}={}){
 if(env.GITHUB_REPOSITORY!=='unionconnect-kr/winners'||env.GITHUB_REF!=='refs/heads/main'||!['push','workflow_dispatch'].includes(env.GITHUB_EVENT_NAME)||env.GITHUB_WORKFLOW!=='Upload reviewed iOS 1.39 QA 1.10.1'||env.MANEE_AUTHORIZED_QA_UPLOAD!=='ios-20261103-1.39-1.10.1')throw Error('IOS139_NOT_REQUESTED');
 let build;
 for(let i=0;i<attempts;i++){
  build=await exactBuild(api);
  if(build&&build.processingState!=='PROCESSING')break;
  if(i+1<attempts)await wait(30000);
 }
 const groups=await api('/v1/apps/'+app+'/betaGroups?limit=50');
 const target=groups.data?.find(x=>x.id===group);
 if(target?.attributes?.isInternalGroup!==true||target.attributes.name!=='MANEE 내부 QA')throw Error('IOS139_WRONG_GROUP');
 let connected=false;
 if(build?.processingState==='VALID'&&build.usesNonExemptEncryption===false){
  const path='/v1/betaGroups/'+group+'/relationships/builds';
  const before=await api(path+'?limit=200');
  if(!before.data?.some(x=>x.type==='builds'&&x.id===build.id))await api(path,{data:[{type:'builds',id:build.id}]});
  const after=await api(path+'?limit=200');
  connected=after.data?.some(x=>x.type==='builds'&&x.id===build.id)===true;
  if(!connected)throw Error('IOS139_GROUP_NOT_VERIFIED');
  build=await exactBuild(api);
 }
 const testers=await api('/v1/betaGroups/'+group+'/betaTesters?limit=200');
 return {appId:app,build,internalGroupConnected:connected,internalTesterCount:testers.data?.length??0,
  groups:(groups.data||[]).map(x=>({name:x.attributes?.name,isInternalGroup:x.attributes?.isInternalGroup,publicLinkEnabled:x.attributes?.publicLinkEnabled,publicLink:x.attributes?.publicLinkEnabled?x.attributes.publicLink:undefined})),
  invitationSent:false,reviewSubmitted:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{console.log(JSON.stringify(await connectBuild(process.env),null,2));}
 catch(e){console.error(/^IOS139_[A-Z_]+(?:_\d{3})?$/.test(e.message)?e.message:'IOS139_STATUS_FAILED');process.exitCode=1;}
}
