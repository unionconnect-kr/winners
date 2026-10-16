import {makeToken} from './ios-qa-connection.mjs';
import {pathToFileURL} from 'node:url';
const origin='https://api.appstoreconnect.apple.com',appId='6820833544';
export async function readiness(env,{request=fetch,token=()=>makeToken(env),wait=ms=>new Promise(r=>setTimeout(r,ms)),attempts=6}={}){
 async function get(path){
  const r=await request(origin+path,{method:'GET',redirect:'error',signal:AbortSignal.timeout(20000),headers:{Authorization:'Bearer '+token(),Accept:'application/json'}});
  return r.ok?{status:r.status,data:await r.json()}:{status:r.status};
 }
 const identity=await get('/v1/apps/'+appId+'?fields%5Bapps%5D=bundleId');
 if(identity.data?.data?.attributes?.bundleId!=='kr.co.manee.app')throw Error('APPLE_QA_IDENTITY_UNVERIFIED');
 let build;
 for(let i=0;i<attempts;i++){
  const r=await get('/v1/builds?filter%5Bapp%5D='+appId+'&filter%5Bversion%5D=1.8.1&include=buildBetaDetail&limit=10');
  if(r.status!==200)throw Error('APPLE_QA_BUILD_HTTP_'+r.status);
  const rows=r.data?.data||[];if(rows.length>1)throw Error('APPLE_QA_BUILD_AMBIGUOUS');
  const row=rows[0],beta=(r.data?.included||[]).find(x=>x.type==='buildBetaDetails');
  build=row?{version:row.attributes?.version,processingState:row.attributes?.processingState,
   usesNonExemptEncryption:row.attributes?.usesNonExemptEncryption,internalBuildState:beta?.attributes?.internalBuildState,
   externalBuildState:beta?.attributes?.externalBuildState}:null;
  if(build&&build.processingState!=='PROCESSING')break;
  if(i+1<attempts)await wait(30000);
 }
 const groupResult=await get('/v1/apps/'+appId+'/subscriptionGroups?include=subscriptions&limit=50');
 const subscriptions=[];
 for(const row of (groupResult.data?.included||[]).filter(x=>x.type==='subscriptions').slice(0,10)){
  if(!/^\d+$/.test(row.id))continue;
  const offers=await get('/v1/subscriptions/'+row.id+'/introductoryOffers?limit=50');
  const prices=await get('/v1/subscriptions/'+row.id+'/prices?include=subscriptionPricePoint,territory&limit=200');
  subscriptions.push({productId:row.attributes?.productId,state:row.attributes?.state,period:row.attributes?.subscriptionPeriod,
   familySharable:row.attributes?.familySharable,
   introductoryOffersHttpStatus:offers.status,introductoryOffers:(offers.data?.data||[]).map(x=>({duration:x.attributes?.duration,numberOfPeriods:x.attributes?.numberOfPeriods,mode:x.attributes?.mode,territory:x.relationships?.territory?.data?.id})),
   pricesHttpStatus:prices.status,pricePoints:(prices.data?.included||[]).filter(x=>x.type==='subscriptionPricePoints').map(x=>({customerPrice:x.attributes?.customerPrice,territory:x.relationships?.territory?.data?.id})),
  });
 }
 const betaGroups=await get('/v1/apps/'+appId+'/betaGroups?limit=50');
 return {appId,build,subscriptionCatalogHttpStatus:groupResult.status,subscriptions,
  betaGroupsHttpStatus:betaGroups.status,betaGroups:(betaGroups.data?.data||[]).map(x=>({name:x.attributes?.name,isInternalGroup:x.attributes?.isInternalGroup})),
  invitationSent:false,reviewSubmitted:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{console.log(JSON.stringify(await readiness(process.env),null,2));}
 catch(e){console.error(/^APPLE_QA_[A-Z_]+(?:_\d{3})?$/.test(e.message)?e.message:'APPLE_QA_READ_FAILED');process.exitCode=1;}
}
