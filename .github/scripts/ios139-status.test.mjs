import test from 'node:test';
import assert from 'node:assert/strict';
import {connectBuild,exactBuild} from './ios139-status.mjs';
const env={GITHUB_REPOSITORY:'unionconnect-kr/winners',GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'push',GITHUB_WORKFLOW:'Upload reviewed iOS 1.39 QA 1.10.1',MANEE_AUTHORIZED_QA_UPLOAD:'ios-20261103-1.39-1.10.1'};
const id='00000000-0000-4000-8000-000000000139',group='b5982888-0280-4513-8f78-74ca63dcd342';
function fake({foreign=false,external=false,processing=false,encrypted=false,duplicate=false,connected=false,verify=true,version='1.39'}={}){
 let added=connected;const calls=[];
 const api=async(path,body)=>{
  calls.push({path,body});
  if(path.includes('/relationships/builds')){if(body){added=true;return null;}return{data:added&&verify?[{type:'builds',id}]:[]};}
  if(path.includes('/betaTesters'))return{data:[{id:'do-not-publish-personal-data'}]};
  if(path.includes('/betaGroups'))return{data:[{id:group,attributes:{isInternalGroup:!external,name:'MANEE 내부 QA'}}]};
  if(path.includes('/v1/builds?')){
   const row={id,type:'builds',attributes:{version:'1.10.1',processingState:processing?'PROCESSING':'VALID',usesNonExemptEncryption:encrypted},relationships:{preReleaseVersion:{data:{id:'v'}},buildBetaDetail:{data:{id:'b'}}}};
   return{data:duplicate?[row,row]:[row],included:[{type:'preReleaseVersions',id:'v',attributes:{version}},{type:'buildBetaDetails',id:'b',attributes:{internalBuildState:'IN_BETA_TESTING'}}]};
  }
  return{data:{id:'6820833544',attributes:{bundleId:foreign?'wrong':'kr.co.manee.app'}}};
 };
 return {calls,api,options:{api,wait:async()=>{},attempts:1}};
}
test('only exact iOS 1.39 build is added to existing internal group; retry is idempotent',async()=>{
 const f=fake();const result=await connectBuild(env,f.options);assert.equal(result.internalGroupConnected,true);assert.equal(result.internalTesterCount,1);
 const writes=f.calls.filter(x=>x.body);assert.equal(writes.length,1);assert.equal(writes[0].path,'/v1/betaGroups/'+group+'/relationships/builds');assert.deepEqual(writes[0].body,{data:[{type:'builds',id}]});
 assert(!JSON.stringify(result).includes('do-not-publish-personal-data'));
 const retry=fake({connected:true});await connectBuild(env,retry.options);assert.equal(retry.calls.filter(x=>x.body).length,0);
});
test('wrong app, marketing version, group or ambiguous build cannot change distribution',async()=>{
 for(const config of [{foreign:true},{external:true},{duplicate:true},{version:'1.0'}]){const f=fake(config);await assert.rejects(connectBuild(env,f.options));assert.equal(f.calls.filter(x=>x.body).length,0);}
 const f=fake();await assert.rejects(connectBuild({...env,GITHUB_REF:'refs/heads/other'},f.options));assert.equal(f.calls.length,0);
});
test('unprocessed build and pending encryption never get added; failed verification is reported',async()=>{
 for(const config of [{processing:true},{encrypted:true}]){const f=fake(config);const result=await connectBuild(env,f.options);assert.equal(result.internalGroupConnected,false);assert.equal(f.calls.filter(x=>x.body).length,0);}
 const f=fake({verify:false});await assert.rejects(connectBuild(env,f.options),/GROUP_NOT_VERIFIED/);
});
