import test from 'node:test';
import assert from 'node:assert/strict';
import {auditRelease} from './ios-release-audit.mjs';
test('audit stays GET-only and excludes review credentials and account fields',async()=>{
 const calls=[];
 const request=async(url,options)=>{
  assert.equal(options.method,'GET');assert.equal(options.redirect,'error');assert.equal(new URL(url).origin,'https://api.appstoreconnect.apple.com');calls.push(url);
  let data=[];const included=[];
  if(url.includes('/apps/6820833544?'))data={id:'6820833544',attributes:{bundleId:'kr.co.manee.app',email:'secret-contact'}};
  else if(url.includes('/appStoreVersions?'))data=[{id:'version-id',attributes:{versionString:'1.0',appStoreState:'PREPARE_FOR_SUBMISSION'}}];
  else if(url.endsWith('/appStoreReviewDetail'))data={attributes:{demoAccountRequired:true,demoAccountName:'secret-user',demoAccountPassword:'secret-password',notes:'private-notes',contactEmail:'secret-contact'}};
  else if(url.includes('/subscriptionGroups?'))included.push({id:'sub-id',type:'subscriptions',attributes:{productId:'manee.store1.monthly',state:'MISSING_METADATA'}});
  else if(url.includes('/introductoryOffers?'))data=[{id:'offer-id',attributes:{offerMode:'FREE_TRIAL',duration:'ONE_MONTH',numberOfPeriods:1},relationships:{territory:{data:{id:'KOR'}}}}];
  return {ok:true,status:200,json:async()=>({data,included})};
 };
 const result=await auditRelease({}, {request,token:()=> 'secret-token'});
 assert.equal(result.writesPerformed,false);assert.equal(result.versions[0].review.passwordPresent,true);assert.equal(result.subscriptions[0].koreanOffers[0].offerMode,'FREE_TRIAL');
 assert.doesNotMatch(JSON.stringify(result),/secret-|private-notes/);assert.ok(calls.length>5);
});
test('wrong app identity stops the audit before any follow-up read',async()=>{
 let calls=0;await assert.rejects(()=>auditRelease({}, {token:()=> 'fixture',request:async()=>{calls++;return {ok:true,status:200,json:async()=>({data:{id:'foreign',attributes:{bundleId:'foreign'}}})};}}),/WRONG_APP/);assert.equal(calls,1);
});
