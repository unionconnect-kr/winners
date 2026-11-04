import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';
import {webcrypto,createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
// Construct a fixture from code already versioned in this repository. Never publish
// operational database snapshots. Exact deployed definitions were tested privately.
const base=read('../security/fix-recovery-service-franchise-accounts.sql');
let fixtureDefinition=base.slice(base.indexOf('create or replace function private.manee_support_recovery_service'));
fixtureDefinition=fixtureDefinition.slice(0,fixtureDefinition.indexOf('$function$;',fixtureDefinition.indexOf('as $function$')+14)+11);
fixtureDefinition=fixtureDefinition.replace('authorized boolean := false;','authorized boolean := false; actor_role text; target_admin_role text;');
const start=fixtureDefinition.indexOf("    authorized:=exists(select 1 from public.platform_admins");
const end=fixtureDefinition.indexOf("    if p_action='reject'",start);
fixtureDefinition=fixtureDefinition.slice(0,start)+`    select pa.role into actor_role from public.platform_admins pa where pa.user_id=actor and pa.status='active';
    select pa2.role into target_admin_role from public.platform_admins pa2 where pa2.user_id=req.target_user_id and pa2.status='active';
    if target_admin_role in ('super_admin','admin') then
      authorized := coalesce(actor_role in ('super_admin','admin'), false);
    else
      authorized := coalesce(actor_role in ('super_admin','admin','support'), false);
      if not authorized and req.target_store_id is not null then
        authorized := coalesce(exists(select 1 from public.store_memberships mine
          join public.store_memberships target on target.store_id=mine.store_id and target.user_id=req.target_user_id
          where mine.user_id=actor and mine.store_id=req.target_store_id and mine.status='active' and mine.role='owner'
            and target.status='active' and target.role in ('staff','manager')), false);
      end if;
    end if;
    if authorized is not true then return jsonb_build_object('ok',false,'error','permission_denied'); end if;
`+fixtureDefinition.slice(end);
const migration=read('../security/recovery-reviewer-mfa.sql');
const rollback=read('../security/recovery-reviewer-mfa-rollback.sql');
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
async function fixture(env){
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create schema auth;create schema private;
 create table auth.users(id uuid primary key,email text,banned_until timestamptz);
 create table auth.sessions(id uuid primary key,user_id uuid,aal text,not_after timestamptz);
 create table public.profiles(user_id uuid primary key,username text,status text);
 create table public.stores(id uuid primary key,name text,archived_at timestamptz);
 create table public.platform_admins(user_id uuid,role text,status text);
 create table public.store_memberships(user_id uuid,store_id uuid,role text,status text,created_at timestamptz);
 create table private.password_reset_requests(id uuid primary key default gen_random_uuid(),target_user_id uuid,target_store_id uuid,
 requested_affiliation text,status text default 'pending',requested_at timestamptz default clock_timestamp(),reviewed_at timestamptz,
 reviewed_by uuid,code_hash text,code_issued_at timestamptz,code_expires_at timestamptz,failed_attempts integer default 0,
 operation_id uuid,operation_finished_at timestamptz);
 create table private.password_reset_events(request_id uuid,target_user_id uuid,actor_user_id uuid,action text);
 create table private.manee_security_function_backup(change_id text,signature text,definition text,acl text,primary key(change_id,signature));
 ${fixtureDefinition};
 create function public.manee_support_recovery_service(text,jsonb) returns jsonb language sql security invoker set search_path='' as $$select private.manee_support_recovery_service($1,$2)$$;
 revoke all on function public.manee_support_recovery_service(text,jsonb),private.manee_support_recovery_service(text,jsonb) from public,anon,authenticated;
 grant usage on schema public,private to service_role;
 grant execute on function public.manee_support_recovery_service(text,jsonb),private.manee_support_recovery_service(text,jsonb) to service_role;
 insert into public.profiles values('${id(1)}','reviewer','active'),('${id(2)}','target','active');
 insert into auth.sessions values('${id(10)}','${id(1)}','aal1',null);
 insert into public.platform_admins values('${id(1)}','admin','active');
 insert into public.store_memberships values('${id(1)}','${id(20)}','owner','active',now()),('${id(2)}','${id(20)}','staff','active',now());
 insert into private.password_reset_requests(id,target_user_id,target_store_id) values('${id(30)}','${id(2)}','${id(20)}');`);
 return db;
}
async function review(db,action='issue',overrides={}){
 await db.exec(`update private.password_reset_requests set status='pending',code_hash=null where id='${id(30)}';delete from private.password_reset_events;`);
 const payload={actor_user_id:id(1),session_id:id(10),actor_aal:'aal1',request_id:id(30),code_hash:'a'.repeat(64),...overrides};
 await db.exec('set role service_role');
 let result;try{result=(await db.query('select public.manee_support_recovery_service($1,$2) result',[action,JSON.stringify(payload)])).rows[0].result;}finally{await db.exec('reset role');}
 if(!result.ok){assert.equal((await db.query('select status,code_hash from private.password_reset_requests')).rows[0].status,'pending');assert.equal((await db.query('select count(*)::int n from private.password_reset_events')).rows[0].n,0);}
 return result;
}
for(const env of ['production','staging'])test(`${env}: reproduce AAL1 gap, enforce both token/session AAL, preserve owner scope, rollback and drift guard`,async()=>{
 const db=await fixture(env);
 try{
  assert.equal((await review(db)).ok,true,'baseline actually permits AAL1');
  assert.equal((await review(db,'reject')).ok,true);
  const original=(await db.query("select pg_get_functiondef('private.manee_support_recovery_service(text,jsonb)'::regprocedure) d")).rows[0].d;
  const fixtureMigration=migration.replace(/IF md5\(old_def\) NOT IN \([^\n]+\)/, "IF md5(old_def) NOT IN ('"+createHash('md5').update(original).digest('hex')+"')");
  await db.exec('begin;'+fixtureMigration+'commit;');
  for(const action of ['issue','reject']){
   assert.equal((await review(db,action)).error,'mfa_required');
   assert.equal((await review(db,action,{actor_aal:'aal2'})).error,'mfa_required','token AAL2 alone is insufficient');
   await db.exec("update auth.sessions set aal='aal2'");
   assert.equal((await review(db,action)).error,'mfa_required','old AAL1 token remains blocked after elevation');
   assert.equal((await review(db,action,{actor_aal:null})).error,'mfa_required');
   assert.equal((await review(db,action,{actor_aal:'aal2'})).ok,true);
   assert.equal((await review(db,action,{actor_aal:'aal2',session_id:id(999)})).error,'invalid_session');
   await db.exec("update auth.sessions set not_after=now()-interval '1 minute'");
   assert.equal((await review(db,action,{actor_aal:'aal2'})).error,'invalid_session');
   await db.exec(`update auth.sessions set not_after=null,user_id='${id(2)}'`);
   assert.equal((await review(db,action,{actor_aal:'aal2'})).error,'invalid_session');
   await db.exec(`update auth.sessions set user_id='${id(1)}',aal='aal1'`);
  }
  await db.exec("update auth.sessions set aal='aal2';update platform_admins set role='support';");
  assert.equal((await review(db,'issue',{actor_aal:'aal2'})).ok,true);
  await db.exec(`insert into platform_admins values('${id(2)}','admin','active')`);
  assert.equal((await review(db,'issue',{actor_aal:'aal2'})).error,'permission_denied');
  await db.exec('delete from platform_admins');
  await db.exec("update auth.sessions set aal='aal1'");
  assert.equal((await review(db)).ok,true,'ordinary owner can still help own staff');
  await db.exec(`update store_memberships set store_id='${id(21)}' where user_id='${id(1)}'`);
  assert.equal((await review(db)).error,'permission_denied');
  await db.exec(`update store_memberships set store_id='${id(20)}';update profiles set status='inactive' where user_id='${id(1)}'`);
  assert.equal((await review(db)).error,'invalid_session');
  await db.exec('begin;'+rollback+'commit;');
  assert.equal((await db.query("select pg_get_functiondef('private.manee_support_recovery_service(text,jsonb)'::regprocedure) d")).rows[0].d,original);
  await db.exec("alter function private.manee_support_recovery_service(text,jsonb) set search_path='public'");
  await assert.rejects(db.exec('begin;'+fixtureMigration+'commit;'),/changed since review/);await db.exec('rollback');
 }finally{await db.close();}
});

function edge(env,options={}){
 let handler;const calls=[];
 const token='fixture.'+Buffer.from(JSON.stringify({session_id:id(10),aal:options.aal})).toString('base64url')+'.fixture';
 const admin={rpc:async(name,args)=>{calls.push({name,args});return {data:name==='consume_auth_rate_limit'?true:{ok:true},error:null};},auth:{getUser:async supplied=>{assert.equal(supplied,token);calls.push({name:'verified'});return options.invalid?{data:{},error:{message:'bad'}}:{data:{user:{id:id(1)}},error:null};}}};
 const vars={SUPABASE_URL:`https://${env==='production'?'bhwuuxcrzxespkjlmqxr':'obpkzecgswnfuyhwvncd'}.supabase.co`,SUPABASE_ANON_KEY:'fixture-public',SUPABASE_SERVICE_ROLE_KEY:'fixture-service'};
 const source=read(`../supabase/functions/${env==='production'?'manee-account-recovery-production':'manee-account-recovery'}/index.ts`);
 vm.runInNewContext(stripTypeScriptTypes(source.replace(/^import .*\n/,'')),{Request,Response,TextEncoder,atob,crypto:webcrypto,createClient:()=>admin,Deno:{env:{get:k=>vars[k]},serve:h=>handler=h}});
 return {calls,run:async(action,auth=true)=>handler(new Request('https://offline.invalid',{method:'POST',headers:{apikey:'fixture-public',...(auth?{authorization:'Bearer '+token}:{})},body:JSON.stringify({action,request_id:id(30),actor_aal:'aal2',session_id:id(999),actor_user_id:id(999)})}))};
}
for(const env of ['production','staging'])test(`${env}: Edge only forwards the verified token's AAL, session and identity`,async()=>{
 for(const action of ['issue_code','reject'])for(const aal of [undefined,'aal1','aal2','forged']){
  const h=edge(env,{aal});assert.equal((await h.run(action)).status,200);
  const c=h.calls.find(c=>c.args?.p_action===(action==='reject'?'reject':'issue'));
  assert.equal(c.args.p_payload.actor_aal,aal==='aal2'?'aal2':'aal1');assert.equal(c.args.p_payload.actor_user_id,id(1));assert.equal(c.args.p_payload.session_id,id(10));
  assert.ok(h.calls.findIndex(c=>c.name==='verified')<h.calls.indexOf(c));
 }
 for(const opts of [{invalid:true},{}]){
  const h=edge(env,opts);assert.equal((await h.run('issue_code',!!opts.invalid)).status,401);
  assert.equal(h.calls.some(c=>c.args?.p_action==='issue'),false);
 }
});
