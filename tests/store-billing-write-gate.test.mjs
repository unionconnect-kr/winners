import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();after(()=>db.close());
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const owner=id(1),staff=id(2),outsider=id(3),a=id(101),b=id(102);
await db.exec(`create role anon;create role authenticated;create role service_role;
create schema auth;create schema private;
create table auth.users(id uuid primary key,banned_until timestamptz);
create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
grant usage on schema auth,private to authenticated;
create table public.profiles(user_id uuid,status text default 'active');
create table public.stores(id uuid primary key,archived_at timestamptz);
create table public.crew(id uuid primary key,store_id uuid,resign_date date);
create table public.store_memberships(user_id uuid,store_id uuid,role text,status text default 'active',crew_id uuid);
create table private.android_billing_purchases(user_id uuid,store_id uuid,environment text,state text,expires_at timestamptz,checked_at timestamptz,superseded_by text);
insert into auth.users(id) values('${owner}'),('${staff}'),('${outsider}');
insert into auth.sessions select id,id,null from auth.users;
insert into public.profiles(user_id) select id from auth.users;
insert into public.stores(id) values('${a}'),('${b}');
insert into public.crew(id,store_id) values('${staff}','${a}');
insert into public.store_memberships(user_id,store_id,role,crew_id) values('${owner}','${a}','owner',null),('${owner}','${b}','owner',null),('${staff}','${a}','staff','${staff}');`);
const helpers=fs.readFileSync(new URL('../supabase/migrations/20260916070000_staff_auth_foundation_part1.sql',import.meta.url),'utf8');
await db.exec(helpers.slice(helpers.indexOf('create or replace function private.is_live_manee_session()'),helpers.indexOf('create or replace function private.current_crew_id')));
const tables=['sales_reports','expense_entries','fixed_expenses','fixed_schedules','shifts','vendors','reservations','announcements','checklist_templates','checklist_checks','checklist_log','crew_pay_adjustments','monthly_cost_checks','monthly_cost_reviews','monthly_report_closings','recurring_cost_templates','store_business_calendar'];
for(const t of tables)await db.exec(`create table public.${t}(id integer primary key,store_id uuid,value integer);grant select,insert,update,delete on public.${t} to authenticated;`);
await db.exec(fs.readFileSync(new URL('../supabase/migrations/20261014035157_store_billing_write_gate.sql',import.meta.url),'utf8'));
async function admin(){await db.exec("reset role;select set_config('request.jwt.claim.sub','',false)");}
async function as(user){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",[user,JSON.stringify({sub:user,session_id:user})]);await db.exec('set role authenticated');}
async function access(s=a){return(await db.query('select public.manee_store_billing_access($1) as x',[s])).rows[0].x;}
async function receipt(environment='Production',state='SUBSCRIPTION_STATE_ACTIVE',expiry="now()+interval '1 day'",checked='now()'){
 await admin();await db.exec('delete from private.android_billing_purchases');
 await db.exec(`insert into private.android_billing_purchases values('${owner}','${a}','${environment}','${state}',${expiry},${checked},null)`);await as(owner);
}
const insert=(s=a)=>db.query('insert into public.expense_entries values(1,$1,1)',[s]);
test('deployment enrolls nobody; clients cannot enroll themselves or query policy internals',async()=>{
 await as(owner);assert.deepEqual(await access(),{enforced:false,canWrite:true});await insert();
 await assert.rejects(()=>db.exec("insert into private.store_billing_enforcement values('"+a+"','Production',now())"));
 await assert.rejects(()=>db.query('select private.manee_store_write_entitled($1)',[a]));
 await as(outsider);await assert.rejects(()=>access(),/Store access denied/);
});
test('expired enrolled store blocks every installed business trigger, keeps reads and other stores',async()=>{
 await admin();await db.query('insert into private.store_billing_enforcement(store_id,environment) values($1,$2)',[a,'Production']);await as(owner);
 assert.deepEqual(await access(),{enforced:true,canWrite:false});
 for(const t of tables)await assert.rejects(()=>db.query(`insert into public.${t} values(99,$1,1)`,[a]),e=>e.code==='P4402');
 await assert.rejects(()=>db.exec('update public.expense_entries set value=2'),e=>e.code==='P4402');
 await assert.rejects(()=>db.exec('delete from public.expense_entries'),e=>e.code==='P4402');
 assert.equal((await db.exec('select * from public.expense_entries'))[0].rows.length,1);
 await db.query('insert into public.expense_entries values(2,$1,1)',[b]);
 await assert.rejects(()=>db.query('update public.expense_entries set store_id=$1 where id=2',[a]),e=>e.code==='P4402');
 await assert.rejects(()=>db.query('update public.expense_entries set store_id=$1 where id=1',[b]),e=>e.code==='P4402');
});
test('active, grace and canceled-until-expiry allow writes; other states and stale observations deny',async()=>{
 for(const state of ['ACTIVE','IN_GRACE_PERIOD','CANCELED']){await receipt('Production','SUBSCRIPTION_STATE_'+state);assert.equal((await access()).canWrite,true);await db.exec('update public.expense_entries set value=value+1 where id=1');}
 for(const state of ['PENDING','ON_HOLD','PAUSED','EXPIRED','PENDING_PURCHASE_CANCELED']){await receipt('Production','SUBSCRIPTION_STATE_'+state);assert.equal((await access()).canWrite,false);}
 await receipt('Production','SUBSCRIPTION_STATE_CANCELED',"now()-interval '1 second'");assert.equal((await access()).canWrite,false);
 await receipt('Production','SUBSCRIPTION_STATE_ACTIVE',"now()+interval '1 day'","now()-interval '16 minutes'");assert.equal((await access()).canWrite,false);
});
test('sandbox never unlocks production; restoring a valid receipt unlocks the same store for staff',async()=>{
 await receipt('Sandbox');assert.equal((await access()).canWrite,false);
 await receipt();await as(staff);assert.equal((await access()).canWrite,true);
 await admin();await db.exec('update private.android_billing_purchases set superseded_by=\'new-token\'');await as(staff);assert.equal((await access()).canWrite,false);
 await receipt();await admin();await db.exec(`update public.store_memberships set status='revoked' where user_id='${owner}' and store_id='${a}'`);await as(staff);assert.equal((await access()).canWrite,false);
});
