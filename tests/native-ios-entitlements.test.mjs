import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
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
create table public.store_memberships(user_id uuid,store_id uuid,role text,status text default 'active',crew_id uuid);
create table private.android_billing_purchases(user_id uuid,store_id uuid,environment text,state text,expires_at timestamptz,checked_at timestamptz,superseded_by text);
create table private.store_billing_enforcement(store_id uuid primary key,environment text);`);
const helpers=fs.readFileSync(new URL('../supabase/migrations/20260916070000_staff_auth_foundation_part1.sql',import.meta.url),'utf8');
await db.exec(helpers.slice(helpers.indexOf('create or replace function private.is_live_manee_session()'),helpers.indexOf('create or replace function private.current_crew_id')));
await db.exec(fs.readFileSync(new URL('../supabase/migrations/20261012093336_native_ios_services.sql',import.meta.url),'utf8'));
await db.exec(fs.readFileSync(new URL('../supabase/migrations/20261012094025_native_ios_account_cleanup.sql',import.meta.url),'utf8'));
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const owner=id(1),other=id(2),store=id(101),store2=id(102),device='ab'.repeat(32);
await db.exec(`insert into auth.users(id) values('${owner}'),('${other}');
insert into auth.sessions(id,user_id) select id,id from auth.users;
insert into public.profiles(user_id) select id from auth.users;
insert into public.stores(id) values('${store}'),('${store2}');
insert into public.store_memberships(user_id,store_id,role) values('${owner}','${store}','owner'),('${other}','${store2}','owner');`);
async function role(user){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",[user,JSON.stringify({sub:user,session_id:user,role:'authenticated'})]);await db.exec('set role authenticated');}
async function service(){await db.exec("reset role;select set_config('request.jwt.claims','{\"role\":\"service_role\"}',false);set role service_role");}
const rpc=(sql,args)=>db.query(sql,args);
after(()=>db.close());
await db.exec(fs.readFileSync(new URL('../supabase/migrations/20261015195952_native_ios_catalog_gates.sql',import.meta.url),'utf8'));
let first,second;
const record=(token,productId,environment='Production')=>({token,productId,environment,originalId:productId.includes('store2')?'200':'100',transactionId:'101',status:1,expiresAt:new Date(Date.now()+86400000).toISOString(),signedAt:new Date().toISOString(),revoked:false});
test('catalog preparation charges nobody and stable owner/store allocations use distinct products',async()=>{
 await role(owner);first=(await rpc('select public.manee_ios_context($1) r',[store])).rows[0].r;
 assert.equal(first.productId,'manee.store1.monthly');assert.equal(first.catalogEnabled,false);
 assert.equal((await rpc('select public.manee_ios_context($1) r',[store])).rows[0].r.appAccountToken,first.appAccountToken);
 await db.exec('reset role');await db.query('insert into public.store_memberships(user_id,store_id,role) values($1,$2,$3)',[owner,store2,'owner']);
 await role(owner);second=(await rpc('select public.manee_ios_context($1) r',[store2])).rows[0].r;
 assert.equal(second.productId,'manee.store2.monthly');assert.notEqual(second.appAccountToken,first.appAccountToken);
 await assert.rejects(()=>rpc('update private.ios_product_catalog set enabled=true'));
 await db.exec('reset role');assert.equal((await rpc('select count(*)::int n from private.store_billing_enforcement')).rows[0].n,0);
});
test('verified Apple purchases follow the server gate, environment, expiry, freshness and revocation',async()=>{
 await service();await rpc('select public.manee_ios_save_subscription($1)',[record(first.appAccountToken,first.productId)]);
 await db.exec('reset role');await rpc('insert into private.store_billing_enforcement values($1,$2)',[store,'Production']);
 const access=async()=> (await rpc('select private.manee_store_write_entitled($1) allowed',[store])).rows[0].allowed;
 assert.equal(await access(),false); // default-disabled catalog and release
 await db.exec('update private.ios_product_catalog set enabled=true;update private.ios_billing_release set production_enabled=true');
 assert.equal(await access(),true);
 for(const status of [2,3,5]){await rpc('update private.ios_subscriptions set status=$1',[status]);assert.equal(await access(),false);}
 await db.exec('update private.ios_subscriptions set status=4');assert.equal(await access(),true);
 await db.exec("update private.ios_subscriptions set checked_at=now()-interval '16 minutes'");assert.equal(await access(),false);
 await db.exec("update private.ios_subscriptions set checked_at=now(),revoked=true");assert.equal(await access(),false);
 await db.exec("update private.ios_subscriptions set revoked=false,expires_at=now()-interval '1 second'");assert.equal(await access(),false);
 await db.exec("update private.ios_subscriptions set expires_at=now()+interval '1 day',environment='Sandbox'");assert.equal(await access(),false);
 await db.exec("update private.store_billing_enforcement set environment='Sandbox';update private.ios_billing_release set sandbox_enabled=true");assert.equal(await access(),true);
 await db.exec("update public.store_memberships set status='revoked' where store_id='"+store+"'");assert.equal(await access(),false);
 await db.exec("update public.store_memberships set status='active';update auth.users set banned_until=now()+interval '1 day' where id='"+owner+"'");assert.equal(await access(),false);
 await db.exec('update auth.users set banned_until=null;update private.ios_billing_release set production_enabled=false,sandbox_enabled=false;update private.ios_product_catalog set enabled=false');
});
test('cross-store product substitution and rebinding are rejected',async()=>{
 await service();await assert.rejects(()=>rpc('select public.manee_ios_save_subscription($1)',[record(first.appAccountToken,second.productId)]));
 await assert.rejects(()=>rpc('select public.manee_ios_save_subscription($1)',[{...record(second.appAccountToken,second.productId),originalId:'100',environment:'Sandbox'}]));
});
test('refresh jobs are leased, unauthorized clients cannot claim and failed reads do not renew checked_at',async()=>{
 await role(owner);await assert.rejects(()=>rpc('select public.manee_ios_claim_refresh()'));
 await service();const jobs=(await rpc('select public.manee_ios_claim_refresh() jobs')).rows[0].jobs;assert.equal(jobs.length,1);
 assert.equal((await rpc('select public.manee_ios_claim_refresh() jobs')).rows[0].jobs.length,0);
 const old=(await rpc('select public.manee_ios_context($1) r',[store]).catch(()=>({rows:[]}))); // service has no customer authorization
 assert.equal(old.rows.length,0);
 const j=jobs[0];await rpc('select public.manee_ios_finish_refresh($1,$2,$3,false)',[j.environment,j.original_id,j.refresh_lease]);
 await db.exec('reset role');assert.equal((await rpc('select refresh_attempts n from private.ios_subscriptions')).rows[0].n,1);
});
