import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

const db=new PGlite();after(()=>db.close());
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const owner=id(1),worker=id(2),newWorker=id(3),store=id(101),other=id(102),crew=id(201),otherCrew=id(202),open=id(301);
await db.exec(`create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;
create schema auth;create table auth.users(id uuid primary key,email text,banned_until timestamptz);
create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id),created_at timestamptz default clock_timestamp(),updated_at timestamptz,not_after timestamptz);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
create function auth.role() returns text language sql stable as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;
grant usage on schema auth to anon,authenticated,service_role;`);
await db.exec(read('../security/fixtures/staging-baseline.sql'));
await db.exec(read('../security/staff-auth.sql'));
await db.exec(read('../security/store-permissions.sql'));
await db.exec(read('../security/store-staff-link-code.sql'));
await db.exec(read('../security/store-staff-new-employee-approval.sql'));
await db.exec('alter table public.crew add column employment_setup_required boolean not null default false;alter table public.crew add column weekly_hours numeric;');
// Only columns consumed by the actual entitlement predicate are needed here.
await db.exec(`create table private.android_billing_purchases(user_id uuid,store_id uuid,environment text,state text,expires_at timestamptz,checked_at timestamptz,superseded_by text);`);
for(const table of ['crew_pay_adjustments','monthly_cost_checks','monthly_cost_reviews','monthly_report_closings','recurring_cost_templates','store_business_calendar']){
 await db.exec(`create table if not exists public.${table}(id uuid primary key,store_id uuid);`);
}
await db.exec(read('../supabase/migrations/20261014035157_store_billing_write_gate.sql'));
await db.exec(read('../supabase/migrations/20261015130000_attendance_billing_gate.sql'));
await db.exec(read('../supabase/migrations/20261015122057_crew_payroll_billing_gate.sql'));
await db.exec(`insert into auth.users(id) values('${owner}'),('${worker}'),('${newWorker}');
insert into auth.sessions(id,user_id) select id,id from auth.users;
insert into public.profiles(user_id,username,display_name) values('${owner}','owner_a','Owner'),('${worker}','worker_a','Worker'),('${newWorker}','new_worker_a','New worker');
insert into public.stores(id,name,lat,lng,owner_username) values('${store}','Synthetic A',37.5,127,'owner_a'),('${other}','Synthetic B',37.5,127,'owner_a');
insert into public.crew(id,store_id,name,wage) values('${crew}','${store}','Synthetic worker',15000),('${otherCrew}','${other}','Synthetic other',15000);
insert into public.store_memberships(user_id,store_id,role,crew_id) values('${owner}','${store}','owner',null),('${owner}','${other}','owner',null),('${worker}','${store}','staff','${crew}');
insert into public.attendance(id,store_id,crew_id,date,check_in) values('${open}','${store}','${crew}',current_date,'09:00');`);
async function as(user){
 await db.exec('reset role');
 await db.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claim.role','authenticated',true),set_config('request.jwt.claims',$2,true)",[user,JSON.stringify({sub:user,role:'authenticated',session_id:user})]);
 await db.exec('set local role authenticated');
}
async function admin(){await db.exec("reset role;select set_config('request.jwt.claim.sub','',true)");}
async function enroll(){await admin();await db.query("insert into private.store_billing_enforcement(store_id,environment) values($1,'Production')",[store]);}
async function receipt(state='ACTIVE',environment='Production',expiry="now()+interval '1 day'",checked='now()'){
 await admin();await db.exec('delete from private.android_billing_purchases');
 await db.exec(`insert into private.android_billing_purchases values('${owner}','${store}','${environment}','SUBSCRIPTION_STATE_${state}',${expiry},${checked},null)`);
}
async function denied(sql,args=[],expected='P4402'){
 await db.exec('savepoint deny');
 try{await assert.rejects(()=>db.query(sql,args),e=>e.code===expected);}
 finally{await db.exec('rollback to deny;release deny');}
}
const clockOut=()=>db.query('select public.clock_out($1,37.5,127)',[open]);
const clockIn=()=>db.query('select public.clock_in($1,37.5,127)',[store]);
function scenario(name,fn){test(name,async()=>{await db.exec('begin');try{await fn();}finally{await db.exec('rollback;reset role');}});}

