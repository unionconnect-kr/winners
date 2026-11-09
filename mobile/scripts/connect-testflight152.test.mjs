import test from 'node:test';
import assert from 'node:assert/strict';
import {connectTestFlight152} from './connect-testflight152.mjs';
import {connectTestFlight} from './connect-testflight.mjs';

const branch='refs/heads/codex/final-email-billing-152-20261106';
const env={GITHUB_REPOSITORY:'unionconnect-kr/winners',GITHUB_REF:branch,GITHUB_EVENT_NAME:'push',
  GITHUB_WORKFLOW_REF:`unionconnect-kr/winners/.github/workflows/mobile152-release.yml@${branch}`,
  GITHUB_RUN_NUMBER:'1',GITHUB_RUN_ATTEMPT:'1',MANEE_INTERNAL_BUILD:'ios-20261106-1.52'};
const buildId='11111111-1111-1111-1111-111111111111';
function mock({version='152.1.1',marketing='1.52',groupInternal=true,processing='VALID',linked=false,betaState='IN_BETA_TESTING'}={}) {
  const calls=[];let connected=linked;
  const request=async(url,options)=>{
    const path=new URL(url).pathname;calls.push({path,method:options.method,body:options.body});
    assert.equal(options.headers.Authorization,'Bearer disposable-token');
    let data;
    if(path.endsWith('/betaGroups'))data=[{id:'b5982888-0280-4513-8f78-74ca63dcd342',attributes:{isInternalGroup:groupInternal,name:'MANEE 내부 QA'}}];
    else if(path==='/v1/builds')data=[{id:buildId,type:'builds',attributes:{version,processingState:processing,usesNonExemptEncryption:false}}];
    else if(path.endsWith('/preReleaseVersion'))data={attributes:{version:marketing,platform:'IOS'}};
    else if(path.endsWith('/relationships/builds')) {
      if(options.method==='POST') {
        assert.deepEqual(JSON.parse(options.body),{data:[{type:'builds',id:buildId}]});
        connected=true;return {ok:true,status:204};
      }
      data=connected?[{type:'builds',id:buildId}]:[];
    } else if(path.endsWith('/buildBetaDetail'))data={attributes:{internalBuildState:betaState}};
    else data={id:'6820833544',attributes:{bundleId:'kr.co.manee.app'}};
    return {ok:true,status:200,json:async()=>({data})};
  };
  return {calls,request,token:()=> 'disposable-token',wait:async()=>{},attempts:1};
}

test('TestFlight connection rejects another branch, workflow, build or event before Apple calls',async()=>{
  for(const overrides of [{GITHUB_REF:'refs/heads/main'},{GITHUB_EVENT_NAME:'pull_request'},
    {GITHUB_WORKFLOW_REF:'other'},{MANEE_INTERNAL_BUILD:'other'},{GITHUB_RUN_NUMBER:'1.2'},{GITHUB_RUN_ATTEMPT:'0'}]) {
    await assert.rejects(connectTestFlight152({...env,...overrides},{request:()=>assert.fail('No network permitted')}),/INTERNAL_CONNECT_NOT_REQUESTED/);
  }
});

test('only the exact processed 1.52 build is connected to the existing internal QA group',async()=>{
  const options=mock();const result=await connectTestFlight152(env,options);
  assert.equal(result.version,'152.1.1');assert.equal(result.processingState,'VALID');
  assert.equal(result.internalBuildState,'IN_BETA_TESTING');assert.equal(result.internalGroupConnected,true);
  assert.equal(result.invitationSent,false);assert.equal(result.reviewSubmitted,false);
  assert.equal(options.calls.filter(x=>x.method==='POST').length,1);
});

test('internal QA connection is idempotent and never selects a mismatched build',async()=>{
  const linked=mock({linked:true});await connectTestFlight152(env,linked);
  assert.equal(linked.calls.filter(x=>x.method==='POST').length,0);
  for(const [overrides,error] of [[{version:'150.1.1'},/BUILD_NOT_READY/],[{marketing:'1.50'},/WRONG_VERSION/],
    [{groupInternal:false},/WRONG_GROUP/],[{processing:'PROCESSING'},/BUILD_NOT_READY/]]) {
    const options=mock(overrides);await assert.rejects(connectTestFlight152(env,options),error);
    assert.equal(options.calls.filter(x=>x.method==='POST').length,0);
  }
});

test('1.56 only connects the exact signed run to the existing internal group and verifies beta readiness',async()=>{
  const branch156='refs/heads/codex/ios-final-156-20261109';
  const env156={...env,GITHUB_REF:branch156,
    GITHUB_WORKFLOW_REF:`unionconnect-kr/winners/.github/workflows/ios-signed-build.yml@${branch156}`,
    GITHUB_RUN_NUMBER:'11',GITHUB_RUN_ATTEMPT:'2',MANEE_INTERNAL_BUILD:'ios-20261109-1.56'};
  const build156={version:'156.11.2',marketing:'1.56'};
  const options=mock(build156);
  const status=await connectTestFlight(env156,options);
  assert.equal(status.marketingVersion,'1.56');
  assert.equal(status.version,'156.11.2');
  assert.equal(status.internalBuildState,'IN_BETA_TESTING');
  assert.equal(options.calls.filter(x=>x.method==='POST').length,1);
  await assert.rejects(connectTestFlight({...env156,GITHUB_REF:branch},{request:()=>assert.fail('No Apple call')}),/INTERNAL_CONNECT_NOT_REQUESTED/);
  await assert.rejects(connectTestFlight152(env156,{request:()=>assert.fail('No Apple call')}),/INTERNAL_CONNECT_NOT_REQUESTED/);
  await assert.rejects(connectTestFlight(env156,mock({...build156,betaState:'READY_FOR_BETA_TESTING'})),/INTERNAL_CONNECT_BETA_NOT_READY/);
  const wrongBuild=mock({...build156,version:'156.11.1'});
  await assert.rejects(connectTestFlight(env156,wrongBuild),/INTERNAL_CONNECT_BUILD_NOT_READY/);
  assert.equal(wrongBuild.calls.filter(x=>x.method==='POST').length,0);
});
