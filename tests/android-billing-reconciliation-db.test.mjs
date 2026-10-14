import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import google from '../netlify/functions/lib/google-play-billing.cjs';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();
await db.exec(`create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;
create schema auth;create schema private;
create table auth.users(id uuid primary key,banned_until timestamptz);
create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
grant usage on schema auth,private to anon,authenticated,service_role;
create table public.profiles(user_id uuid primary key,status text default 'active');
create table public.stores(id uuid primary key,archived_at timestamptz);
create table public.crew(id uuid primary key,store_id uuid,resign_date date);
create table public.store_memberships(user_id uuid,store_id uuid,role text,status text default 'active',crew_id uuid);`);
const helpers=fs.readFileSync(new URL('../supabase/migrations/20260916070000_staff_auth_foundation_part1.sql',import.meta.url),'utf8');
await db.exec(helpers.slice(helpers.indexOf('create or replace function private.is_live_manee_session()'),helpers.indexOf('create or replace function private.current_crew_id')));
await db.exec(fs.readFileSync(new URL('../supabase/migrations/20261013103655_native_android_push.sql',import.meta.url),'utf8'));
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const owner=id(1),other=id(2),store=id(101),store2=id(102),device='AbCdEF:0123456789_TestTOKEN';
await db.exec(`insert into auth.users(id) values('${owner}'),('${other}');
insert into auth.sessions(id,user_id) select id,id from auth.users;
insert into public.profiles(user_id) select id from auth.users;
insert into public.stores(id) values('${store}'),('${store2}');
insert into public.store_memberships(user_id,store_id,role) values('${owner}','${store}','owner'),('${other}','${store2}','owner');`);
async function role(user){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",[user,JSON.stringify({sub:user,session_id:user,role:'authenticated'})]);await db.exec('set role authenticated');}
async function service(){await db.exec('reset role;set role service_role');}
const rpc=(sql,args)=>db.query(sql,args);
after(()=>db.close());

await db.exec(fs.readFileSync(new URL('../supabase/migrations/20261013185750_android_billing_purchase_binding.sql',import.meta.url),'utf8'));
let tick=Date.now();
const record=(token,changes={})=>({purchaseToken:token,...google.binding(owner,store),productId:'manee.store1.monthly',basePlanId:'monthly',environment:'Production',state:'SUBSCRIPTION_STATE_ACTIVE',checkedAt:new Date(++tick).toISOString(),expiresAt:new Date(Date.now()+86400000).toISOString(),...changes});
const save=async(r,u=owner,s=store)=>{await service();return (await db.query('select public.manee_android_billing_save($1,$2,$3) as saved',[u,s,r])).rows[0].saved;};
const status=async()=>{await role(owner);return (await db.query('select public.manee_android_billing_status($1) as result',[store])).rows[0].result.subscriptions;};
await db.exec(`create schema vault;create schema extensions;create schema cron;create schema net;
create table vault.secrets(name text,decrypted_secret text);create view vault.decrypted_secrets as select * from vault.secrets;
create function vault.create_secret(s text,n text,d text) returns uuid language plpgsql as $$begin insert into vault.secrets values(n,s);return gen_random_uuid();end$$;
create function extensions.gen_random_bytes(n int) returns bytea language sql as $$select decode(repeat('ab',n),'hex')$$;
create table cron.job(jobid bigint,jobname text);
create function cron.schedule(n text,s text,c text) returns bigint language plpgsql as $$begin insert into cron.job values(1,n);return 1;end$$;
create function cron.alter_job(bigint,active boolean) returns void language sql as $$select$$;
create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds int) returns bigint language sql as $$select 1::bigint$$;`);
await db.exec(fs.readFileSync(new URL('../supabase/migrations/20261013191756_android_billing_reconciliation.sql',import.meta.url),'utf8'));
const dispatch='ab'.repeat(32);
async function claim(token=dispatch){await service();return (await db.query('select public.manee_billing_claim($1) jobs',[token])).rows[0].jobs;}
const finish=async(j,success)=>{await service();return (await db.query('select public.manee_billing_finish($1,$2,$3) done',[j.purchase_token,j.lease_id,success])).rows[0].done;};
const event=async(id,token)=>{await service();return db.query('select public.manee_billing_enqueue($1,$2)',[id,token]);};
test('only service plus dedicated scheduler secret can claim; production receipts excluded',async()=>{
 await save(record('paid'));await save(record('sandbox',{environment:'Sandbox'}));
 await role(owner);await assert.rejects(()=>db.query('select public.manee_billing_claim($1)',[dispatch]));
 await assert.rejects(()=>claim('00'.repeat(32)),/Dispatch access denied/);
 const jobs=await claim();assert.equal(jobs.length,1);assert.equal(jobs[0].purchase_token,'sandbox');
 assert.deepEqual(await claim(),[]);assert.equal(await finish({...jobs[0],lease_id:owner},true),false);
 assert.equal(await finish(jobs[0],true),true);assert.equal(await finish(jobs[0],true),false);
});
test('duplicate notifications enqueue once and arrival during a lease is not lost',async()=>{
 await event('100','sandbox');let jobs=await claim();assert.equal(jobs.length,1);
 await event('101','sandbox');await event('101','sandbox');
 await db.exec('reset role');assert.equal((await db.query("select event_generation from private.android_billing_purchases where purchase_token='sandbox'")).rows[0].event_generation,2);
 assert.equal(await finish(jobs[0],true),true);jobs=await claim();assert.equal(jobs.length,1);
 await finish(jobs[0],false);assert.deepEqual(await claim(),[]);
});
test('expired lease can be reclaimed and old worker cannot finish it',async()=>{
 await db.exec("reset role;update private.android_billing_purchases set next_check_at=now()-interval '1 minute' where purchase_token='sandbox'");
 const old=(await claim())[0];await db.exec("reset role;update private.android_billing_purchases set lease_until=now()-interval '1 second' where purchase_token='sandbox'");
 const fresh=(await claim())[0];assert.notEqual(fresh.lease_id,old.lease_id);assert.equal(await finish(old,true),false);
 await save(record('sandbox',{environment:'Sandbox',state:'SUBSCRIPTION_STATE_EXPIRED'}));await finish(fresh,true);assert.deepEqual(await claim(),[]);
});
test('new event can recheck terminal state; unknown tokens never create purchases',async()=>{
 await event('102','sandbox');const j=(await claim())[0];assert.equal(j.purchase_token,'sandbox');await finish(j,true);
 await event('103','unknown');await db.exec('reset role');assert.equal((await db.query("select count(*)::int n from private.android_billing_purchases where purchase_token='unknown'")).rows[0].n,0);
});
test('verified restoration resumes polling after a terminal state',async()=>{
 await save(record('sandbox',{environment:'Sandbox',state:'SUBSCRIPTION_STATE_ACTIVE'}));assert.equal((await claim()).length,1);
});
