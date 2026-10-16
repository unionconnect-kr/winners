import test from 'node:test';
import assert from 'node:assert/strict';
import {connectInternalBuild} from './ios-1-8-internal-group.mjs';
const env={GITHUB_REPOSITORY:'unionconnect-kr/winners',GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'push',GITHUB_WORKFLOW:'Connect exact iOS 1.8.1 internal QA',MANEE_INTERNAL_BUILD:'ios-20261016-1.8.1'};
const group='b5982888-0280-4513-8f78-74ca63dcd342',id='00000000-0000-4000-8000-000000000108';
function fake({foreignApp=false,external=false,processing=false,encrypted=false,duplicate=false,connected=false,verify=true}={}){
 const calls=[];let added=connected;
 const request=async(url,opts)=>{
  calls.push({path:new URL(url).pathname,method:opts.method,body:opts.body&&JSON.parse(opts.body)});let data;
  if(url.includes('/relationships/builds')){
   if(opts.method==='POST'){added=true;return {ok:true,status:204};}
   data=added&&verify?[{type:'builds',id}]:[];
  }else if(url.includes('/betaGroups'))data=[{id:group,attributes:{isInternalGroup:!external,name:'MANEE 내부 QA'}}];
  else if(url.includes('/v1/builds?')){const row={id,type:'builds',attributes:{version:'1.8.1',processingState:processing?'PROCESSING':'VALID',usesNonExemptEncryption:encrypted}};data=duplicate?[row,row]:[row];}
  else data={id:'6820833544',attributes:{bundleId:foreignApp?'foreign':'kr.co.manee.app'}};
  return {ok:true,status:200,json:async()=>({data})};
 };
 return {calls,options:{request,token:()=> 'fixture',wait:async()=>{},attempts:1}};
}
test('only the exact existing internal group receives the exact processed build',async()=>{
 const h=fake();const result=await connectInternalBuild(env,h.options);assert.equal(result.internalGroupConnected,true);
 const writes=h.calls.filter(x=>x.method==='POST');assert.equal(writes.length,1);
 assert.equal(writes[0].path,'/v1/betaGroups/'+group+'/relationships/builds');assert.deepEqual(writes[0].body,{data:[{type:'builds',id}]});
 assert.equal(result.invitationSent,false);assert.equal(result.reviewSubmitted,false);
 const repeat=fake({connected:true});await connectInternalBuild(env,repeat.options);assert.equal(repeat.calls.filter(x=>x.method==='POST').length,0);
});
test('wrong execution, app, group, unprocessed/ambiguous/encrypted builds cannot change distribution',async()=>{
 const h=fake();await assert.rejects(()=>connectInternalBuild({...env,GITHUB_REF:'refs/heads/foreign'},h.options));assert.equal(h.calls.length,0);
 for(const scenario of [{foreignApp:true},{external:true},{processing:true},{encrypted:true},{duplicate:true}]){const t=fake(scenario);await assert.rejects(()=>connectInternalBuild(env,t.options));assert.equal(t.calls.filter(x=>x.method==='POST').length,0);}
 const unverified=fake({verify:false});await assert.rejects(()=>connectInternalBuild(env,unverified.options),/NOT_VERIFIED/);
});
