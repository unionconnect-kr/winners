import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareRelease} from './ios-release-prepare.mjs';
const app='6820833544',versionId='87063b6a-6afc-4384-a766-c493dbbcca1f',buildId='00000000-0000-4000-8000-000000000001',reviewId='00000000-0000-4000-8000-000000000002';
const env={GITHUB_REPOSITORY:'unionconnect-kr/winners',GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'push',GITHUB_WORKFLOW:'Prepare exact iOS 1.8.1 release metadata',MANEE_RELEASE_PREPARE:'ios-20261016-1.8.1'};
function fixture(overrides={}){
 const state={app:{id:app,attributes:{bundleId:'kr.co.manee.app',...overrides.app}},version:{id:versionId,attributes:{versionString:'1.0',appStoreState:overrides.versionState||'PREPARE_FOR_SUBMISSION'}},build:{id:buildId,type:'builds',attributes:{version:'1.8.1',processingState:'VALID',usesNonExemptEncryption:false,...overrides.build}},selected:{id:'old'},review:overrides.review||null,beta:overrides.noBeta?{}:{demoAccountRequired:true,contactEmail:'secret-contact',contactFirstName:'private-first',contactLastName:'private-last',contactPhone:'private-phone',demoAccountName:'secret-user',demoAccountPassword:'secret-password',notes:'Review demo store instructions'},writes:[]};
 const request=async(url,options)=>{
  assert.equal(new URL(url).origin,'https://api.appstoreconnect.apple.com');assert.equal(options.redirect,'error');
  const path=new URL(url).pathname,body=options.body?JSON.parse(options.body):null;
  let data;
  if(options.method!=='GET'){
   state.writes.push({path,method:options.method,body});
   if(path==='/v1/apps/'+app&&options.method==='PATCH'){assert.deepEqual(Object.keys(body.data.attributes).sort(),['subscriptionStatusUrl','subscriptionStatusUrlForSandbox','subscriptionStatusUrlVersion','subscriptionStatusUrlVersionForSandbox'].sort());Object.assign(state.app.attributes,body.data.attributes);data=state.app;}
   else if(path==='/v1/appStoreVersions/'+versionId+'/relationships/build'&&options.method==='PATCH'){state.selected=state.build;data=state.selected;}
   else if(path==='/v1/appStoreReviewDetails'&&options.method==='POST'){state.review={id:reviewId,attributes:body.data.attributes};data=state.review;}
   else if(path==='/v1/appStoreReviewDetails/'+reviewId&&options.method==='PATCH'){Object.assign(state.review.attributes,body.data.attributes);data=state.review;}
   else assert.fail('Unexpected write');
  }else if(path==='/v1/apps/'+app)data=state.app;
  else if(path==='/v1/appStoreVersions/'+versionId)data=state.version;
  else if(path==='/v1/apps/'+app+'/appStoreVersions')data=[state.version];
  else if(path==='/v1/builds')data=overrides.ambiguous?[state.build,state.build]:[state.build];
  else if(path.endsWith('/build'))data=state.selected;
  else if(path.endsWith('/appStoreReviewDetail'))data=state.review;
  else if(path.endsWith('/betaAppReviewDetail'))data={attributes:state.beta};
  else assert.fail('Unexpected read');
  return {ok:true,status:200,json:async()=>({data})};
 };
 return {state,request,token:()=> 'private-token'};
}
test('prepares fixed draft build and V2 endpoints, reuses existing Apple review access without logging values',async()=>{
 const f=fixture();const out=await prepareRelease(env,f);
 assert.equal(out.selectedBuild,'1.8.1');assert.equal(out.reviewAccountCopiedFromExistingBeta,true);assert.equal(out.reviewAccountAndContactReady,true);
 assert.equal(out.reviewSubmitted,false);assert.equal(out.agreementsAccepted,false);assert.equal(out.checkoutEnabled,false);
 assert.doesNotMatch(JSON.stringify(out),/secret-|private-|Review demo/);
 assert.equal(f.state.writes.length,3);
 f.state.writes=[];await prepareRelease(env,f);assert.equal(f.state.writes.length,0);
});
test('wrong app, version, expired or ambiguous build, foreign webhook stop before writes',async()=>{
 for(const override of [{app:{bundleId:'foreign'}},{versionState:'WAITING_FOR_REVIEW'},{build:{processingState:'PROCESSING'}},{build:{expired:true}},{ambiguous:true},{app:{subscriptionStatusUrl:'https://foreign.invalid'}}]){
  const f=fixture(override);await assert.rejects(()=>prepareRelease(env,f),/RELEASE_PREPARE_/);assert.equal(f.state.writes.length,0);
 }
});
test('missing beta details leave review account pending; a different partial account is never combined with beta password',async()=>{
 for(const override of [{noBeta:true},{review:{id:reviewId,attributes:{demoAccountName:'different-user'}}}]){
  const f=fixture(override);const out=await prepareRelease(env,f);assert.equal(out.reviewAccountAndContactReady,false);assert.equal(out.reviewAccountCopiedFromExistingBeta,false);assert.equal(f.state.writes.length,2);
 }
});
test('manual or untrusted workflow context cannot mutate Apple metadata',async()=>{
 const f=fixture();await assert.rejects(()=>prepareRelease({...env,GITHUB_EVENT_NAME:'pull_request'},f),/NOT_REQUESTED/);assert.equal(f.state.writes.length,0);
});
