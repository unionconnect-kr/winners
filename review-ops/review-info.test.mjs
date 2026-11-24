import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,createPublicKey,diffieHellman,hkdfSync,randomBytes,createCipheriv} from 'node:crypto';
import {reviewInfo,decryptReviewPayload} from './review-info.mjs';
const pair=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const pem=pair.privateKey.export({type:'pkcs8',format:'pem'});
const branch='refs/heads/codex/ios-purchase-account-testflight-20261123';
const env={GITHUB_REPOSITORY:'unionconnect-kr/winners',GITHUB_REF:branch,GITHUB_EVENT_NAME:'push',GITHUB_WORKFLOW_REF:`unionconnect-kr/winners/.github/workflows/app-review-info.yml@${branch}`,ASC_PRIVATE_KEY:pem};
const payload={appId:'6820833544',version:'1.56',reviewId:'review-1',demoAccountName:'todtod07',password:'new-disposable-test-password',notesAppend:'Verified on a physical iPhone. SMS coordination remains required for first-time signup.'};
function seal(value=payload){
 const ephemeral=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
 const shared=diffieHellman({privateKey:ephemeral.privateKey,publicKey:createPublicKey(pem)});
 const salt=randomBytes(32),iv=randomBytes(12),aad=Buffer.from('manee-review-info:6820833544:1.56:review-1');
 const key=Buffer.from(hkdfSync('sha256',shared,salt,aad,32)),cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(aad);
 const ciphertext=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);
 return {format:'manee-review-info-v1',reviewId:'review-1',ephemeralPublicKey:Buffer.from(ephemeral.publicKey.export({type:'spki',format:'pem'})).toString('base64'),salt:salt.toString('base64'),iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),ciphertext:ciphertext.toString('base64')};
}
function fixture({app='6820833544',username='todtod07',versions,ignoreUpdate=false}={}){
 let attributes={demoAccountName:username,demoAccountPassword:'old-disposable-test-password',notes:'Prior password: old-disposable-test-password',demoAccountRequired:true};
 const calls=[];
 return {calls,token:()=> 'disposable-token',request:async(url,options)=>{
  const path=new URL(url).pathname;calls.push({path,method:options.method,body:options.body});
  let data;
  if(path==='/v1/apps/6820833544')data={id:app,attributes:{bundleId:'kr.co.manee.app'}};
  else if(path.endsWith('/appStoreVersions'))data=versions??[{id:'version-1',attributes:{versionString:'1.56',platform:'IOS',appStoreState:'REJECTED'}}];
  else {
   if(options.method==='PATCH'&&!ignoreUpdate)attributes=JSON.parse(options.body).data.attributes;
   data={id:'review-1',type:'appStoreReviewDetails',attributes};
  }
  return {ok:true,json:async()=>({data})};
 }};
}
test('review metadata access is restricted before any Apple request',async()=>{
 for(const overrides of [{GITHUB_REPOSITORY:'other/repo'},{GITHUB_REF:'refs/heads/main'},{GITHUB_EVENT_NAME:'pull_request'},{GITHUB_WORKFLOW_REF:'other'}]){
  await assert.rejects(reviewInfo({...env,...overrides},{request:()=>assert.fail('No network')}),/REVIEW_NOT_REQUESTED/);
 }
});
test('read mode exposes only the public encryption key and non-secret review state',async()=>{
 const f=fixture(),result=await reviewInfo(env,f);
 assert.equal(result.updated,false);assert.equal(result.demoAccountName,'todtod07');assert.equal(result.reviewSubmitted,false);
 assert.match(result.encryptionPublicKey,/BEGIN PUBLIC KEY/);
 assert.doesNotMatch(JSON.stringify(result),/PRIVATE KEY|old-disposable-test-password|Prior password/);
 assert.equal(f.calls.some(c=>c.method!=='GET'),false);
});
test('sealed review credentials authenticate the resource identifier and ciphertext',()=>{
 const envelope=seal();assert.deepEqual(decryptReviewPayload(envelope,pem),payload);
 assert.throws(()=>decryptReviewPayload({...envelope,reviewId:'another-review'},pem));
 assert.throws(()=>decryptReviewPayload({...envelope,ciphertext:Buffer.from('tampered').toString('base64')},pem));
 assert.doesNotMatch(JSON.stringify(envelope),/new-disposable-test-password/);
});
test('the exact review details are updated and read back without selecting a build or submitting review',async()=>{
 const f=fixture(),result=await reviewInfo(env,{...f,envelope:seal()});
 assert.equal(result.updated,true);assert.equal(result.passwordVerified,true);assert.equal(result.notesVerified,true);
 assert.equal(result.reviewSubmitted,false);assert.equal(result.buildSelected,false);
 const writes=f.calls.filter(c=>c.method!=='GET');assert.equal(writes.length,1);assert.equal(writes[0].path,'/v1/appStoreReviewDetails/review-1');
 const attrs=JSON.parse(writes[0].body).data.attributes;
 assert.deepEqual(Object.keys(attrs).sort(),['demoAccountName','demoAccountPassword','demoAccountRequired','notes']);
 assert.equal(attrs.demoAccountPassword,payload.password);assert.doesNotMatch(attrs.notes,/old-disposable/);
 assert.doesNotMatch(JSON.stringify(result),/new-disposable-test-password|PRIVATE KEY/);
});
test('another app, changed account, ambiguous version or mismatched envelope cannot be written',async()=>{
 for(const options of [{app:'another'},{username:'another'}, {versions:[]}, {versions:[{id:'1',attributes:{versionString:'1.56',platform:'IOS'}},{id:'2',attributes:{versionString:'1.56',platform:'IOS'}}]}]){
  const f=fixture(options);await assert.rejects(reviewInfo(env,{...f,envelope:seal()}));assert.equal(f.calls.some(c=>c.method==='PATCH'),false);
 }
 for(const patch of [{appId:'other'},{version:'2.0'},{reviewId:'other'},{demoAccountName:'other'},{password:'short'}]){
  const f=fixture();await assert.rejects(reviewInfo(env,{...f,envelope:seal({...payload,...patch})}),/REVIEW_INVALID_PAYLOAD/);assert.equal(f.calls.some(c=>c.method==='PATCH'),false);
 }
});
test('a write without matching read-back state is not reported complete',async()=>{
 const f=fixture({ignoreUpdate:true});await assert.rejects(reviewInfo(env,{...f,envelope:seal()}),/REVIEW_UPDATE_NOT_VERIFIED/);
});
