import {makeToken} from './ios-qa-connection.mjs';
import {pathToFileURL} from 'node:url';
const app='6820833544',versionId='87063b6a-6afc-4384-a766-c493dbbcca1f';
const notificationUrl='https://winners-staffapp.netlify.app/.netlify/functions/ios-apple-notifications';
const fields=['contactEmail','contactFirstName','contactLastName','contactPhone','demoAccountName','demoAccountPassword'];
const present=v=>typeof v==='string'&&v.trim().length>0;
const safeId=v=>{if(!/^[a-f0-9-]{36}$/.test(v||''))throw Error('RELEASE_PREPARE_INVALID_ID');return v;};
// This prepares existing review metadata only. It never submits a review,
// accepts agreements, changes prices, enables checkout or adds testers.
export async function prepareRelease(env,{request=fetch,token=()=>makeToken(env)}={}){
 if(env.GITHUB_REPOSITORY!=='unionconnect-kr/winners'||env.GITHUB_REF!=='refs/heads/main'||env.GITHUB_EVENT_NAME!=='push'||env.GITHUB_WORKFLOW!=='Prepare exact iOS 1.8.1 release metadata'||env.MANEE_RELEASE_PREPARE!=='ios-20261016-1.8.1')throw Error('RELEASE_PREPARE_NOT_REQUESTED');
 async function api(path,method='GET',body){
  const response=await request('https://api.appstoreconnect.apple.com'+path,{method,redirect:'error',signal:AbortSignal.timeout(20000),headers:{Authorization:'Bearer '+token(),Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  if(!response.ok)throw Error('RELEASE_PREPARE_HTTP_'+response.status);
  return response.status===204?{}:await response.json();
 }
 const identity=(await api('/v1/apps/'+app)).data;
 if(identity?.id!==app||identity.attributes?.bundleId!=='kr.co.manee.app')throw Error('RELEASE_PREPARE_WRONG_APP');
 const version=(await api('/v1/appStoreVersions/'+versionId)).data;
 const owned=await api('/v1/apps/'+app+'/appStoreVersions?filter%5Bplatform%5D=IOS&limit=20');
 if(!owned.data?.some(x=>x.id===versionId)||version?.id!==versionId||version.attributes?.versionString!=='1.0'||version.attributes.appStoreState!=='PREPARE_FOR_SUBMISSION')throw Error('RELEASE_PREPARE_WRONG_VERSION');
 const builds=await api('/v1/builds?filter%5Bapp%5D='+app+'&filter%5Bversion%5D=1.8.1&limit=10');
 if(builds.data?.length!==1)throw Error('RELEASE_PREPARE_AMBIGUOUS_BUILD');
 const build=builds.data[0];safeId(build.id);
 if(build.type!=='builds'||build.attributes?.version!=='1.8.1'||build.attributes.processingState!=='VALID'||build.attributes.usesNonExemptEncryption!==false||build.attributes.expired===true)throw Error('RELEASE_PREPARE_BUILD_NOT_READY');
 const attributes={subscriptionStatusUrl:notificationUrl,subscriptionStatusUrlVersion:'V2',subscriptionStatusUrlForSandbox:notificationUrl,subscriptionStatusUrlVersionForSandbox:'V2'};
 for(const key of ['subscriptionStatusUrl','subscriptionStatusUrlForSandbox'])if(identity.attributes[key]&&identity.attributes[key]!==notificationUrl)throw Error('RELEASE_PREPARE_EXISTING_WEBHOOK_DIFFERS');
 if(Object.entries(attributes).some(([key,value])=>identity.attributes[key]!==value))await api('/v1/apps/'+app,'PATCH',{data:{type:'apps',id:app,attributes}});
 const current=await api('/v1/appStoreVersions/'+versionId+'/build');
 if(current.data?.id!==build.id)await api('/v1/appStoreVersions/'+versionId+'/relationships/build','PATCH',{data:{type:'builds',id:build.id}});
 const review=await api('/v1/appStoreVersions/'+versionId+'/appStoreReviewDetail');
 let reviewCopied=false,reviewReady=fields.every(k=>present(review.data?.attributes?.[k]));
 if(!reviewReady){
  const beta=(await api('/v1/apps/'+app+'/betaAppReviewDetail')).data?.attributes;
  // Reuse only the review account already supplied to Apple for this exact app.
  // Never put its values in source, output, artifacts or arbitrary error text.
  if(beta?.demoAccountRequired===true&&fields.every(k=>present(beta[k]))&&(!present(review.data?.attributes?.demoAccountName)||review.data.attributes.demoAccountName===beta.demoAccountName)){
   const attrs={demoAccountRequired:true,...Object.fromEntries(fields.map(k=>[k,review.data?.attributes?.[k]||beta[k]]))};
   if(present(review.data?.attributes?.notes))attrs.notes=review.data.attributes.notes;
   else if(present(beta.notes)&&!/40\s*(일|days)/i.test(beta.notes))attrs.notes=beta.notes;
   if(review.data){await api('/v1/appStoreReviewDetails/'+safeId(review.data.id),'PATCH',{data:{type:'appStoreReviewDetails',id:review.data.id,attributes:attrs}});}
   else await api('/v1/appStoreReviewDetails','POST',{data:{type:'appStoreReviewDetails',attributes:attrs,relationships:{appStoreVersion:{data:{type:'appStoreVersions',id:versionId}}}}});
   reviewCopied=true;
  }
 }
 const afterApp=(await api('/v1/apps/'+app)).data;
 const afterBuild=(await api('/v1/appStoreVersions/'+versionId+'/build')).data;
 const afterReview=(await api('/v1/appStoreVersions/'+versionId+'/appStoreReviewDetail')).data;
 if(Object.entries(attributes).some(([key,value])=>afterApp?.attributes?.[key]!==value)||afterBuild?.id!==build.id)throw Error('RELEASE_PREPARE_NOT_VERIFIED');
 reviewReady=fields.every(k=>present(afterReview?.attributes?.[k]))&&afterReview?.attributes?.demoAccountRequired===true;
 return {appId:app,version:'1.0',selectedBuild:'1.8.1',processingState:'VALID',notificationEndpointsVerified:true,notificationVersion:'V2',reviewAccountCopiedFromExistingBeta:reviewCopied,reviewAccountAndContactReady:reviewReady,reviewNotesPresent:present(afterReview?.attributes?.notes),reviewSubmitted:false,agreementsAccepted:false,checkoutEnabled:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{console.log(JSON.stringify(await prepareRelease(process.env)));}
 catch(e){console.error(/^RELEASE_PREPARE_[A-Z_]+(?:_\d{3})?$/.test(e.message)?e.message:'RELEASE_PREPARE_FAILED');process.exitCode=1;}
}
