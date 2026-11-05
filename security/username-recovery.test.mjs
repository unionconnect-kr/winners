import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {createHandler} from '../supabase/functions/manee-find-username/handler.mjs';
import {sendSms} from '../supabase/functions/manee-find-username/core.mjs';
let db;
before(async()=>{
  db=new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE SCHEMA private;
    GRANT USAGE ON SCHEMA private TO service_role;
    CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,encrypted_password text,banned_until timestamptz);
    CREATE TABLE public.profiles(user_id uuid PRIMARY KEY,username text,status text,phone_e164 text);
    CREATE TABLE public.platform_admins(user_id uuid,status text);
    CREATE TABLE private.manee_sms_bindings(user_id uuid PRIMARY KEY,phone_e164 text,verified_at timestamptz DEFAULT now());
    CREATE TABLE private.manee_sms_challenges(id uuid PRIMARY KEY,purpose text NOT NULL,username text NOT NULL,phone_e164 text NOT NULL,
      phone_hash text NOT NULL,code_hash text,proof_hash text,status text NOT NULL DEFAULT 'sending',failed_attempts integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT clock_timestamp(),expires_at timestamptz NOT NULL DEFAULT clock_timestamp()+interval '3 minutes',finished_at timestamptz,
      CONSTRAINT manee_sms_challenges_purpose_check CHECK(purpose IN ('signup_owner','signup_staff','reset','bind')));
    ALTER TABLE private.manee_sms_challenges ENABLE ROW LEVEL SECURITY;
    CREATE TABLE public.limit_calls(action text,key text); CREATE TABLE public.block_limits(flag boolean);
    CREATE FUNCTION public.consume_auth_rate_limit(p_action text,p_key_hash text,p_window_seconds integer,p_max_attempts integer)
      RETURNS boolean LANGUAGE plpgsql AS $$BEGIN INSERT INTO public.limit_calls VALUES(p_action,p_key_hash);RETURN NOT EXISTS(SELECT 1 FROM public.block_limits);END;$$;
  `);
  await db.exec(readFileSync(new URL('./username-recovery.sql',import.meta.url),'utf8'));
});
after(()=>db?.close());
const good='a'.repeat(64),bad='b'.repeat(64);
async function seed(name,phone,options={}){
  const id=crypto.randomUUID();
  await db.query('INSERT INTO auth.users VALUES($1,$2,$3,$4)',[id,options.social?'social@example.test':`u-${id.replaceAll('-','')}@auth.manee.local`,options.social?'':'hash',options.banned?'2099-01-01':null]);
  await db.query('INSERT INTO public.profiles VALUES($1,$2,$3,$4)',[id,name,options.disabled?'disabled':'active',phone]);
  if(!options.unverified)await db.query("INSERT INTO private.manee_sms_bindings VALUES($1,$2,now()-interval '1 day')",[id,phone]);
  if(options.admin)await db.query("INSERT INTO public.platform_admins VALUES($1,'active')",[id]);
  return id;
}
async function rpc(action,payload){return (await db.query('SELECT public.manee_find_username_service($1,$2::jsonb) AS value',[action,JSON.stringify(payload)])).rows[0].value;}
async function request(phone){const id=crypto.randomUUID();const r=await rpc('request',{id,phone,phone_hash:Buffer.from(phone).toString('hex').padEnd(64,'0'),ip_hash:good,code_hash:good});return {id,...r};}
async function sent(id){assert.equal((await rpc('sent',{id})).ok,true);}

test('only the service role can invoke recovery or read its private storage',async()=>{
  const r=(await db.query(`SELECT has_function_privilege('anon','public.manee_find_username_service(text,jsonb)','execute') AS anon,
    has_function_privilege('authenticated','public.manee_find_username_service(text,jsonb)','execute') AS authenticated,
    has_function_privilege('service_role','public.manee_find_username_service(text,jsonb)','execute') AS service,
    has_table_privilege('anon','private.manee_sms_challenges','select') AS table_read`)).rows[0];
  assert.deepEqual(r,{anon:false,authenticated:false,service:true,table_read:false});
});
test('phone lookup returns no usernames before OTP and only bound active ordinary accounts after OTP',async()=>{
  const ph='+821011110001';await seed('owner_one',ph);await seed('staff_two',ph);
  await seed('excluded_social',ph,{social:true});await seed('excluded_unverified',ph,{unverified:true});
  await seed('excluded_disabled',ph,{disabled:true});await seed('excluded_banned',ph,{banned:true});await seed('excluded_admin',ph,{admin:true});
  await seed('another_phone','+821011110002');
  const r=await request(ph);assert.equal(r.send_allowed,true);assert.equal('usernames' in r,false);
  assert.equal((await rpc('verify',{id:r.id,code_hash:good})).ok,false);
  await sent(r.id);
  const found=await rpc('verify',{id:r.id,code_hash:good,phone:'+821011110002',username:'another_phone'});
  assert.deepEqual(found,{ok:true,usernames:['owner_one','staff_two']});
  assert.equal((await rpc('verify',{id:r.id,code_hash:good})).ok,false);
  const c=(await db.query('SELECT code_hash,proof_hash,status FROM private.manee_sms_challenges WHERE id=$1',[r.id])).rows[0];
  assert.deepEqual(c,{code_hash:null,proof_hash:null,status:'completed'});
});
test('wrong code locks after five attempts and cannot be replayed with the correct code',async()=>{
  const ph='+821011110003';await seed('attempt_user',ph);const r=await request(ph);await sent(r.id);
  for(let i=0;i<5;i++)assert.equal((await rpc('verify',{id:r.id,code_hash:bad})).ok,false);
  assert.equal((await rpc('verify',{id:r.id,code_hash:good})).ok,false);
});
test('expired or failed-delivery challenges never return an account',async()=>{
  for(const [ph,mode] of [['+821011110004','expired'],['+821011110005','failed']]){
    await seed('user_'+mode,ph);const r=await request(ph);
    if(mode==='failed')await rpc('failed',{id:r.id});else{await sent(r.id);await db.query("UPDATE private.manee_sms_challenges SET expires_at=now()-interval '1 second' WHERE id=$1",[r.id]);}
    assert.equal((await rpc('verify',{id:r.id,code_hash:good})).ok,false);
  }
});
test('phone binding changes and deleted accounts are rechecked after verification',async()=>{
  const ph='+821011110006',id=await seed('changed_binding',ph);const r=await request(ph);await sent(r.id);
  await db.query('UPDATE private.manee_sms_bindings SET phone_e164=$1 WHERE user_id=$2',['+821011110007',id]);
  assert.deepEqual(await rpc('verify',{id:r.id,code_hash:good}),{ok:true,usernames:[]});
});
test('unknown phones do not send and share resend and budget limits with ordinary SMS',async()=>{
  const ph='+821011110008',r=await request(ph);assert.equal(r.send_allowed,false);
  assert.equal((await request(ph)).error,'rate_limited');
  assert.equal((await rpc('verify',{id:r.id,code_hash:good})).ok,false);
  const actions=(await db.query('SELECT DISTINCT action FROM public.limit_calls')).rows.map(x=>x.action).sort();
  assert.deepEqual(actions,['sms_ip_hour','sms_phone_day','sms_phone_hour','sms_staging_day']);
  await db.exec('INSERT INTO public.block_limits VALUES(true)');
  assert.equal((await request('+821011110009')).error,'rate_limited');
  await db.exec('DELETE FROM public.block_limits');
});
test('an OTP issued for signup or password recovery cannot recover usernames',async()=>{
  const id=crypto.randomUUID();
  await db.query("INSERT INTO private.manee_sms_challenges(id,purpose,username,phone_e164,phone_hash,code_hash,status) VALUES($1,'reset','someuser','+821011110010',$2,$2,'sent')",[id,good]);
  assert.equal((await rpc('verify',{id,code_hash:good})).ok,false);
});

function harness(options={}){
  const calls=[],delivered=[];
  const admin={rpc:async(name,args)=>{
    calls.push({name,args});
    if(name==='consume_auth_rate_limit')return {data:true,error:null};
    if(args.p_action==='request')return {data:{ok:true,send_allowed:options.allowed??true},error:null};
    if(args.p_action==='verify')return {data:options.result??{ok:false},error:null};
    return {data:{ok:true},error:null};
  }};
  const handler=createHandler({admin,url:'https://bhwuuxcrzxespkjlmqxr.supabase.co',publishableKey:'public-test',sms:{key:'key',secret:'secret',sender:'0212345678'},deliver:async(...a)=>{delivered.push(a);return options.sent??true;}});
  return {calls,delivered,run:async(body,key='public-test')=>{
    const r=await handler(new Request('https://local.test',{method:'POST',headers:{apikey:key},body:typeof body==='string'?body:JSON.stringify(body)}));return {status:r.status,body:await r.json(),cache:r.headers.get('cache-control')};
  }};
}
test('edge rejects invalid app keys, phone inputs and malformed bodies before privileged access',async()=>{
  const h=harness();for(const body of ['{',null,[],{}, {action:'request',phone:'1234'}])assert.equal((await h.run(body)).status,400);
  assert.equal((await h.run({action:'request',phone:'01011110001'},'wrong')).status,401);assert.equal(h.calls.length,0);
});
test('registered, unknown and provider-failure responses cannot enumerate accounts',async()=>{
  const bodies=[];
  for(const options of [{allowed:true},{allowed:false},{allowed:true,sent:false}]){
    const h=harness(options),r=await h.run({action:'request',phone:'01011110001',username:'injected'});
    assert.equal(r.status,200);assert.equal(r.cache,'no-store');assert.equal(h.delivered.length,options.allowed?1:0);
    const {challenge_id,...body}=r.body;assert.match(challenge_id,/^[0-9a-f-]{36}$/);bodies.push(body);
    assert.equal(JSON.stringify(r.body).includes('send_allowed'),false);
  }
  assert.deepEqual(bodies[0],bodies[1]);assert.deepEqual(bodies[1],bodies[2]);
});
test('edge returns only validated usernames after verified service success and no session or proof',async()=>{
  const h=harness({result:{ok:true,usernames:['owner_one','<script>','staff_two'],user_id:'private-id',phone:'+821011110001'}});
  const r=await h.run({action:'verify',challenge_id:crypto.randomUUID(),code:'123456'});
  assert.deepEqual(r.body,{ok:true,usernames:['owner_one','staff_two']});
});
test('SMS delivery requires explicit provider acceptance',async()=>{
  for(const statusCode of ['2000','4000'])assert.equal(await sendSms({key:'key',secret:'secret',sender:'0212345678'},'+821011110001','123456',async()=>Response.json({failedMessageList:[],messageList:[{statusCode}]})),statusCode==='2000');
});
