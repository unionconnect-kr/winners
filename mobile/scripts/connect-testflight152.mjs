import {makeToken} from './check-apple-connection.mjs';
import {pathToFileURL} from 'node:url';

const app='6820833544', group='b5982888-0280-4513-8f78-74ca63dcd342';
const branch='refs/heads/codex/final-email-billing-152-20261106';
export async function connectTestFlight152(env, {
  request=fetch, token=()=>makeToken(env),
  wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)), attempts=12,
}={}) {
  if(env.GITHUB_REPOSITORY!=='unionconnect-kr/winners'||env.GITHUB_REF!==branch||
    env.GITHUB_EVENT_NAME!=='push'||env.MANEE_INTERNAL_BUILD!=='ios-20261106-1.52'||
    env.GITHUB_WORKFLOW_REF!==`unionconnect-kr/winners/.github/workflows/mobile152-release.yml@${branch}`||
    !/^[1-9]\d*$/.test(env.GITHUB_RUN_NUMBER||'')||!/^[1-9]\d*$/.test(env.GITHUB_RUN_ATTEMPT||'')) {
    throw Error('INTERNAL_CONNECT_NOT_REQUESTED');
  }
  const version=`152.${env.GITHUB_RUN_NUMBER}.${env.GITHUB_RUN_ATTEMPT}`;
  async function api(path,body) {
    const response=await request('https://api.appstoreconnect.apple.com'+path,{
      method:body?'POST':'GET', redirect:'error', signal:AbortSignal.timeout(20000),
      headers:{Authorization:'Bearer '+token(),Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},
      ...(body?{body:JSON.stringify(body)}:{}),
    });
    if(!response.ok)throw Error('INTERNAL_CONNECT_HTTP_'+response.status);
    return response.status===204?null:await response.json();
  }
  const identity=await api('/v1/apps/'+app+'?fields%5Bapps%5D=bundleId');
  if(identity.data?.id!==app||identity.data.attributes?.bundleId!=='kr.co.manee.app')throw Error('INTERNAL_CONNECT_WRONG_APP');
  const groups=await api('/v1/apps/'+app+'/betaGroups?limit=50');
  const target=groups.data?.find(x=>x.id===group);
  if(target?.attributes?.isInternalGroup!==true||target.attributes.name!=='MANEE 내부 QA')throw Error('INTERNAL_CONNECT_WRONG_GROUP');
  let build;
  for(let at=0;at<attempts;at++) {
    const result=await api('/v1/builds?filter%5Bapp%5D='+app+'&filter%5Bversion%5D='+version+'&limit=10');
    if(result.data?.length>1)throw Error('INTERNAL_CONNECT_AMBIGUOUS_BUILD');
    build=result.data?.[0];
    if(build&&build.attributes?.processingState!=='PROCESSING')break;
    if(at+1<attempts)await wait(30000);
  }
  if(build?.type!=='builds'||!/^[a-f0-9-]{36}$/.test(build.id)||build.attributes?.version!==version||
    build.attributes.processingState!=='VALID'||build.attributes.usesNonExemptEncryption!==false) {
    throw Error('INTERNAL_CONNECT_BUILD_NOT_READY');
  }
  const release=await api('/v1/builds/'+build.id+'/preReleaseVersion');
  if(release.data?.attributes?.version!=='1.52'||release.data?.attributes?.platform!=='IOS')throw Error('INTERNAL_CONNECT_WRONG_VERSION');
  const path='/v1/betaGroups/'+group+'/relationships/builds';
  const before=await api(path+'?limit=200');
  if(!before.data?.some(x=>x.type==='builds'&&x.id===build.id))await api(path,{data:[{type:'builds',id:build.id}]});
  const after=await api(path+'?limit=200');
  if(!after.data?.some(x=>x.type==='builds'&&x.id===build.id))throw Error('INTERNAL_CONNECT_NOT_VERIFIED');
  let beta;
  for(let at=0;at<4;at++) {
    beta=await api('/v1/builds/'+build.id+'/buildBetaDetail');
    if(beta.data?.attributes?.internalBuildState==='IN_BETA_TESTING')break;
    if(at<3)await wait(15000);
  }
  return {appId:app,marketingVersion:'1.52',version,processingState:build.attributes.processingState,
    internalBuildState:beta.data?.attributes?.internalBuildState||'UNKNOWN',internalGroupConnected:true,
    invitationSent:false,reviewSubmitted:false};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {console.log(JSON.stringify(await connectTestFlight152(process.env)));}
  catch(error) {
    console.error(/^INTERNAL_CONNECT_[A-Z_]+(?:_\d{3})?$/.test(error.message)?error.message:'INTERNAL_CONNECT_FAILED');
    process.exitCode=1;
  }
}
