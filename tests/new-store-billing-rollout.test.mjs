import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

const db=new PGlite();after(()=>db.close());
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const id=n=>'60000000-0000-4000-8000-'+String(n).padStart(12,'0');
const owner=id(1),worker=id(2),signup=id(3),old=id(101),fresh=id(102),cid=id(201);
await db.exec(`create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;
create schema auth;create table auth.users(id uuid primary key,email text,banned_until timestamptz);
create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id),created_at timestamptz default now(),updated_at timestamptz,not_after timestamptz);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
create function auth.role() returns text language sql stable as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;
grant usage on schema auth to anon,authenticated,service_role;`);
for(const name of ['fixtures/staging-baseline.sql','staff-auth.sql','account-recovery.sql','store-permissions.sql','store-staff-link-code.sql','franchise-signup-code.sql'])await db.exec(read('../security/'+name));
await db.exec('alter table public.crew add column employment_setup_required boolean not null default false;alter table public.crew add column weekly_hours numeric;');
for(const table of ['crew_pay_adjustments','monthly_cost_checks','monthly_cost_reviews','monthly_report_closings','recurring_cost_templates','store_business_calendar'])await db.exec(`create table if not exists public.${table}(id uuid primary key,store_id uuid);`);
await db.exec('create table private.android_billing_purchases(user_id uuid,store_id uuid,environment text,state text,expires_at timestamptz,checked_at timestamptz,superseded_by text);');
for(const name of ['20261014035157_store_billing_write_gate.sql','20261015130000_attendance_billing_gate.sql','20261015122057_crew_payroll_billing_gate.sql'])await db.exec(read('../supabase/migrations/'+name));
await db.exec(`insert into auth.users(id) values('${owner}'),('${worker}'),('${signup}');
insert into auth.sessions(id,user_id) select id,id from auth.users;
insert into public.profiles(user_id,username,display_name) values('${owner}','rollout_owner','Owner'),('${worker}','rollout_worker','Worker');
insert into public.stores(id,name,lat,lng,created_at) values('${old}','Existing store',37.5,127,'2099-01-01');
insert into public.store_memberships(user_id,store_id,role) values('${owner}','${old}','owner');`);
await db.exec(read('../supabase/migrations/20261015134721_new_store_billing_rollout.sql'));
// Match the existing signup service boundary; the rollout migration changes no RPC grants.
await db.exec('revoke all on function public.bootstrap_owner_account(uuid,text,text,text,text) from public,anon,authenticated;grant execute on function public.bootstrap_owner_account(uuid,text,text,text,text) to service_role;');
async function admin(){await db.exec("reset role;select set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{}',true)");}
async function as(user){await admin();await db.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",[user,JSON.stringify({sub:user,session_id:user,role:'authenticated'})]);await db.exec('set local role authenticated');}
const scalar=async(sql,args=[])=>(Object.values((await db.query(sql,args)).rows[0]))[0];
const access=s=>scalar('select public.manee_store_billing_access($1)',[s]);
async function denied(fn,code){await db.exec('savepoint expected_failure');try{await assert.rejects(fn,e=>e.code===code);}finally{await db.exec('rollback to expected_failure;release expected_failure');}}
async function launch(){await admin();return scalar('select private.manee_launch_new_store_billing()');}
async function newStore(){await admin();await db.query("insert into public.stores(id,name,lat,lng,created_at) values($1,'New store',37.5,127,'1900-01-01')",[fresh]);await db.query("insert into public.store_memberships(user_id,store_id,role) values($1,$2,'owner')",[owner,fresh]);}
function scenario(name,fn){test(name,async()=>{await db.exec('begin');try{await fn();}finally{await db.exec('rollback;reset role');}});}

scenario('deployment leaves existing stores and prelaunch new stores unenrolled',async()=>{
 assert.equal(await scalar('select launched_at from private.new_store_billing_rollout'),null);
 await newStore();assert.equal(await scalar('select count(*)::int from private.store_billing_enforcement'),0);
 await as(owner);assert.deepEqual(await access(old),{enforced:false,canWrite:true});assert.deepEqual(await access(fresh),{enforced:false,canWrite:true});
});
scenario('launch is idempotent and enrolls only subsequent inserts regardless of client timestamps',async()=>{
 await newStore();const when=await launch();assert.equal((await launch()).toISOString(),when.toISOString());
 await db.query("update public.stores set name='Existing renamed',created_at='2200-01-01',archived_at=now() where id=$1",[old]);
 await db.query('update public.stores set archived_at=null where id=$1',[old]);
 assert.equal(await scalar('select count(*)::int from private.store_billing_enforcement'),0);
 const later=id(103);await db.query("insert into public.stores(id,name,created_at) values($1,'Backdated new store','1900-01-01')",[later]);
 assert.equal(await scalar('select environment from private.store_billing_enforcement where store_id=$1',[later]),'Production');
 assert.equal(await scalar('select count(*)::int from private.store_billing_enforcement'),1);
});
scenario('clients cannot launch, edit or read rollout policy, or call the enrollment trigger',async()=>{
 for(const role of ['anon','authenticated','service_role']){
  assert.equal(await scalar("select has_table_privilege($1,'private.new_store_billing_rollout','SELECT')",[role]),false);
  assert.equal(await scalar("select has_table_privilege($1,'private.new_store_billing_rollout','UPDATE')",[role]),false);
  for(const fn of ['private.manee_launch_new_store_billing()','private.manee_enroll_new_store_billing()'])assert.equal(await scalar('select has_function_privilege($1,$2,\'EXECUTE\')',[role,fn]),false);
 }
 await as(owner);await denied(()=>db.exec('select private.manee_launch_new_store_billing()'),'42501');
 await denied(()=>db.exec('update private.new_store_billing_rollout set launched_at=now()'),'42501');
});
scenario('new unpaid stores deny business and real clock writes while the existing store remains writable',async()=>{
 await launch();await newStore();
 await db.query("insert into public.crew(id,store_id,name,wage) values($1,$2,'Worker',0)",[cid,fresh]);
 await db.query("insert into public.store_memberships(user_id,store_id,crew_id,role) values($1,$2,$3,'staff')",[worker,fresh,cid]);
 await as(owner);assert.deepEqual(await access(fresh),{enforced:true,canWrite:false});
 await denied(()=>db.query("insert into public.expense_entries(store_id,date,description,amount) values($1,current_date,'Blocked',1)",[fresh]),'P4402');
 await db.query("insert into public.expense_entries(store_id,date,description,amount) values($1,current_date,'Allowed',1)",[old]);
 await as(worker);await denied(()=>db.query('select public.clock_in($1,37.5,127)',[fresh]),'P4402');
});
scenario('valid Production restore opens the new store; Sandbox and actual expiry cannot do so',async()=>{
 await launch();await newStore();
 await db.query("insert into public.crew(id,store_id,name,wage) values($1,$2,'Worker',0)",[cid,fresh]);
 await db.query("insert into public.store_memberships(user_id,store_id,crew_id,role) values($1,$2,$3,'staff')",[worker,fresh,cid]);
 await db.query("insert into private.android_billing_purchases values($1,$2,'Sandbox','SUBSCRIPTION_STATE_ACTIVE',now()+interval '1 day',now(),null)",[owner,fresh]);
 await as(owner);assert.equal((await access(fresh)).canWrite,false);
 await admin();await db.exec("update private.android_billing_purchases set environment='Production'");
 await as(worker);assert.equal((await access(fresh)).canWrite,true);
 const clock=await scalar('select to_jsonb(public.clock_in($1,37.5,127))',[fresh]);assert.ok(clock.id);
 await admin();await db.exec("update private.android_billing_purchases set expires_at=now()-interval '1 second'");
 await as(worker);assert.equal((await access(fresh)).canWrite,false);
 await denied(()=>db.query('select public.clock_out($1,37.5,127)',[clock.id]),'P4402');
});
scenario('existing service-role owner signup still succeeds and its newly created store is enrolled',async()=>{
 await launch();await db.exec('set local role service_role');
 const sid=await scalar('select public.bootstrap_owner_account($1,$2,$3,$4,null)',[signup,'new_rollout_signup','New owner','Signup store']);
 await admin();assert.equal(await scalar('select environment from private.store_billing_enforcement where store_id=$1',[sid]),'Production');
 assert.equal(await scalar("select count(*)::int from public.store_memberships where user_id=$1 and store_id=$2 and role='owner'",[signup,sid]),1);
 await as(signup);assert.deepEqual(await access(sid),{enforced:true,canWrite:false});
});
scenario('failed parent transaction leaves neither a new store nor a partial enrollment',async()=>{
 await launch();await denied(()=>db.exec(`do $$begin insert into public.stores(id,name) values('${fresh}','Failed insert');raise exception 'Synthetic rollback';end $$;`),'P0001');
 assert.equal(await scalar('select count(*)::int from public.stores where id=$1',[fresh]),0);
 assert.equal(await scalar('select count(*)::int from private.store_billing_enforcement where store_id=$1',[fresh]),0);
});
scenario('missing internal policy fails closed without enrolling an existing store',async()=>{
 await db.exec('delete from private.new_store_billing_rollout');
 await denied(()=>db.query("insert into public.stores(id,name) values($1,'Missing policy')",[fresh]),'55000');
 assert.equal(await scalar('select count(*)::int from private.store_billing_enforcement'),0);
 assert.equal(await scalar('select count(*)::int from public.stores where id=$1',[old]),1);
});
