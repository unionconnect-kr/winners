// Execute the complete deployed handlers with controlled Auth/DB services.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {transformSync} from 'esbuild';
const root=new URL('../../supabase/functions/',import.meta.url);
function endpoint(slug,{roles=['staff'],badPassword=false,profile=true}={}){
  let handler,signedOut=0,created=0;const calls=[];
  const query={select(){return this;},eq(){return this;},maybeSingle:async()=>({data:profile?{user_id:'u',username:'manee01',status:'active',display_name:'테스트'}:null})};
  const api={from:()=>query,rpc:async(name,args)=>{
    calls.push([name,args]);if(name==='consume_auth_rate_limit')return{data:true};
    if(name==='manee_staff_portal')return{data:{ok:true,profile:{user_id:'u'},memberships:roles.map(role=>({role}))}};
    if(name==='manee_support_recovery_service')return{data:{ok:true,email:'u@test'}};
    if(name==='manee_sms_service')return{data:{ok:true,send_allowed:false}};
    return{data:false};
  },auth:{admin:{getUserById:async()=>({data:{user:{id:'u',email:'u@test'}}}),createUser:async()=>{created++;return{};}},getUser:async()=>({data:{user:{id:'u'}}}),signInWithPassword:async()=>badPassword?{error:{message:'wrong'}}:{data:{session:{access_token:'access',refresh_token:'refresh'},user:{id:'u'}}},signOut:async opts=>{assert.equal(opts.scope,'local');signedOut++;return{};}}};
  const context={Request,Response,TextEncoder,URL,AbortSignal,crypto,atob,console,createClient:()=>api,Deno:{env:{get:k=>({SUPABASE_URL:'https://obpkzecgswnfuyhwvncd.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'secret-test',SUPABASE_ANON_KEY:'pub-test',SOLAPI_API_KEY:'test',SOLAPI_API_SECRET:'test',SOLAPI_SENDER_NUMBER:'0212345678'}[k])},serve:fn=>{handler=fn;}}};
  vm.createContext(context);
  let source=readFileSync(new URL(slug+'/index.ts',root),'utf8').replace(/^import .*$/gm,'');
  if(slug==='manee-sms-auth')source=readFileSync(new URL(slug+'/core.ts',root),'utf8').replace(/export /g,'')+'\n'+source;
  vm.runInContext(transformSync(source,{loader:'ts',format:'iife'}).code,context);
  return{calls,get signedOut(){return signedOut;},get created(){return created;},async request(body){const r=await handler(new Request('https://test.local',{method:'POST',headers:{apikey:'pub-test',authorization:'Bearer e30.'+btoa(JSON.stringify({session_id:'sid'}))+'.x'},body:JSON.stringify(body)}));return{status:r.status,body:await r.json()};}};
}
for(const [role,roles,status] of [['staff',['owner'],403],['owner',['staff'],403],['owner',['owner'],200],['staff',['manager'],200],['staff',[],200],[null,['owner'],200]]){
  test('login server checks '+role+' against '+roles.join('/')+' after valid credentials',async()=>{const e=endpoint('manee-login',{roles}),r=await e.request({username:'manee01',password:'qwer1234',...(role?{role}:{})});assert.equal(r.status,status);assert.equal(!!r.body.session,status===200);assert.equal(e.signedOut,status===403?1:0);});
}
test('wrong password does not reveal account role',async()=>{const r=await endpoint('manee-login',{roles:['owner'],badPassword:true}).request({username:'manee01',password:'wrong',role:'staff'});assert.equal(r.status,401);assert.equal(r.body.error,'invalid_credentials');assert.ok(!r.body.session);});
for(const slug of ['manee-signup','manee-staff-signup','manee-check-username']){
  test(slug+' rejects five-character username before account creation',async()=>{const e=endpoint(slug),r=await e.request({username:'abc12',password:'qwer1234',age_14_plus_confirmed:true,store_name:'테스트점',display_name:'테스트'});assert.equal(r.status,400);assert.equal(r.body.error,'invalid_username');assert.equal(e.created,0);});
}
for(const slug of ['manee-signup','manee-staff-signup'])for(const password of ['12345678','abcdefgh']){
  test(slug+' rejects '+password+' before SMS proof consumption',async()=>{const e=endpoint(slug),r=await e.request({username:'newqa12',password,age_14_plus_confirmed:true,store_name:'테스트점',display_name:'테스트'});assert.equal(r.body.error,'invalid_password');assert.equal(e.created,0);assert.ok(!e.calls.some(([n,a])=>n==='manee_sms_service'&&a.p_action==='claim'));});
}
for(const action of ['reset','change_password'])test('recovery '+action+' rejects a weak new password',async()=>{const e=endpoint('manee-account-recovery'),r=await e.request({action,username:'manee01',current_password:'legacy',new_password:'abcdefgh',reset_code:'123456'});assert.equal(r.body.error,'invalid_password');assert.ok(!e.calls.some(([n,a])=>n==='manee_support_recovery_service'&&a.p_action==='consume'));});
test('SMS signup requires six characters but existing short-username recovery still works',async()=>{
  const e=endpoint('manee-sms-auth'),a=await e.request({action:'request',purpose:'signup_staff',username:'abc12',phone:'01012345678'});assert.equal(a.body.error,'invalid_username');
  const b=await e.request({action:'request',purpose:'reset',username:'old1',phone:'01012345678'});assert.equal(b.body.ok,true);
});
test('SMS reset rejects a weak password before claiming a verified proof',async()=>{
  const e=endpoint('manee-sms-auth'),r=await e.request({action:'reset',purpose:'reset',username:'manee01',challenge_id:'00000000-0000-4000-8000-000000000000',proof:'a'.repeat(64),new_password:'abcdefgh'});assert.equal(r.body.error,'invalid_password');assert.ok(!e.calls.some(([n,a])=>n==='manee_sms_service'&&a.p_action==='claim'));
});
