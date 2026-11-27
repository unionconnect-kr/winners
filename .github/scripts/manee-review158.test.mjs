import test from 'node:test';
import assert from 'node:assert/strict';
import {submit,appId,marketing,buildNumber,title} from './manee-review158.mjs';

function fixture({foreign=false,wrongBuild=false}={}){
  const live={id:'live',attributes:{platform:'IOS',versionString:'1.57',appVersionState:'READY_FOR_DISTRIBUTION'}};
  const review=Object.fromEntries(['contactFirstName','contactLastName','contactPhone','contactEmail','demoAccountName','demoAccountPassword','notes'].map(k=>[k,'example']));
  const draftInfo={id:'ki',attributes:{locale:'ko',name:'매니'}},liveInfo={id:'li',attributes:{locale:'ko',name:'매니'}};
  let version,detail,submission,entries=[],updates=0,timingWrites=0;
  const loc={id:'kl',attributes:{locale:'ko',whatsNew:null}};
  const build={id:'b',attributes:{version:buildNumber,processingState:'VALID',usesNonExemptEncryption:false}};
  const root='/v1/apps/'+appId, vp='/v1/appStoreVersions/v';
  const api=async(method,u,body)=>{
    const p=u.split('?')[0],a=body?.data?.attributes;
    if(method==='GET'){
      if(p===root)return {data:{attributes:{bundleId:'kr.co.manee.app'}}};
      if(p===root+'/appStoreVersions')return {data:version?[version,live]:[live]};
      if(p===vp)return {data:version};
      if(p===root+'/appInfos')return {data:[{id:'h',attributes:{state:'READY_FOR_DISTRIBUTION'}},{id:'i',attributes:{state:version.attributes.appVersionState}}]};
      if(p==='/v1/appInfos/i/appInfoLocalizations')return {data:[draftInfo]};
      if(p==='/v1/appInfos/h/appInfoLocalizations')return {data:[liveInfo]};
      if(p==='/v1/appInfoLocalizations/ki')return {data:draftInfo};
      if(p===vp+'/appStoreVersionLocalizations')return {data:[loc]};
      if(p==='/v1/appStoreVersionLocalizations/kl')return {data:loc};
      if(p===vp+'/appStoreReviewDetail')return {data:detail};
      if(p==='/v1/appStoreVersions/live/appStoreReviewDetail')return {data:{attributes:{...review,demoAccountRequired:true}}};
      if(p==='/v1/builds')return {data:[build]};
      if(p==='/v1/builds/b/preReleaseVersion')return {data:{attributes:{version:wrongBuild?'1.57':marketing,platform:'IOS'}}};
      if(p===root+'/reviewSubmissions')return {data:foreign?[{id:'foreign',attributes:{state:'READY_FOR_REVIEW'}}]:submission?[submission]:[]};
      if(p==='/v1/reviewSubmissions/foreign/items')return {data:[{relationships:{appStoreVersion:{data:{id:'other'}}}}]};
      if(p==='/v1/reviewSubmissions/s/items')return {data:entries};
      if(p==='/v1/reviewSubmissions/s')return {data:submission};
    }else{
      if(method==='POST'&&p==='/v1/appStoreVersions'){version={id:'v',attributes:{...a,appVersionState:'PREPARE_FOR_SUBMISSION'},relationships:{}};return {data:version};}
      if(method==='PATCH'&&p===vp){Object.assign(version.attributes,a);timingWrites++;return {data:version};}
      if(method==='PATCH'&&p==='/v1/appInfoLocalizations/ki'){Object.assign(draftInfo.attributes,a);return {};}
      if(method==='PATCH'&&p==='/v1/appStoreVersionLocalizations/kl'){Object.assign(loc.attributes,a);return {};}
      if(method==='POST'&&p==='/v1/appStoreReviewDetails'){detail={id:'rd',attributes:a};return {data:detail};}
      if(method==='PATCH'&&p===vp+'/relationships/build'){version.relationships.build=body;return {};}
      if(method==='POST'&&p==='/v1/reviewSubmissions'){submission={id:'s',attributes:{state:'READY_FOR_REVIEW'}};return {data:submission};}
      if(method==='POST'&&p==='/v1/reviewSubmissionItems'){entries=[{relationships:body.data.relationships}];return {};}
      if(method==='PATCH'&&p==='/v1/reviewSubmissions/s'){assert.deepEqual(a,{submitted:true});submission.attributes={state:'WAITING_FOR_REVIEW',submittedDate:'2026-11-27T01:00:00Z'};version.attributes.appVersionState='WAITING_FOR_REVIEW';updates++;return {};}
    }
    throw Error(method+' '+u);
  };
  return {api,liveInfo,updates:()=>updates,timingWrites:()=>timingWrites,setTiming:attrs=>Object.assign(version.attributes,attrs)};
}
test('review preserves the live listing, rereads the Korean name and submits the verified draft once',async()=>{
 const f=fixture();const one=await submit(f.api);assert.equal(one.build,buildNumber);assert.equal(one.storeTitle,title);assert.equal(one.submissionState,'WAITING_FOR_REVIEW');assert.equal(f.liveInfo.attributes.name,'매니');
 const two=await submit(f.api);assert.equal(two.submissionId,one.submissionId);assert.equal(f.updates(),1);
});
test('an unrelated active review is preserved',async()=>{
 const f=fixture({foreign:true});await assert.rejects(submit(f.api),/different submission/);assert.equal(f.updates(),0);
});
test('a build from another version cannot be selected',async()=>{
 const f=fixture({wrongBuild:true});await assert.rejects(submit(f.api),/another version/);assert.equal(f.updates(),0);
});
test('a submitted version can switch to immediate release after approval without losing its place in review',async()=>{
 const f=fixture();
 const initial=await submit(f.api);
 f.setTiming({releaseType:'MANUAL',earliestReleaseDate:null});
 const modified=await submit(f.api);
 assert.equal(modified.releaseType,'AFTER_APPROVAL');
 assert.equal(modified.earliestReleaseDate,null);
 assert.equal(modified.submissionId,initial.submissionId);
 assert.equal(modified.submittedDate,initial.submittedDate);
 await submit(f.api);
 assert.equal(f.updates(),1);
 assert.equal(f.timingWrites(),1);
});
test('a scheduled date is cleared when automatic release is selected',async()=>{
 const f=fixture();
 await submit(f.api);
 f.setTiming({releaseType:'SCHEDULED',earliestReleaseDate:'2026-12-30T00:00:00Z'});
 const result=await submit(f.api);
 assert.equal(result.releaseType,'AFTER_APPROVAL');
 assert.equal(result.earliestReleaseDate,null);
 assert.equal(f.updates(),1);
});
