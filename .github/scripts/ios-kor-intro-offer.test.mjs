import test from 'node:test';
import assert from 'node:assert/strict';
import {alignIntroOffer} from './ios-kor-intro-offer.mjs';

const branch = 'refs/heads/codex/ios-korea-intro-2m-20261109';
const env = {
  GITHUB_REPOSITORY:'unionconnect-kr/winners', GITHUB_REF:branch, GITHUB_EVENT_NAME:'push',
  GITHUB_WORKFLOW_REF:'unionconnect-kr/winners/.github/workflows/ios-kor-intro-offer.yml@' + branch,
  MANEE_KOR_INTRO_OFFER:'20261109-free-trial-two-months',
};
const korea = {data:{type:'territories',id:'KOR'}};
const old = {
  id:'eyJzIjoiNjgyMDgzNDc1NSIsImQiOjE3OTE1MjkyMDAsImkiOiJLUiIsInQiOiIiLCJwIjoiMCJ9',
  attributes:{offerMode:'FREE_TRIAL',duration:'ONE_MONTH',numberOfPeriods:1,startDate:'2026-10-09',endDate:null},
  relationships:{territory:korea},
};
const desired = {
  ...old,id:'new-korean-offer',
  attributes:{...old.attributes,duration:'TWO_MONTHS',startDate:'2026-11-11'},
};
const ended={...old,attributes:{...old.attributes,endDate:'2026-11-10'}};
function fixture({offers=[old],price='9900',after=[ended,desired],bundle='kr.co.manee.app',reject=false}={}) {
  const posts=[],patches=[];
  const request=async (url,options)=>{
    const route=new URL(url);
    assert.equal(route.origin,'https://api.appstoreconnect.apple.com');
    assert.equal(options.headers.Authorization,'Bearer disposable');
    let result;
    if(options.method==='PATCH'){
      assert.equal(route.pathname,'/v1/subscriptionIntroductoryOffers/'+old.id);
      const body=JSON.parse(options.body);
      assert.equal(body.data.id,old.id);
      assert.equal(body.data.type,'subscriptionIntroductoryOffers');
      const endDate=body.data.attributes.endDate;
      patches.push(endDate);
      const updated={...old,attributes:{...old.attributes,endDate}};
      offers=offers.map(x=>x.id===old.id?updated:x);
      return {ok:true,status:204,json:async()=>{throw SyntaxError('empty body');}};
    }else if(options.method==='POST'){
      assert.equal(route.pathname,'/v1/subscriptionIntroductoryOffers');
      posts.push(JSON.parse(options.body));
      if(reject)return {ok:false,status:409,json:async()=>({errors:[{code:'STATE_ERROR'}]})};
      offers=after;
      result={data:desired};
    }else if(route.pathname==='/v1/apps/6820833544'){
      result={data:{id:'6820833544',attributes:{bundleId:bundle}}};
    }else if(route.pathname.endsWith('/subscriptionGroups')){
      result={included:[{type:'subscriptions',id:'6820834755',attributes:{productId:'manee.store1.monthly',subscriptionPeriod:'ONE_MONTH',familySharable:false}}]};
    }else if(route.pathname.endsWith('/prices')){
      assert.equal(route.searchParams.get('filter[territory]'),'KOR');
      result={data:[{attributes:{startDate:null,preserved:false},relationships:{territory:korea,subscriptionPricePoint:{data:{id:'point'}}}}],
        included:[{type:'subscriptionPricePoints',id:'point',attributes:{customerPrice:price}}]};
    }else{
      assert.equal(route.pathname,'/v1/subscriptions/6820834755/introductoryOffers');
      assert.equal(route.searchParams.get('filter[territory]'),'KOR');
      result={data:offers};
    }
    return {ok:true,json:async()=>result};
  };
  return {posts,patches,options:{request,token:()=> 'disposable',now:new Date('2026-11-09T11:00:00Z'),wait:async()=>{}}};
}

test('only the designated push can use ASC credentials',async()=>{
  for(const changed of [{GITHUB_EVENT_NAME:'pull_request'},{GITHUB_REF:'refs/heads/main'},{GITHUB_WORKFLOW_REF:'wrong'},{MANEE_KOR_INTRO_OFFER:'wrong'}]){
    await assert.rejects(alignIntroOffer({...env,...changed},{request:()=>assert.fail('Unexpected Apple request')}),/UNAUTHORIZED_CONTEXT/);
  }
});
test('ends only the original offer and verifies one new nonoverlapping two-month offer',async()=>{
  const f=fixture();
  const result=await alignIntroOffer(env,f.options);
  assert.equal(result.changed,true);
  assert.equal(result.startDate,'2026-11-11');
  assert.deepEqual(f.patches,['2026-11-10']);
  assert.deepEqual(f.posts,[{data:{
    type:'subscriptionIntroductoryOffers',
    attributes:{startDate:'2026-11-11',duration:'TWO_MONTHS',offerMode:'FREE_TRIAL',numberOfPeriods:1},
    relationships:{subscription:{data:{type:'subscriptions',id:'6820834755'}},territory:korea},
  }}]);
});
test('existing desired offer is an idempotent read even after the change date',async()=>{
  const f=fixture({offers:[ended,desired]});
  assert.equal((await alignIntroOffer(env,{...f.options,now:new Date('2026-11-10')})).changed,false);
  assert.equal(f.posts.length,0);
  assert.equal(f.patches.length,0);
});
test('changed price, foreign app, future offer and wrong date all fail before mutation',async()=>{
  const future={...desired,attributes:{...desired.attributes,startDate:'2026-12-01'}};
  for(const [params,error] of [[{price:'10900'},/WRONG_PRICE/],[{bundle:'another.app'},/WRONG_APP/],[{offers:[old,future]},/UNEXPECTED_CURRENT_OFFER/]]){
    const f=fixture(params);
    await assert.rejects(alignIntroOffer(env,f.options),error);
    assert.equal(f.posts.length,0);
    assert.equal(f.patches.length,0);
  }
  const f=fixture();
  await assert.rejects(alignIntroOffer(env,{...f.options,now:new Date('2026-11-10')}),/OUTSIDE_CHANGE_DATE/);
  assert.equal(f.posts.length,0);
  assert.equal(f.patches.length,0);
});
test('unverified creation polls without creating a second offer',async()=>{
  const f=fixture({after:[ended]});
  await assert.rejects(alignIntroOffer(env,f.options),/POST_NOT_VERIFIED/);
  assert.equal(f.posts.length,1);
  assert.deepEqual(f.patches,['2026-11-10']);
});
test('definite creation rejection restores the previous indefinite offer',async()=>{
  const f=fixture({reject:true});
  await assert.rejects(alignIntroOffer(env,f.options),/HTTP_409_STATE_ERROR/);
  assert.equal(f.posts.length,1);
  assert.deepEqual(f.patches,['2026-11-10',null]);
});
test('resumes from a verified end date without patching it again',async()=>{
  const f=fixture({offers:[ended]});
  assert.equal((await alignIntroOffer(env,f.options)).changed,true);
  assert.equal(f.posts.length,1);
  assert.equal(f.patches.length,0);
});
