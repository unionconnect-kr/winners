import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createHandler,TERMS_VERSION} from '../supabase/functions/manee-social-auth/handler.mjs';
const uid='15200000-0000-4000-8000-000000000001',sid='15200000-0000-4000-8000-000000000002';
const proof='a'.repeat(64),challenge='15200000-0000-4000-8000-000000000003';
const token='synthetic.'+Buffer.from(JSON.stringify({session_id:sid})).toString('base64url')+'.synthetic';
const signup={action:'signup',provider:'kakao',role:'owner',displayName:'매니 QA',storeName:'매니 QA store',
  ageConfirmed:true,termsAccepted:true,privacyAccepted:true,termsVersion:TERMS_VERSION,privacyVersion:TERMS_VERSION,
  recovery_email:' SOCIAL152@Example.COM ',sms_challenge_id:challenge,sms_proof:proof};
function harness({profile=null,provider='kakao',rpcError=null}={}){
 const calls=[];
 const admin={auth:{async getUser(){return {data:{user:{id:uid,identities:[{provider}]}}};}},
  from(){const q={select(){return q},eq(){return q},async maybeSingle(){return {data:profile,error:null}}};return q;},
  async rpc(name,args){calls.push({name,args});return name==='consume_auth_rate_limit'?{data:true}:
   rpcError?{error:{message:rpcError}}:{data:{ok:true,userId:uid,alreadyRegistered:false}};}};
 const handler=createHandler({admin});
 return {calls,async run(body=signup,authorization='Bearer '+token){const response=await handler(new Request('https://synthetic.invalid',{method:'POST',headers:{authorization,'Content-Type':'application/json'},body:JSON.stringify(body)}));return {status:response.status,body:await response.json()};}};
}
test('new social signup requires email and proof before privileged signup work',async()=>{
 for(const override of [{recovery_email:''},{recovery_email:'x..y@example.com'},{sms_challenge_id:'wrong'},{sms_proof:'wrong'}]){
  const h=harness();const r=await h.run({...signup,...override});assert.equal(r.status,400);assert.equal(h.calls.length,0);
 }
 const h=harness();assert.equal((await h.run(signup,'Bearer malformed')).status,401);assert.equal(h.calls.length,0);
});
test('social signup binds normalized email and hashed proof to the verified session actor',async()=>{
 const h=harness();assert.equal((await h.run({...signup,user_id:'other',session_id:'other',sms_proof_hash:'forged'})).status,201);
 const rpc=h.calls.find(x=>x.name==='manee_social_signup');assert.equal(rpc.args.p_user_id,uid);
 const p=rpc.args.p_payload;assert.equal(p.recovery_email,'social152@example.com');assert.equal(p.session_id,sid);
 assert.equal(p.sms_challenge_id,challenge);assert.equal(p.sms_proof_hash,createHash('sha256').update(proof).digest('hex'));
 assert.equal(Object.hasOwn(p,'sms_proof'),false);assert.equal(p.termsVersion,TERMS_VERSION);assert.equal(p.ageConfirmed,true);
});
test('existing social login and link context never acquire new-signup requirements',async()=>{
 const profile={user_id:uid,status:'active',display_name:'existing'};
 const h=harness({profile});assert.equal((await h.run({action:'signup'})).body.alreadyRegistered,true);
 const context=await h.run({action:'context'});assert.equal(context.body.registered,true);assert.equal(context.body.userId,uid);
 assert.equal(h.calls.length,0);
});
test('new signup preserves provider and consent validation and returns safe policy errors',async()=>{
 for(const override of [{termsAccepted:false},{privacyAccepted:false},{ageConfirmed:false},{provider:'naver'}]){
  const h=harness();const r=await h.run({...signup,...override});assert.ok([400,403].includes(r.status));assert.equal(h.calls.length,0);
 }
 for(const [error,status] of [['phone_taken',409],['email_taken',409],['phone_verification_required',400],['database internal detail',503]]){
  const h=harness({rpcError:error});const r=await h.run();assert.equal(r.status,status);assert.equal(JSON.stringify(r.body).includes('database internal detail'),false);
 }
});
