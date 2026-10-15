import test from 'node:test';
import assert from 'node:assert/strict';
import {readiness} from './ios-qa-readiness.mjs';
test('readiness is read only, fixed to MANEE and reports processing without exposing account fields',async()=>{
 let buildReads=0;const calls=[];
 const request=async(url,options)=>{
  calls.push(url);assert.ok(url.startsWith('https://api.appstoreconnect.apple.com/v1/'));assert.equal(options.method,'GET');assert.equal(options.redirect,'error');
  let data={data:[]};
  if(url.includes('/v1/apps/6820833544?'))data={data:{attributes:{bundleId:'kr.co.manee.app',email:'private-contact'}}};
  else if(url.includes('/v1/builds?'))data={data:[{attributes:{version:'1.6.1',processingState:++buildReads===1?'PROCESSING':'VALID',usesNonExemptEncryption:false,email:'private-contact'}}]};
  else if(url.includes('subscriptionGroups'))data={included:[{id:'6820834755',type:'subscriptions',attributes:{productId:'manee.store1.monthly',subscriptionPeriod:'ONE_MONTH',state:'READY_TO_SUBMIT'}}]};
  return {ok:true,status:200,json:async()=>data};
 };
 const result=await readiness({}, {request,token:()=> 'mock-only',wait:async()=>{},attempts:2});
 assert.equal(result.build.processingState,'VALID');assert.equal(result.subscriptions[0].productId,'manee.store1.monthly');
 assert.equal(result.reviewSubmitted,false);assert.equal(result.invitationSent,false);assert.doesNotMatch(JSON.stringify(result),/private-contact|mock-only/);
 assert.equal(buildReads,2);
});
test('another app identity blocks every later request',async()=>{
 let calls=0;await assert.rejects(readiness({}, {token:()=> 'mock-only',request:async()=>{calls++;return {ok:true,status:200,json:async()=>({data:{attributes:{bundleId:'other'}}})};}}),/IDENTITY_UNVERIFIED/);assert.equal(calls,1);
});
