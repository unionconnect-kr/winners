import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {makeToken} from '../../mobile/scripts/check-apple-connection.mjs';

export const appId='6820833544', marketing='1.59', buildNumber='159.7.1';
export const title='매니 - 우리가게 매니저';
const editable=new Set(['PREPARE_FOR_SUBMISSION','READY_FOR_REVIEW','DEVELOPER_REJECTED','REJECTED','METADATA_REJECTED']);
const submitted=new Set(['WAITING_FOR_REVIEW','IN_REVIEW']);
const reviewFields=['contactFirstName','contactLastName','contactPhone','contactEmail','demoAccountName','demoAccountPassword','notes'];
const notes='매니저의 매출보고 저장 오류를 수정했습니다. 사장님과 매출보고 권한이 있는 매니저는 같은 매장에서 다른 담당자가 작성한 전날 보고서도 수정할 수 있습니다. 수정하면 매장명, 보고 날짜와 수정한 사람을 사장님에게 알려드립니다. 매니저도 정산표 사진으로 금액을 자동 입력할 수 있고, 금액란을 누르면 기본값 0이 지워집니다.';
const notesEn='Fixed an issue saving manager sales reports. Owners and authorized managers can edit earlier reports from any author in the same store. Owners are notified of changes. Managers can also fill in sales figures from a settlement photo. Tapping a zero amount clears it for entry.';
const incidentNote='Version 1.59 – Daily Sales reporting fix. In the previous public iOS version (1.58), sign in as a manager with Sales reporting access, open a store, open Daily Sales, and try to edit a previous-day report that another manager or the owner created. The old app hides editing for that report. We also recorded six failed manager save requests in production on November 28 (Korea time). A server compatibility fix restored the missing save endpoint for installed apps. The client update is still needed for editing reports by another author. In 1.59 an authorized manager can open and save those reports and the owner receives an edit notification. The store must be open for that report month.';
const resource=(type,id,attributes)=>({data:{type,...(id?{id}:{}),attributes}});
const related=(type,id)=>({data:{type,id}});
const state=r=>r?.attributes?.appVersionState||r?.attributes?.state||r?.attributes?.appStoreState;
const ko=r=>['ko','ko-KR'].includes(r?.attributes?.locale);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

