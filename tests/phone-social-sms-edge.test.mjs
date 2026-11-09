import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {createContext,Script} from 'node:vm';
import {webcrypto} from 'node:crypto';
const uid='15200000-0000-4000-8000-000000000300',sid='15200000-0000-4000-8000-000000000301',uname='s_'+uid.replaceAll('-','').slice(0,28);
const token='x.'+Buffer.from(JSON.stringify({session_id:sid})).toString('base64url')+'.x',hash='a'.repeat(64);
function harness(options={}) {
  const calls=[];
  let handler;
  const env={
    SUPABASE_URL:'https://bhwuuxcrzxespkjlmqxr.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY:'synthetic-secret',
    SUPABASE_ANON_KEY:'synthetic-public',
    SOLAPI_API_KEY:'synthetic-solapi-key',
    SOLAPI_API_SECRET:'synthetic-solapi-secret',
    SOLAPI_SENDER_NUMBER:'01000000000',
  };
  const admin={
    async rpc(name,args) {
      calls.push({name,args});
      if(name==='consume_auth_rate_limit')return {data:true};
      switch(args.p_action){
        case 'credentials':return {data:options.bindMethod==='social_reauth'
          ?{ok:false,error:'social_reauth_required'}
          :{ok:true,username:uname,email:'fixture@example.invalid',bind_method:options.bindMethod||'recent_social'}};
        case 'request':return {data:options.phoneTaken?{ok:false,error:'phone_taken'}:{ok:true,send_allowed:true}};
        case 'finish_bind':return {data:options.finishResult||{ok:true}};
        default:return {data:{ok:true}};
      }
    },
    auth:{
      async getUser(value){
        calls.push({name:'getUser',token:value});
        return options.badAuth?{data:{user:null},error:{code:'invalid'}}
          :{data:{user:{id:uid,identities:[{provider:options.noSocial?'email':'kakao'}]}},error:null};
      }
    }
  };
  const passwordClient={auth:{
    async signInWithPassword(){
      calls.push({name:'passwordSignIn'});
      return {data:{user:{id:options.wrongPasswordUser?'different-user':uid}},error:null};
    },
    async signOut(args){calls.push({name:'passwordSignOut',args});}
  }};
  const src=readFileSync(new URL('../supabase/functions/manee-sms-auth/index.ts',import.meta.url),'utf8')
    .split('\n').filter(line=>!line.startsWith('import ')).join('\n');
  new Script(stripTypeScriptTypes(src)).runInContext(createContext({
    Request,Response,TextEncoder,crypto:webcrypto,atob,console,
    createClient:(_url,key)=>key===env.SUPABASE_ANON_KEY?passwordClient:admin,
    isManeeProjectUrl:url=>url===env.SUPABASE_URL,
    username:value=>String(value||'').trim().toLowerCase(),
    phone:value=>/^010[0-9]{8}$/.test(value)?'+82'+value.slice(1):null,
    validPassword:value=>typeof value==='string'&&value.length>0,
    validNewPassword:()=>true,sha:async()=>hash,hmac:async()=>hash,otp:()=> '123456',proof:()=>hash,
    sendSms:async(...args)=>{calls.push({name:'sendSms',args});return true},
    Deno:{env:{get:name=>env[name]},serve:fn=>handler=fn}
  }));
  return {calls,async run(values={}){
    const response=await handler(new Request('https://synthetic.invalid',{
      method:'POST',
      headers:{apikey:env.SUPABASE_ANON_KEY,authorization:'Bearer '+(options.token||token),'Content-Type':'application/json'},
      body:JSON.stringify({action:'request',purpose:'signup_social',username:uname,phone:'01000000000',...values})
    }));
    return {status:response.status,body:await response.json()};
  }};
}

