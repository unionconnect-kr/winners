import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {createDeliveryHandler} from '../supabase/functions/manee-android-delivery/handler.mjs';
const db=new PGlite();
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const store=id(101),owner=id(1),device='AbCdEF:0123456789_TestTOKEN',bearer='a'.repeat(64);
await db.exec(`create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;
 create schema private;create schema auth;create schema vault;create schema cron;create table cron.job(jobname text,active boolean);
 create table vault.decrypted_secrets(name text,decrypted_secret text);
 insert into vault.decrypted_secrets values('manee_android_dispatch','${bearer}');
 create table auth.users(id uuid primary key,banned_until timestamptz);
 create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
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
for(const name of ['20261013103655_native_android_push.sql','20261013131457_android_business_push.sql','20261013134907_android_reservation_arrival.sql','20261013140349_android_notification_route_context.sql'])
 await db.exec(fs.readFileSync(new URL('../supabase/migrations/'+name,import.meta.url),'utf8'));
await db.exec(`insert into auth.users(id) values('${owner}');insert into auth.sessions values('${owner}','${owner}',null);
 insert into public.profiles(user_id) values('${owner}');insert into public.stores(id) values('${store}'),('${id(102)}');
 insert into public.store_memberships(user_id,store_id,role) values('${owner}','${store}','owner');
 insert into private.android_push_devices(token,user_id,session_id,store_id) values('${device}','${owner}','${owner}','${store}');`);
const q=(sql,args)=>db.query(sql,args);
const rows=()=>q('select kind,status,attempts,id,lease_id from private.android_push_deliveries order by kind');
async function service(){await db.exec("reset role;select set_config('request.jwt.claim.role','service_role',false);set role service_role");}
const claim=async token=>(await q('select public.manee_claim_android_deliveries($1) jobs',[token])).rows[0].jobs;
after(()=>db.close());

test('committed attendance events deduplicate; confirmations, old records and other stores stay silent',async()=>{
 await db.exec(`begin;insert into public.attendance values('${id(2)}','${store}',(now() at time zone 'Asia/Seoul')::date,'09:00',null,false);rollback;`);
 assert.equal((await rows()).rows.length,0);
 await db.exec(`insert into public.attendance values('${id(2)}','${store}',(now() at time zone 'Asia/Seoul')::date,'09:00',null,false);
 update public.attendance set confirmed=true;update public.attendance set check_in='09:01';
 update public.attendance set check_out='18:00';update public.attendance set check_out='18:01';
 insert into public.attendance values('${id(3)}','${store}','2020-01-01','09:00',null,false);
 insert into public.attendance values('${id(4)}','${id(102)}',(now() at time zone 'Asia/Seoul')::date,'09:00',null,false);`);
 assert.deepEqual((await rows()).rows.map(r=>r.kind),['attendance_in','attendance_out']);
});
test('worker claims require service role plus scheduler bearer; leases prevent parallel duplicate sends',async()=>{
 await db.exec('set role authenticated');await assert.rejects(()=>claim(bearer));await assert.rejects(()=>q('select * from private.android_push_deliveries'));
 await service();await assert.rejects(()=>claim('b'.repeat(64)));
 const jobs=await claim(bearer);assert.equal(jobs.length,2);assert.equal((await claim(bearer)).length,0);
 await q('select public.manee_finish_android_delivery($1,$2,$3)',[jobs[0].id,id(99),'sent']);
 await q('select public.manee_finish_android_delivery($1,$2,$3)',[jobs[0].id,jobs[0].lease_id,'retry']);
 await q('select public.manee_finish_android_delivery($1,$2,$3)',[jobs[1].id,jobs[1].lease_id,'sent']);
 assert.equal((await claim(bearer)).length,0);
 await db.exec("reset role;update private.android_push_deliveries set available_at=now()-interval '1 second' where status='pending'");
 await service();const retry=await claim(bearer);assert.equal(retry.length,1);
 await q('select public.manee_finish_android_delivery($1,$2,$3)',[retry[0].id,retry[0].lease_id,'sent']);
 await db.exec('reset role');assert.deepEqual((await rows()).rows.map(r=>r.status),['sent','sent']);
});
test('reservation cancellation invalidates pending notices; reminder edits and revoked access are rechecked',async()=>{
 await db.exec(`insert into public.reservations values(1,'${store}',(now() at time zone 'Asia/Seoul')::date,'23:59');delete from public.reservations where id=1;`);
 assert.equal((await rows()).rows.find(r=>r.kind==='reservation_created').status,'skipped');
 await db.exec(`insert into public.reservations values(2,'${store}',(now() at time zone 'Asia/Seoul'+interval '20 minutes')::date,to_char(now() at time zone 'Asia/Seoul'+interval '20 minutes','HH24:MI'));
 select private.seed_android_reminders();select private.seed_android_reminders();`);
 assert.equal((await rows()).rows.filter(r=>r.kind==='reservation_upcoming').length,1);
 await db.exec("update public.reservations set time='00:00' where id=2");
 await service();await claim(bearer);await db.exec('reset role');
 assert.equal((await rows()).rows.find(r=>r.kind==='reservation_upcoming').status,'skipped');
 await db.exec(`insert into public.monthly_report_closings(id,store_id) values('${id(8)}','${store}');update public.store_memberships set status='revoked';`);
 await service();assert.equal((await claim(bearer)).length,0);await db.exec('reset role');
 assert.equal((await rows()).rows.find(r=>r.kind==='report_closed').status,'skipped');
});
test('monthly cost reminders observe business dates, quiet hours, completion and daily deduplication',async()=>{
 await db.exec(`update public.store_memberships set status='active';
  insert into public.sales_reports values('${store}',(date_trunc('month',now())+interval '1 month')::date);
  select private.seed_android_reminders((date_trunc('month',now() at time zone 'Asia/Seoul')+interval '2 months - 8 days 9 hours') at time zone 'Asia/Seoul');`);
 assert.equal((await rows()).rows.filter(r=>r.kind==='monthly_costs').length,0);
 await db.exec(`select private.seed_android_reminders((date_trunc('month',now() at time zone 'Asia/Seoul')+interval '2 months - 8 days 10 hours') at time zone 'Asia/Seoul');
  select private.seed_android_reminders((date_trunc('month',now() at time zone 'Asia/Seoul')+interval '2 months - 8 days 11 hours') at time zone 'Asia/Seoul');`);
 assert.equal((await rows()).rows.filter(r=>r.kind==='monthly_costs').length,1);
 await db.exec(`insert into public.monthly_cost_reviews values('${store}',to_char(now()+interval '1 month','YYYY-MM'),now(),null);
  select private.seed_android_reminders((date_trunc('month',now() at time zone 'Asia/Seoul')+interval '2 months - 4 days 10 hours') at time zone 'Asia/Seoul');`);
 assert.equal((await rows()).rows.filter(r=>r.kind==='monthly_costs').length,1);
 await service();await claim(bearer);await db.exec('reset role');
 assert.equal((await rows()).rows.find(r=>r.kind==='monthly_costs').status,'skipped');
});
test('disabling consent removes queued deliveries; retry exhaustion and expired devices terminate',async()=>{
 await db.exec(`update public.store_memberships set status='active';insert into public.monthly_report_closings(id,store_id) values('${id(9)}','${store}');
 update private.android_push_deliveries set attempts=4,lease_until=null where kind='report_closed' and status='pending';`);
 await service();assert.equal((await claim(bearer)).length,0);await db.exec('reset role');
 assert.equal((await rows()).rows.filter(r=>r.status==='failed').length,1);
 await db.exec(`insert into public.monthly_report_closings(id,store_id) values('${id(10)}','${store}');`);
 await service();const jobs=await claim(bearer);assert.equal(jobs.length,1);
 await q('select public.manee_finish_android_delivery($1,$2,$3)',[jobs[0].id,jobs[0].lease_id,'expired']);
 await db.exec('reset role');assert.equal((await rows()).rows.length,0);
});

test('HTTP worker rejects arbitrary callers and never trusts request recipients or messages',async()=>{
 const calls=[];let allowed=false;
 const client={rpc:async(name,args)=>{calls.push([name,args]);return name==='manee_claim_android_deliveries'?
  allowed?{data:[{id:id(30),lease_id:id(31),token:device,store_id:store,kind:'report_closed',expires_at:new Date(Date.now()+60000).toISOString()}]}:{error:{code:'42501'}}:{};}};
 const send=async(...args)=>{calls.push(['send',...args]);return {sent:true};};
 const handler=createDeliveryHandler({staging:true,credentials:{project:'manee-staging'},client,send});
 const req=token=>new Request('https://example.invalid',{method:'POST',headers:{authorization:token||''},body:JSON.stringify({token:'attacker',title:'attacker'})});
 assert.equal((await handler(req('Bearer jwt'))).status,401);assert.equal(calls.length,0);
 assert.equal((await handler(req('Bearer '+bearer))).status,403);assert.equal(calls.some(c=>c[0]==='send'),false);
 allowed=true;const response=await handler(req('Bearer '+bearer));assert.equal(response.status,200);
 assert.equal((await response.json()).sent,1);assert.equal(calls.find(c=>c[0]==='send')[1],device);
 const production=createDeliveryHandler({staging:false,credentials:{project:'manee-staging'},client,send});
 assert.equal((await production(req('Bearer '+bearer))).status,503);
});

test('arrival reminders cover the minute boundary, deduplicate, and ignore cancelled/rescheduled reservations',async()=>{
 await db.exec(`insert into private.android_push_devices(token,user_id,session_id,store_id) values('${device}','${owner}','${owner}','${store}');
  insert into public.reservations values(3,'${store}',(now() at time zone 'Asia/Seoul')::date,to_char(now() at time zone 'Asia/Seoul','HH24:MI'));
  select private.seed_android_reminders();select private.seed_android_reminders();`);
 assert.equal((await rows()).rows.filter(r=>r.kind==='reservation_due').length,1);
 await service();const jobs=await claim(bearer);assert.ok(jobs.some(j=>j.kind==='reservation_due'));
 await db.exec('reset role;delete from public.reservations where id=3');
 assert.equal((await rows()).rows.find(r=>r.kind==='reservation_due').status,'skipped');
});

test('report navigation month comes from its committed source rather than current month',async()=>{
 await db.exec(`insert into public.monthly_report_closings(id,store_id,month_key) values('${id(50)}','${store}','2026-09');`);
 await service();const jobs=await claim(bearer);assert.equal(jobs.find(j=>j.kind==='report_closed').month_key,'2026-09');
 await db.exec('reset role');
});

test('cancelling a future booking skips its pending reminder and prevents a later arrival reminder',async()=>{
 await db.exec(`insert into public.reservations values(4,'${store}',((now() at time zone 'Asia/Seoul')::date+1),'12:00');
  select private.seed_android_reminders((((now() at time zone 'Asia/Seoul')::date+1)+time '11:40') at time zone 'Asia/Seoul');`);
 const notices=()=>q("select kind,status from private.android_push_deliveries where source_id='4'");
 assert.equal((await notices()).rows.find(r=>r.kind==='reservation_upcoming').status,'pending');
 await db.exec(`delete from public.reservations where id=4;
  select private.seed_android_reminders((((now() at time zone 'Asia/Seoul')::date+1)+time '12:00') at time zone 'Asia/Seoul');`);
 const jobs=(await notices()).rows;
 assert.equal(jobs.find(r=>r.kind==='reservation_created').status,'skipped');
 assert.equal(jobs.find(r=>r.kind==='reservation_upcoming').status,'skipped');
 assert.equal(jobs.some(r=>r.kind==='reservation_due'),false);
});