export async function submit(api,wait=sleep) {
  const get=path=>api('GET',path);
  const rows=async path=>{
    const response=await get(path);
    assert.ok(Array.isArray(response.data)&&!response.links?.next,'Incomplete App Store collection');
    return response.data;
  };
  const app='/v1/apps/'+appId;
  assert.equal((await get(app+'?fields%5Bapps%5D=bundleId')).data?.attributes?.bundleId,'kr.co.manee.app');
  const versions=await rows(app+'/appStoreVersions?filter%5Bplatform%5D=IOS&limit=100');
  const targets=versions.filter(x=>x.attributes.versionString===marketing);
  assert.ok(targets.length<=1,'Conflicting store versions');
  let version=targets[0];
  if(!version) {
    const prior=versions.find(x=>x.attributes.versionString==='1.58');
    assert.ok(prior&&['READY_FOR_DISTRIBUTION','READY_FOR_SALE'].includes(state(prior)),'Previous store version is not released');
    const body=resource('appStoreVersions',null,{platform:'IOS',versionString:marketing,releaseType:'AFTER_APPROVAL',...(prior.attributes.copyright?{copyright:prior.attributes.copyright}:{})});
    body.data.relationships={app:related('apps',appId)};
    version=(await api('POST','/v1/appStoreVersions',body)).data;
  }
  const vp='/v1/appStoreVersions/'+version.id;
  const current=async()=> (await get(vp+'?include=build')).data;
  version=await current();
  assert.equal(version.attributes.versionString,marketing);
  assert.equal(version.attributes.platform,'IOS');
  const queued=submitted.has(state(version));
  assert.ok(queued||editable.has(state(version)),'Store version is not editable or submitted');

  const selectName=async()=>{
    const infos=await rows(app+'/appInfos?limit=50');
    const active=infos.filter(i=>queued?submitted.has(state(i)):editable.has(state(i)));
    assert.ok(active.length<=1,'Multiple editable app information records');
    const candidates=active.length?active:infos.filter(i=>['READY_FOR_SALE','READY_FOR_DISTRIBUTION'].includes(state(i)));
    assert.equal(candidates.length,1,'Expected one applicable app information record');
    const locs=await rows('/v1/appInfos/'+candidates[0].id+'/appInfoLocalizations?limit=50');
    const local=locs.filter(ko);assert.equal(local.length,1,'Expected one Korean app localization');
    if(local[0].attributes.name!==title){
      assert.ok(!queued&&active.length===1,'Name needs editable app information');
      await api('PATCH','/v1/appInfoLocalizations/'+local[0].id,resource('appInfoLocalizations',local[0].id,{name:title}));
    }
    const readback=await get('/v1/appInfoLocalizations/'+local[0].id);
    assert.equal(readback.data.attributes.name,title);
    return local[0].id;
  };
  const locId=await selectName();
  if(!queued) {
    const locs=await rows(vp+'/appStoreVersionLocalizations?limit=100');
    assert.equal(locs.filter(ko).length,1,'Missing Korean release localization');
    for(const loc of locs){
      const language=loc.attributes.locale;
      const text=ko(loc)?notes:language.startsWith('en')?notesEn:null;
      if(!text){assert.ok(loc.attributes.whatsNew,'Missing release notes for '+language);continue;}
      if(loc.attributes.whatsNew!==text)await api('PATCH','/v1/appStoreVersionLocalizations/'+loc.id,resource('appStoreVersionLocalizations',loc.id,{whatsNew:text}));
      assert.equal((await get('/v1/appStoreVersionLocalizations/'+loc.id)).data.attributes.whatsNew,text);
    }
    const prior=versions.find(x=>x.attributes.versionString==='1.58');
    const getDetail=async path=>{try{return (await get(path+'/appStoreReviewDetail')).data;}catch(e){if(e.status===404)return null;throw e;}};
    let detail=await getDetail(vp);
    if(!detail || !detail.attributes.demoAccountRequired || reviewFields.some(k=>!detail.attributes[k])){
      assert.ok(prior,'Missing previous review information');
      const previous=await getDetail('/v1/appStoreVersions/'+prior.id);
      assert.ok(previous?.attributes?.demoAccountRequired&&reviewFields.every(k=>previous.attributes[k]),'Previous review contact or account incomplete');
      const attrs={demoAccountRequired:true};
      for(const key of reviewFields)if(!detail?.attributes?.[key])attrs[key]=previous.attributes[key];
      const body=resource('appStoreReviewDetails',detail?.id,attrs);
      if(detail)await api('PATCH','/v1/appStoreReviewDetails/'+detail.id,body);
      else{body.data.relationships={appStoreVersion:related('appStoreVersions',version.id)};await api('POST','/v1/appStoreReviewDetails',body);}
      detail=await getDetail(vp);
    }
    assert.ok(detail?.attributes?.demoAccountRequired&&reviewFields.every(k=>detail.attributes[k]),'Review information incomplete');
    if (!detail.attributes.notes.includes(incidentNote)) {
      const combined = [incidentNote, detail.attributes.notes].join('\n\n');
      assert.ok(combined.length <= 4000, 'Combined review notes exceed the Apple limit');
      const body = resource('appStoreReviewDetails', detail.id, {notes: combined});
      await api('PATCH', '/v1/appStoreReviewDetails/' + detail.id, body);
      const verifiedDetail = await getDetail(vp);
      assert.ok(verifiedDetail?.attributes?.notes === combined, 'Incident review notes missing');
    }
  }
  let build;
  for(let at=0;at<30;at++){
    const found=await rows('/v1/builds?filter%5Bapp%5D='+appId+'&filter%5Bversion%5D='+buildNumber+'&limit=10');
    assert.ok(found.length<=1,'Ambiguous build');build=found[0];
    if(build&&build.attributes.processingState!=='PROCESSING')break;
    if(at<29)await wait(30000);
  }
  assert.ok(build?.attributes.processingState==='VALID'&&build.attributes.version===buildNumber&&build.attributes.usesNonExemptEncryption===false,'Target build is not ready');
  const pre=(await get('/v1/builds/'+build.id+'/preReleaseVersion')).data;
  assert.ok(pre.attributes.platform==='IOS'&&pre.attributes.version===marketing,'Build belongs to another version');
  if(version.relationships?.build?.data?.id!==build.id){
    assert.ok(!queued,'A different build is already submitted');
    await api('PATCH',vp+'/relationships/build',related('builds',build.id));
  }
  assert.equal((await current()).relationships.build.data.id,build.id);
  const submissions=await rows(app+'/reviewSubmissions?filter%5Bplatform%5D=IOS&limit=100');
  let batch,items=[];
  for(const sub of submissions.filter(x=>['READY_FOR_REVIEW','WAITING_FOR_REVIEW','IN_REVIEW','UNRESOLVED_ISSUES'].includes(x.attributes.state))){
    const entries=await rows('/v1/reviewSubmissions/'+sub.id+'/items?include=appStoreVersion&limit=50');
    const same=entries.length===1&&entries[0].relationships?.appStoreVersion?.data?.id===version.id;
    if(!same&&entries.length)throw Error('A different submission is active');
    assert.ok(!batch,'Multiple active App Review submissions');batch=sub;items=entries;
  }
  if(!batch){
    assert.ok(!queued);
    const body=resource('reviewSubmissions',null,{platform:'IOS'});body.data.relationships={app:related('apps',appId)};
    batch=(await api('POST','/v1/reviewSubmissions',body)).data;
  }
  // Apple allows changing release timing independently of an existing review submission.
  const beforeTiming=await current();
  assert.equal(beforeTiming.relationships.build.data.id,build.id);
  if(beforeTiming.attributes.releaseType!=='AFTER_APPROVAL'||beforeTiming.attributes.earliestReleaseDate){
    const timing={releaseType:'AFTER_APPROVAL'};
    if(beforeTiming.attributes.earliestReleaseDate)timing.earliestReleaseDate=null;
    await api('PATCH',vp,resource('appStoreVersions',version.id,timing));
  }
  const verifiedTiming=await current();
  assert.equal(verifiedTiming.attributes.releaseType,'AFTER_APPROVAL');
  assert.ok(!verifiedTiming.attributes.earliestReleaseDate,'An earliest release date is still set');
  if(!submitted.has(batch.attributes.state)){
    assert.equal(batch.attributes.state,'READY_FOR_REVIEW');
    if(!items.length){
      await api('POST','/v1/reviewSubmissionItems',{data:{type:'reviewSubmissionItems',relationships:{reviewSubmission:related('reviewSubmissions',batch.id),appStoreVersion:related('appStoreVersions',version.id)}}});
    }
    const check=await rows('/v1/reviewSubmissions/'+batch.id+'/items?include=appStoreVersion&limit=50');
    assert.ok(check.length===1&&check[0].relationships.appStoreVersion.data.id===version.id,'Submission includes unrelated changes');
    await api('PATCH','/v1/reviewSubmissions/'+batch.id,resource('reviewSubmissions',batch.id,{submitted:true}));
  }
  for(let at=0;at<12;at++){
    const [v,s,l]=await Promise.all([current(),get('/v1/reviewSubmissions/'+batch.id),get('/v1/appInfoLocalizations/'+locId)]);
    if(submitted.has(state(v))&&submitted.has(s.data.attributes.state)&&s.data.attributes.submittedDate&&v.relationships.build.data.id===build.id&&l.data.attributes.name===title&&v.attributes.releaseType==='AFTER_APPROVAL'&&!v.attributes.earliestReleaseDate){
      return {appId,version:marketing,build:buildNumber,storeTitle:title,versionId:version.id,submissionId:batch.id,state:state(v),submissionState:s.data.attributes.state,submittedDate:s.data.attributes.submittedDate,releaseType:v.attributes.releaseType,earliestReleaseDate:v.attributes.earliestReleaseDate??null};
    }
    if(at<11)await wait(5000);
  }
  throw Error('Submission acknowledgement not yet available');
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const env=process.env;
  assert.ok(env.GITHUB_REPOSITORY==='unionconnect-kr/winners'&&env.GITHUB_REF==='refs/heads/codex/manee-stores-review-20261127'&&env.GITHUB_EVENT_NAME==='push'&&env.GITHUB_WORKFLOW_REF==='unionconnect-kr/winners/.github/workflows/manee-store-review158.yml@refs/heads/codex/manee-stores-review-20261127','Wrong release context');
  const api=async(method,path,body)=>{
    assert.ok(path.startsWith('/v1/'));
    const r=await fetch('https://api.appstoreconnect.apple.com'+path,{method,redirect:'error',signal:AbortSignal.timeout(30000),headers:{Authorization:'Bearer '+makeToken(env),Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
    const data=r.status===204?null:await r.json();
    if(!r.ok){
      const fields=data?.errors?.map(e=>({code:e.code,pointer:e.source?.pointer,parameter:e.source?.parameter}));
      throw Object.assign(Error('Apple '+method+' '+path.split('?')[0]+' HTTP '+r.status+' '+JSON.stringify(fields)),{status:r.status});
    }
    return data;
  };
  try{const receipt=await submit(api);writeFileSync(env.MANEE_REVIEW_STATUS_FILE,JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt));}
  catch(e){console.error(e.message);process.exitCode=1;}
}