test('social SMS requests use the authenticated OAuth UID and session',async()=>{const h=harness(),r=await h.run();assert.equal(r.status,200);const call=h.calls.find(c=>c.name==='manee_sms_service'&&c.args.p_action==='request');assert.equal(call.args.p_payload.user_id,uid);assert.equal(call.args.p_payload.session_id,sid);assert.equal(call.args.p_payload.purpose,'signup_social');assert.equal(call.args.p_payload.username,uname);assert.equal(h.calls.filter(c=>c.name==='sendSms').length,1)});
test('mismatched identity, session or social username never sends SMS',async()=>{for(const options of [{badAuth:true},{noSocial:true},{token:'x.bad-json.x'}]){const h=harness(options);assert.equal((await h.run()).status,400);assert.equal(h.calls.some(c=>c.name==='sendSms'),false)}const h=harness();assert.equal((await h.run({username:'different_user'})).status,400);assert.equal(h.calls.some(c=>c.name==='sendSms'),false)});
test('another active account phone is surfaced as a duplicate without sending a code',async()=>{const h=harness({phoneTaken:true}),r=await h.run();assert.equal(r.status,409);assert.equal(r.body.error,'phone_taken');assert.equal(h.calls.some(c=>c.name==='sendSms'),false)});
test('social OTP verification is scoped to the same identity and session',async()=>{const h=harness(),r=await h.run({action:'verify',challenge_id:'15200000-0000-4000-8000-000000000302',code:'123456'});assert.equal(r.status,200);assert.equal(r.body.proof,hash);const call=h.calls.find(c=>c.name==='manee_sms_service'&&c.args.p_action==='verify');assert.equal(call.args.p_payload.user_id,uid);assert.equal(call.args.p_payload.session_id,sid);assert.equal(call.args.p_payload.purpose,'signup_social')});

test('existing phone enrollment uses the server-authorized sign-in method', async () => {
  const social=harness();
  assert.equal((await social.run({purpose:'bind',bind_method:'password'})).status,200);
  const sent=social.calls.find(call=>call.args?.p_action==='request');
  assert.equal(sent.args.p_payload.bind_method,'recent_social');
  assert.equal(sent.args.p_payload.user_id,uid);
  assert.equal(sent.args.p_payload.session_id,sid);
  assert.equal(social.calls.some(call=>call.name==='passwordSignIn'),false);

  const stale=harness({bindMethod:'social_reauth'});
  const denied=await stale.run({purpose:'bind',bind_method:'recent_social'});
  assert.equal(denied.status,403);
  assert.equal(denied.body.error,'social_reauth_required');
  assert.equal(stale.calls.some(call=>call.name==='sendSms'),false);
});

test('ordinary bind still reauthenticates the same user by current password', async () => {
  const password=harness({bindMethod:'password'});
  assert.equal((await password.run({purpose:'bind',bind_method:'recent_social'})).status,400);
  assert.equal(password.calls.some(call=>call.name==='sendSms'),false);
  assert.equal((await password.run({purpose:'bind',current_password:'fixture-password'})).status,200);
  assert.equal(password.calls.some(call=>call.name==='passwordSignIn'),true);
  assert.equal(password.calls.find(call=>call.name==='passwordSignOut').args.scope,'local');
  assert.equal(password.calls.find(call=>call.args?.p_action==='request').args.p_payload.bind_method,'password');

  const wrong=harness({bindMethod:'password',wrongPasswordUser:true});
  assert.equal((await wrong.run({purpose:'bind',current_password:'fixture-password'})).status,400);
  assert.equal(wrong.calls.some(call=>call.name==='sendSms'),false);
});

test('verified existing account bind completes through one scoped transactional RPC', async () => {
  const challenge='15200000-0000-4000-8000-000000000302';
  const scope={purpose:'bind',challenge_id:challenge,user_id:'different-user',session_id:'different-session'};
  const h=harness();
  assert.equal((await h.run({...scope,action:'verify',code:'123456'})).status,200);
  assert.equal((await h.run({...scope,action:'bind',proof:hash})).status,200);
  const actions=h.calls.filter(call=>call.name==='manee_sms_service').map(call=>call.args);
  assert.deepEqual(actions.map(call=>call.p_action),['verify','finish_bind']);
  for(const action of actions){
    assert.equal(action.p_payload.user_id,uid);
    assert.equal(action.p_payload.session_id,sid);
    assert.equal(action.p_payload.username,uname);
    assert.equal(action.p_payload.id,challenge);
    assert.equal(action.p_payload.purpose,'bind');
  }
  const duplicate=harness({finishResult:{ok:false,error:'phone_taken'}});
  assert.equal((await duplicate.run({...scope,action:'bind',proof:hash})).status,409);
});
