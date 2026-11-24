import {makeToken} from '../../mobile/scripts/check-apple-connection.mjs';
import {pathToFileURL} from 'node:url';
import {writeFileSync} from 'node:fs';
const app='6820833544',marketing='1.57',buildNumber='157.8.1';
const branch='refs/heads/codex/manee-ios157-review-20261124';
export async function submitReview(env,{api,wait=ms=>new Promise(r=>setTimeout(r,ms))}={}){
 if(env.GITHUB_REPOSITORY!=='unionconnect-kr/winners'||env.GITHUB_REF!==branch||env.GITHUB_EVENT_NAME!=='push'||env.GITHUB_WORKFLOW_REF!==`unionconnect-kr/winners/.github/workflows/ios157-submit-review.yml@${branch}`||env.MANEE_SUBMIT_REVIEW!=='ios-1.57-157.8.1-auto-release')throw Error('REVIEW_NOT_AUTHORIZED');
 api??=async(method,path,body)=>{
  const r=await fetch('https://api.appstoreconnect.apple.com'+path,{method,redirect:'error',signal:AbortSignal.timeout(25000),headers:{Authorization:'Bearer '+makeToken(env),Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const data=r.status===204?null:await r.json();
  if(!r.ok){console.error(JSON.stringify({event:'apple_review_api_error',method,status:r.status,errors:data?.errors?.map(e=>({code:e.code,pointer:e.source?.pointer,parameter:e.source?.parameter}))}));throw Error('REVIEW_API_HTTP_'+r.status);}
  return data;
 };
 const get=p=>api('GET',p);
 const identity=await get('/v1/apps/'+app+'?fields%5Bapps%5D=bundleId');
 if(identity.data?.id!==app||identity.data.attributes?.bundleId!=='kr.co.manee.app')throw Error('REVIEW_WRONG_APP');
 const builds=await get('/v1/builds?filter%5Bapp%5D='+app+'&filter%5Bversion%5D='+buildNumber+'&limit=10');
 if(builds.data?.length!==1)throw Error('REVIEW_AMBIGUOUS_BUILD');
 const build=builds.data[0];
 if(build.attributes?.version!==buildNumber||build.attributes?.processingState!=='VALID'||build.attributes?.usesNonExemptEncryption!==false)throw Error('REVIEW_BUILD_NOT_READY');
 const pre=await get('/v1/builds/'+build.id+'/preReleaseVersion');
 if(pre.data?.attributes?.platform!=='IOS'||pre.data.attributes.version!==marketing)throw Error('REVIEW_WRONG_BUILD_VERSION');
 const versions=await get('/v1/apps/'+app+'/appStoreVersions?filter%5Bplatform%5D=IOS&filter%5BversionString%5D='+marketing+'&limit=10');
 if(versions.data?.length!==1)throw Error('REVIEW_AMBIGUOUS_VERSION');
 const id=versions.data[0].id,vpath='/v1/appStoreVersions/'+id;
 const readVersion=async()=>{const r=await get(vpath+'?include=build,appStoreVersionPhasedRelease');if(r.data?.id!==id||r.data?.attributes?.platform!=='IOS'||r.data.attributes.versionString!==marketing)throw Error('REVIEW_WRONG_VERSION');return r;};
 const v=await readVersion(),a=v.data.attributes;
 const phased=v.data.relationships?.appStoreVersionPhasedRelease?.data;
 if(phased&&v.included?.find(i=>i.id===phased.id)?.attributes?.phasedReleaseState!=='COMPLETE')throw Error('REVIEW_PHASED_RELEASE_PRESENT');
 const details=await get(vpath+'/appStoreReviewDetail'),d=details.data?.attributes;
 if(d?.demoAccountRequired!==true||d.demoAccountName!=='todtod07'||!d.demoAccountPassword||!d.notes?.includes('1–4 completion photos'))throw Error('REVIEW_DEMO_DETAILS_MISSING');
 const localizations=await get(vpath+'/appStoreVersionLocalizations?limit=50');
 if(!localizations.data?.some(i=>['ko','ko-KR'].includes(i.attributes?.locale)&&i.attributes.whatsNew?.includes('최대 4장')))throw Error('REVIEW_RELEASE_NOTES_MISSING');
 const rs=await get('/v1/apps/'+app+'/reviewSubmissions?filter%5Bplatform%5D=IOS&limit=50');
 if(rs.links?.next)throw Error('REVIEW_SUBMISSION_PAGINATION');
 let submission,items=[];
 for(const row of rs.data||[]){
  if(!['READY_FOR_REVIEW','WAITING_FOR_REVIEW','IN_REVIEW','UNRESOLVED_ISSUES'].includes(row.attributes?.state))continue;
  const list=await get('/v1/reviewSubmissions/'+row.id+'/items?include=appStoreVersion&limit=50');
  if(list.links?.next)throw Error('REVIEW_ITEM_PAGINATION');
  const matches=list.data?.length===1&&list.data[0].relationships?.appStoreVersion?.data?.id===id;
  if(list.data?.length&&!matches)throw Error('REVIEW_UNRELATED_ITEMS');
  if(submission)throw Error('REVIEW_MULTIPLE_ACTIVE_SUBMISSIONS');
  submission=row;items=list.data||[];
 }
 const queued=['WAITING_FOR_REVIEW','IN_REVIEW'];
 if(queued.includes(a.appStoreState)){
  if(!submission||!queued.includes(submission.attributes?.state)||!items.length||v.data.relationships?.build?.data?.id!==build.id||a.releaseType!=='AFTER_APPROVAL'||a.earliestReleaseDate)throw Error('REVIEW_QUEUED_STATE_MISMATCH');
  return {appId:app,version:marketing,build:buildNumber,appStoreVersionId:id,submissionId:submission.id,state:a.appStoreState,submissionState:submission.attributes.state,automaticRelease:true,allUsersImmediately:true,alreadySubmitted:true};
 }
 if(!['PREPARE_FOR_SUBMISSION','READY_FOR_REVIEW'].includes(a.appStoreState))throw Error('REVIEW_VERSION_NOT_EDITABLE');
 if(submission&&submission.attributes?.state!=='READY_FOR_REVIEW')throw Error('REVIEW_SUBMISSION_NOT_EDITABLE');
 if(a.releaseType!=='AFTER_APPROVAL'||a.earliestReleaseDate)await api('PATCH',vpath,{data:{type:'appStoreVersions',id,attributes:{releaseType:'AFTER_APPROVAL',earliestReleaseDate:null}}});
 if(v.data.relationships?.build?.data?.id!==build.id)await api('PATCH',vpath+'/relationships/build',{data:{type:'builds',id:build.id}});
 const selected=await readVersion();
 if(selected.data.relationships?.build?.data?.id!==build.id||selected.data.attributes?.releaseType!=='AFTER_APPROVAL'||selected.data.attributes?.earliestReleaseDate)throw Error('REVIEW_SELECTION_NOT_VERIFIED');
 if(!submission){const created=await api('POST','/v1/reviewSubmissions',{data:{type:'reviewSubmissions',attributes:{platform:'IOS'},relationships:{app:{data:{type:'apps',id:app}}}}});submission=created.data;}
 if(!submission?.id)throw Error('REVIEW_SUBMISSION_NOT_CREATED');
 if(!items.length)await api('POST','/v1/reviewSubmissionItems',{data:{type:'reviewSubmissionItems',relationships:{reviewSubmission:{data:{type:'reviewSubmissions',id:submission.id}},appStoreVersion:{data:{type:'appStoreVersions',id}}}}});
 const before=await get('/v1/reviewSubmissions/'+submission.id+'/items?include=appStoreVersion&limit=50');
 if(before.data?.length!==1||before.data[0].relationships?.appStoreVersion?.data?.id!==id)throw Error('REVIEW_ITEM_NOT_VERIFIED');
 await api('PATCH','/v1/reviewSubmissions/'+submission.id,{data:{type:'reviewSubmissions',id:submission.id,attributes:{submitted:true}}});
 for(let at=0;at<8;at++){
  const [version,current]=await Promise.all([readVersion(),get('/v1/reviewSubmissions/'+submission.id)]);
  const va=version.data.attributes,sa=current.data?.attributes;
  if(queued.includes(va.appStoreState)&&queued.includes(sa?.state)&&sa.submittedDate&&version.data.relationships?.build?.data?.id===build.id&&va.releaseType==='AFTER_APPROVAL'&&!va.earliestReleaseDate)return {appId:app,version:marketing,build:buildNumber,appStoreVersionId:id,submissionId:submission.id,state:va.appStoreState,submissionState:sa.state,submittedDate:sa.submittedDate,automaticRelease:true,allUsersImmediately:true,alreadySubmitted:false};
  if(at<7)await wait(5000);
 }
 throw Error('REVIEW_SUBMITTED_STATE_NOT_CONFIRMED');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{const result=await submitReview(process.env);if(process.env.MANEE_REVIEW_STATUS_FILE)writeFileSync(process.env.MANEE_REVIEW_STATUS_FILE,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));}
 catch(e){console.error(/^REVIEW_[A-Z_0-9]+$/.test(e.message)?e.message:'REVIEW_SUBMISSION_FAILED');process.exitCode=1;}
}
