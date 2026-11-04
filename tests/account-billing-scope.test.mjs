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
// Seed a historical single-product receipt using the original save function.
await service();
await db.query('select public.manee_android_billing_save($1,$2,$3)',[owner,store,{purchaseToken:'historical',...google.binding(owner,store),productId:'manee.store1.monthly',basePlanId:'monthly',environment:'Sandbox',state:'SUBSCRIPTION_STATE_EXPIRED',checkedAt:new Date().toISOString(),expiresAt:new Date(Date.now()-1000).toISOString()}]);
await db.exec('reset role');
await db.exec(fs.readFileSync(new URL('../supabase/migrations/20261014040120_android_billing_product_allocation.sql',import.meta.url),'utf8'));
await db.exec(fs.readFileSync(new URL('../supabase/migrations/20261014145616_android_billing_checkout_claim.sql',import.meta.url),'utf8'));

await db.exec(`create table private.store_billing_enforcement(store_id uuid primary key,environment text);`);
for(const migration of ['20261012093336_native_ios_services.sql','20261012094025_native_ios_account_cleanup.sql','20261015195952_native_ios_catalog_gates.sql'])
 await db.exec(fs.readFileSync(new URL('../supabase/migrations/'+migration,import.meta.url),'utf8'));
await db.exec(`insert into public.store_memberships(user_id,store_id,role) values('${owner}','${store2}','owner');
 update private.ios_product_catalog set enabled=true;
 update private.ios_billing_release set production_enabled=true;
 insert into private.android_billing_products values('manee.store2.monthly',2,true);`);
await role(owner);
const ios1=(await rpc('select public.manee_ios_context($1) r',[store])).rows[0].r;
const ios2=(await rpc('select public.manee_ios_context($1) r',[store2])).rows[0].r;
await rpc('select public.manee_android_billing_product($1)',[store2]);
await db.exec('reset role');
await db.exec(fs.readFileSync(new URL('../supabase/migrations/20261026103709_account_subscription_scope.sql',import.meta.url),'utf8'));

test('account migration keeps original bindings and exposes only the owner allocations',async()=>{
 await role(owner);
 const a=(await rpc('select public.manee_android_account_context($1) r',[store2])).rows[0].r;
 assert.equal(a.billingStoreId,store);assert.equal(a.productId,'manee.store1.monthly');assert.equal(a.restoreProductIds.length,2);
 const i=(await rpc('select public.manee_ios_context($1) r',[store2])).rows[0].r;
 assert.equal(i.appAccountToken,ios1.appAccountToken);assert.equal(i.billingScope,'account');
 assert.deepEqual(new Set(i.bindings.map(b=>b.appAccountToken)),new Set([ios1.appAccountToken,ios2.appAccountToken]));
 await role(other);await assert.rejects(()=>rpc('select public.manee_android_account_context($1)',[store]),/Owner access denied/);
});
test('account lease serializes iOS and Android checkout across different stores',async()=>{
 await role(owner);
 const claim=async(s,provider,key)=>(await rpc('select public.manee_account_billing_checkout_claim($1,$2,$3,$4) r',[s,provider,'manee.store1.monthly',key])).rows[0].r;
 assert.equal((await claim(store,'ios',id(901))).status,'claimed');
 assert.equal((await claim(store2,'android',id(902))).status,'in_progress');
 assert.equal((await rpc('select public.manee_account_billing_checkout_release($1,$2,$3) r',[store2,'android',id(901)])).rows[0].r,false);
 assert.equal((await rpc('select public.manee_account_billing_checkout_release($1,$2,$3) r',[store2,'ios',id(901)])).rows[0].r,true);
 assert.equal((await claim(store2,'android',id(902))).status,'claimed');
 await rpc('select public.manee_account_billing_checkout_release($1,$2,$3)',[store,'android',id(902)]);
});
test('one verified account receipt covers both stores; expired receipts and sandbox do not grant production access',async()=>{
 await db.exec(`reset role;insert into private.store_billing_enforcement values('${store}','Production'),('${store2}','Production');`);
 const access=async()=> (await rpc('select private.manee_store_write_entitled($1) a, private.manee_store_write_entitled($2) b',[store,store2])).rows[0];
 assert.deepEqual(await access(),{a:false,b:false});
 await db.exec("update private.android_billing_purchases set environment='Production',state='SUBSCRIPTION_STATE_ACTIVE',expires_at=now()+interval '1 day',checked_at=now()");
 assert.deepEqual(await access(),{a:true,b:true});
 await db.exec("update private.android_billing_purchases set expires_at=now()-interval '1 second'");assert.deepEqual(await access(),{a:false,b:false});
 await db.exec("update private.android_billing_purchases set expires_at=now()+interval '1 day',environment='Sandbox'");assert.deepEqual(await access(),{a:false,b:false});
 await db.exec(`delete from private.store_billing_enforcement where store_id='${store2}'`);assert.deepEqual(await access(),{a:false,b:true});
});
