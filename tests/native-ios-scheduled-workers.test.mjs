import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

const db=new PGlite();
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const store=id(101),owner=id(1),device='ab'.repeat(32),bearer='a'.repeat(64);
await db.exec(`create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;
 create schema private;create schema auth;create schema vault;create schema cron;create table cron.job(jobname text,active boolean);
 create table vault.decrypted_secrets(name text,decrypted_secret text);
 insert into vault.decrypted_secrets values('manee_ios_dispatch','${bearer}');
 create table auth.users(id uuid primary key,banned_until timestamptz);
 create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),json_build_object('role',current_setting('request.jwt.claim.role',true))::text)::jsonb$$;
 create function auth.role() returns text language sql stable as $$select current_setting('request.jwt.claim.role',true)$$;
 grant usage on schema auth,private to anon,authenticated,service_role;
 create table public.profiles(user_id uuid primary key,status text default 'active');
 create table public.stores(id uuid primary key,archived_at timestamptz);
 create table public.store_memberships(user_id uuid,store_id uuid,role text,status text default 'active');
 create function private.is_live_manee_session() returns boolean language sql as $$select true$$;
 create function private.has_store_membership(uuid,text[]) returns boolean language sql as $$select true$$;
 create table public.attendance(id uuid primary key,store_id uuid,date date,check_in time,check_out time,confirmed boolean);
 create table public.reservations(id bigint primary key,store_id uuid,date date,time text);
 create table public.monthly_report_closings(id uuid primary key,store_id uuid,month_key text);
 create table public.monthly_cost_reviews(store_id uuid,month_key text,completed_at timestamptz,remind_after date);
 create table public.sales_reports(store_id uuid,date date);`);
for(const name of ['20261012093336_native_ios_services.sql','20261015195959_native_ios_business_push.sql'])
 await db.exec(fs.readFileSync(new URL('../supabase/migrations/'+name,import.meta.url),'utf8'));
await db.exec(`insert into auth.users(id) values('${owner}');insert into auth.sessions values('${owner}','${owner}',null);
 insert into public.profiles(user_id) values('${owner}');insert into public.stores(id) values('${store}'),('${id(102)}');
 insert into public.store_memberships(user_id,store_id,role) values('${owner}','${store}','owner');
 insert into private.ios_push_devices(token,user_id,session_id,store_id) values('${device}','${owner}','${owner}','${store}');`);
const q=(sql,args)=>db.query(sql,args);
const rows=()=>q('select kind,status,attempts,id,lease_id from private.ios_push_deliveries order by kind');
async function service(){await db.exec("reset role;select set_config('request.jwt.claim.role','service_role',false);set role service_role");}
const claim=async token=>(await q('select public.manee_claim_ios_deliveries($1) jobs',[token])).rows[0].jobs;
after(()=>db.close());

await db.exec("create function private.manee_ios_claim_refresh() returns jsonb language sql as $$select '[]'::jsonb$$;");
await db.exec(fs.readFileSync(new URL('../supabase/migrations/20261015202633_native_ios_scheduled_workers.sql',import.meta.url),'utf8'));
test('scheduled job APIs remain inaccessible to customer and anonymous roles',async()=>{
 for(const role of ['anon','authenticated']){
  await db.exec('reset role;set role '+role);
  await assert.rejects(()=>q('select public.manee_ios_claim_scheduled_deliveries()'));
  await assert.rejects(()=>q("select public.manee_ios_record_worker('push',0,0)"));
  await assert.rejects(()=>q('select * from private.ios_worker_health'));
 }
 await db.exec('reset role');
});
test('scheduled claims seed committed reminders and retain leases, routing and recipient checks',async()=>{
 await db.exec(`insert into public.reservations values(1,'${store}',(now() at time zone 'Asia/Seoul')::date,to_char(now() at time zone 'Asia/Seoul','HH24:MI'));`);
 await service();const jobs=(await q('select public.manee_ios_claim_scheduled_deliveries() jobs')).rows[0].jobs;
 assert.ok(jobs.some(j=>j.kind==='reservation_due'));assert.ok(jobs.every(j=>j.token===device));
 assert.equal((await q('select public.manee_ios_claim_scheduled_deliveries() jobs')).rows[0].jobs.length,0);
 await db.exec('reset role');
});
test('server heartbeat stores aggregate results and customer callers cannot forge it',async()=>{
 await service();await q("select public.manee_ios_record_worker('push',2,0)");
 await assert.rejects(()=>q("select public.manee_ios_record_worker('unbounded',2,0)"));
 await db.exec('reset role');const r=(await q('select * from private.ios_worker_health')).rows[0];
 assert.equal(r.processed,2);assert.equal(r.failed,0);assert.ok(r.last_run_at);
});
