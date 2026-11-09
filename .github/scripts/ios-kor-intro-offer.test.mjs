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
  attributes:{...old.attributes,duration:'TWO_MONTHS',startDate:'2026-11-09'},
};
function fixture({offers=[old],price='9900',after=[desired],bundle='kr.co.manee.app'}={}) {
  const posts=[];
  const request=async (url,options)=>{
    const route=new URL(url);
    assert.equal(route.origin,'https://api.appstoreconnect.apple.com');
    assert.equal(options.headers.Authorization,'Bearer disposable');
    let result;
    if(options.method==='POST'){
      assert.equal(route.pathname,'/v1/subscriptionIntroductoryOffers');
      posts.push(JSON.parse(options.body));
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
  return {posts,options:{request,token:()=> 'disposable',now:new Date('2026-11-09T11:00:00Z'),wait:async()=>{}}};
}

test('only the designated push can use ASC credentials',async()=>{
  for(const changed of [{GITHUB_EVENT_NAME:'pull_request'},{GITHUB_REF:'refs/heads/main'},{GITHUB_WORKFLOW_REF:'wrong'},{MANEE_KOR_INTRO_OFFER:'wrong'}]){
    await assert.rejects(alignIntroOffer({...env,...changed},{request:()=>assert.fail('Unexpected Apple request')}),/UNAUTHORIZED_CONTEXT/);
  }
});
test('writes only one two-month free trial for the expected Korean product and verifies it',async()=>{
  const f=fixture();
  assert.equal((await alignIntroOffer(env,f.options)).changed,true);
  assert.deepEqual(f.posts,[{data:{
    type:'subscriptionIntroductoryOffers',
    attributes:{startDate:'2026-11-09',duration:'TWO_MONTHS',offerMode:'FREE_TRIAL',numberOfPeriods:1},
    relationships:{subscription:{data:{type:'subscriptions',id:'6820834755'}},territory:korea},
  }}]);
});
test('existing desired offer is an idempotent read even after the change date',async()=>{
  const ended={...old,attributes:{...old.attributes,endDate:'2026-11-09'}};
  const f=fixture({offers:[ended,desired]});
  assert.equal((await alignIntroOffer(env,{...f.options,now:new Date('2026-11-10')})).changed,false);
  assert.equal(f.posts.length,0);
});
test('changed price, foreign app, future offer and wrong date all fail before mutation',async()=>{
  const future={...desired,attributes:{...desired.attributes,startDate:'2026-12-01'}};
  for(const [params,error] of [[{price:'10900'},/WRONG_PRICE/],[{bundle:'another.app'},/WRONG_APP/],[{offers:[old,future]},/UNEXPECTED_CURRENT_OFFER/]]){
    const f=fixture(params);
    await assert.rejects(alignIntroOffer(env,f.options),error);
    assert.equal(f.posts.length,0);
  }
  const f=fixture();
  await assert.rejects(alignIntroOffer(env,{...f.options,now:new Date('2026-11-10')}),/OUTSIDE_CHANGE_DATE/);
  assert.equal(f.posts.length,0);
});
test('unverified creation polls without creating a second offer',async()=>{
  const f=fixture({after:[old]});
  await assert.rejects(alignIntroOffer(env,f.options),/POST_NOT_VERIFIED/);
  assert.equal(f.posts.length,1);
});