scenario('deployment enrolls nobody and real staff clock-in/out remain available',async()=>{
 assert.equal((await db.query('select count(*)::int as n from private.store_billing_enforcement')).rows[0].n,0);
 await as(worker);await clockOut();await clockIn();
});
scenario('expired enrollment blocks real SECURITY DEFINER clock-out without losing the open record or reads',async()=>{
 await enroll();await as(worker);
 await denied('select public.clock_out($1,37.5,127)',[open]);
 const rows=(await db.query('select id,check_out from public.attendance where id=$1',[open])).rows;
 assert.equal(rows.length,1);assert.equal(rows[0].check_out,null);
 await admin();await db.query('update public.attendance set check_out=$1 where id=$2',['18:00',open]);await as(worker);
 await denied('select public.clock_in($1,37.5,127)',[store]);
});
scenario('owner manual writes and both directions of cross-store movement cannot bypass attendance enrollment',async()=>{
 await enroll();await as(owner);
 await denied('update public.attendance set check_out=$1 where id=$2',['18:00',open]);
 await denied('delete from public.attendance where id=$1',[open]);
 await denied('update public.attendance set store_id=$1 where id=$2',[other,open]);
 await db.query("insert into public.attendance(id,store_id,crew_id,date,check_in) values($1,$2,$3,current_date,'09:00')",[id(302),other,otherCrew]);
 await denied('update public.attendance set store_id=$1 where id=$2',[store,id(302)]);
});
scenario('attendance correction requests cannot bypass the expired store gate',async()=>{
 await admin();await db.query("update public.attendance set check_out='18:00' where id=$1",[open]);
 await db.query("insert into public.attendance(id,store_id,crew_id,date,check_in,check_out) values($1,$2,$3,current_date-1,'09:00','18:00')",[id(303),store,crew]);await as(worker);
 const correction=(await db.query("select to_jsonb(public.request_attendance_edit($1,'10:00','18:00','Synthetic correction')) as x",[open])).rows[0].x;
 await enroll();await as(worker);
 await denied("select public.request_attendance_edit($1,'10:30','18:00','Synthetic correction')",[id(303)]);
 await denied('select public.confirm_my_attendance($1)',[open]);
 await as(owner);await denied("select public.approve_attendance_edit_request($1,'Synthetic approval')",[correction.id]);
 await admin();assert.equal((await db.query('select status from public.attendance_edit_requests where id=$1',[correction.id])).rows[0].status,'pending');
});
scenario('renewal or restoration reopens real clock RPCs; cancellation permits time remaining then blocks expiry',async()=>{
 await enroll();
 for(const state of ['ACTIVE','IN_GRACE_PERIOD','CANCELED']){
  await receipt(state);await as(worker);await clockOut();
  await admin();await db.query('update public.attendance set check_out=null where id=$1',[open]);
 }
 await receipt('CANCELED','Production',"now()-interval '1 second'");await as(worker);
 await denied('select public.clock_out($1,37.5,127)',[open]);
 await receipt();await as(worker);await clockOut();await clockIn();
});
scenario('Sandbox receipts, stale checks and account hold cannot unlock Production attendance',async()=>{
 await enroll();
 for(const [state,environment,checked] of [['ACTIVE','Sandbox','now()'],['ACTIVE','Production',"now()-interval '16 minutes'"],['ON_HOLD','Production','now()']]){
  await receipt(state,environment,"now()+interval '1 day'",checked);await as(worker);
  await denied('select public.clock_out($1,37.5,127)',[open]);
 }
});

scenario('expired payroll denies salary/tax/insurance setup, paid crew creation and deletion',async()=>{
 await enroll();await as(owner);
 for(const patch of ["wage=18000","wage_type='monthly'","tax33=not coalesce(tax33,false)",
  'weekly_allowance=not coalesce(weekly_allowance,false)','insurance4=not coalesce(insurance4,false)',
  'insurance2=not coalesce(insurance2,false)','probation=not coalesce(probation,false)',
  "work_condition='changed'",'weekly_hours=35']){
  await denied(`update public.crew set ${patch} where id=$1`,[crew]);
 }
 await denied("insert into public.crew(id,store_id,name,wage) values($1,$2,'Synthetic paid crew',15000)",[id(203),store]);
 await denied('delete from public.crew where id=$1',[crew]);
 assert.equal((await db.query('select wage from public.crew where id=$1',[crew])).rows[0].wage,15000);
 await db.query('update public.crew set wage=16000 where id=$1',[otherCrew]);
});
scenario('expired payroll preserves identity/offboarding fields but refuses payroll setup completion',async()=>{
 await enroll();await as(owner);
 await db.query("update public.crew set name='Corrected name',phone='010-0000-0000',resign_date=current_date+1,employment_setup_required=true where id=$1",[crew]);
 await denied('update public.crew set employment_setup_required=false where id=$1',[crew]);
 assert.equal((await db.query('select name from public.crew where id=$1',[crew])).rows[0].name,'Corrected name');
});
scenario('owner-approved zero-pay account connection stays available; restored entitlement permits salary setup',async()=>{
 await enroll();await admin();
 const code=(await db.query('select staff_join_code from public.stores where id=$1',[store])).rows[0].staff_join_code;
 await as(newWorker);
 const request=(await db.query("select public.manee_staff_portal('request',$1::jsonb) as x",[JSON.stringify({code})])).rows[0].x;
 assert.equal(request.ok,true);await as(owner);
 const approved=(await db.query("select public.manee_staff_portal('approve_new',$1::jsonb) as x",[JSON.stringify({request_id:request.request_id})])).rows[0].x;
 assert.equal(approved.ok,true);
 await denied('update public.crew set wage=14000 where id=$1',[approved.crew_id]);
 await receipt();await as(owner);
 await db.query('update public.crew set wage=14000,employment_setup_required=false where id=$1',[approved.crew_id]);
 assert.equal((await db.query('select wage from public.crew where id=$1',[approved.crew_id])).rows[0].wage,14000);
});
scenario('crew financial writes cannot escape either store; backend cleanup remains reachable',async()=>{
 await enroll();await as(owner);
 await denied('update public.crew set store_id=$1 where id=$2',[other,crew]);
 await denied('update public.crew set store_id=$1 where id=$2',[store,otherCrew]);
 await denied('select private.manee_guard_crew_payroll_billing()',[],'42501');
 await admin();await db.query('update public.crew set wage=17000 where id=$1',[crew]);
 await db.query('delete from public.crew where id=$1',[otherCrew]);
});
