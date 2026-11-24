import test from 'node:test';
import assert from 'node:assert/strict';
import {submitReview} from './manee-submit157.mjs';
const branch='refs/heads/codex/manee-ios157-review-20261124';
const env={GITHUB_REPOSITORY:'unionconnect-kr/winners',GITHUB_REF:branch,GITHUB_EVENT_NAME:'push',GITHUB_WORKFLOW_REF:'unionconnect-kr/winners/.github/workflows/ios157-submit-review.yml@'+branch,MANEE_SUBMIT_REVIEW:'ios-1.57-157.8.1-auto-release'};
function setup({wrongApp=false,wrongBuild=false,unrelated=false,queued=false,phased=false}={}){
 const calls=[],mutations=[];let selected=queued,submitted=queued,created=queued||unrelated,added=queued||unrelated;
 const version=()=>({data:{type:'appStoreVersions',id:'v1',attributes:{versionString:'1.57',platform:'IOS',appStoreState:submitted?'WAITING_FOR_REVIEW':'PREPARE_FOR_SUBMISSION',releaseType:'AFTER_APPROVAL',earliestReleaseDate:null},relationships:{build:{data:selected?{type:'builds',id:'b1'}:null},appStoreVersionPhasedRelease:{data:phased?{id:'phase1'}:null}}},included:phased?[{id:'phase1',attributes:{phasedReleaseState:'INACTIVE'}}]:[]});
 const row=()=>({type:'reviewSubmissions',id:'s1',attributes:{platform:'IOS',state:submitted?'WAITING_FOR_REVIEW':'READY_FOR_REVIEW',submittedDate:submitted?'2026-11-24T14:00:00Z':null}});
 const api=async(method,path,body)=>{
  calls.push({method,path,body});if(method!=='GET')mutations.push({method,path,body});
  if(method==='GET'){
   if(path==='/v1/apps/6820833544?fields%5Bapps%5D=bundleId')return {data:{id:'6820833544',attributes:{bundleId:wrongApp?'other.app':'kr.co.manee.app'}}};
   if(path.startsWith('/v1/builds?'))return {data:[{type:'builds',id:'b1',attributes:{version:wrongBuild?'157.7.2':'157.8.1',processingState:'VALID',usesNonExemptEncryption:false}}]};
   if(path==='/v1/builds/b1/preReleaseVersion')return {data:{attributes:{version:'1.57',platform:'IOS'}}};
   if(path.includes('/appStoreVersions?'))return {data:[{id:'v1'}]};
   if(path==='/v1/appStoreVersions/v1?include=build,appStoreVersionPhasedRelease')return version();
   if(path.endsWith('/appStoreReviewDetail'))return {data:{attributes:{demoAccountRequired:true,demoAccountName:'todtod07',demoAccountPassword:'fixture-password',notes:'Checklist items can require 1–4 completion photos.'}}};
   if(path.includes('/appStoreVersionLocalizations?'))return {data:[{attributes:{locale:'ko-KR',whatsNew:'최대 4장'}}]};
   if(path.includes('/apps/6820833544/reviewSubmissions?'))return {data:created?[row()]:[]};
   if(path.includes('/reviewSubmissions/s1/items?'))return {data:added?[{id:'i1',relationships:{appStoreVersion:{data:{id:unrelated?'unrelated-version':'v1'}}}}]:[]};
   if(path==='/v1/reviewSubmissions/s1')return {data:row()};
  }
  if(method==='PATCH'&&path==='/v1/appStoreVersions/v1/relationships/build'){assert.equal(body.data.id,'b1');selected=true;return null;}
  if(method==='POST'&&path==='/v1/reviewSubmissions'){assert.equal(body.data.relationships.app.data.id,'6820833544');created=true;return {data:row()};}
  if(method==='POST'&&path==='/v1/reviewSubmissionItems'){assert.equal(body.data.relationships.appStoreVersion.data.id,'v1');added=true;return {data:{id:'i1'}};}
  if(method==='PATCH'&&path==='/v1/reviewSubmissions/s1'){assert.equal(body.data.attributes.submitted,true);assert.ok(selected&&added);submitted=true;return {data:row()};}
  throw Error('Unexpected test request: '+method+' '+path);
 };
 return {api,calls,mutations};
}
test('only the specifically authorized repository, branch, workflow and request may contact Apple',async()=>{
 for(const bad of [{GITHUB_REPOSITORY:'other/repo'},{GITHUB_REF:'refs/heads/main'},{GITHUB_EVENT_NAME:'pull_request'},{GITHUB_WORKFLOW_REF:'other.yml'},{MANEE_SUBMIT_REVIEW:'other'}]){const h=setup();await assert.rejects(submitReview({...env,...bad},{api:h.api}),/REVIEW_NOT_AUTHORIZED/);assert.equal(h.calls.length,0);}
});
test('another app, obsolete build, unrelated item or phased release cannot be submitted',async()=>{
 for(const cfg of [{wrongApp:true},{wrongBuild:true},{unrelated:true},{phased:true}]){const h=setup(cfg);await assert.rejects(submitReview(env,{api:h.api}),/REVIEW_/);assert.equal(h.mutations.length,0);}
});
test('the exact processed version is linked and submitted only after verification',async()=>{
 const h=setup(),r=await submitReview(env,{api:h.api});assert.equal(r.build,'157.8.1');assert.equal(r.state,'WAITING_FOR_REVIEW');assert.equal(r.automaticRelease,true);assert.equal(r.allUsersImmediately,true);assert.equal(h.mutations.length,4);
 assert.deepEqual(h.mutations.map(x=>x.method),['PATCH','POST','POST','PATCH']);assert.ok(!JSON.stringify(r).includes('fixture-password'));
});
test('already submitted matching version returns a verified receipt without mutations',async()=>{
 const h=setup({queued:true}),r=await submitReview(env,{api:h.api});assert.equal(r.alreadySubmitted,true);assert.equal(h.mutations.length,0);assert.equal(r.submissionState,'WAITING_FOR_REVIEW');
});
