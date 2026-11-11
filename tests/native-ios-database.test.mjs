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
create table private.store_billing_enforcement(store_id uuid primary key,environment text);
create table private.android_billing_purchases(user_id uuid,store_id uuid,environment text,state text,expires_at timestamptz,checked_at timestamptz,superseded_by text);`);
const helpers=fs.readFileSync(new URL('../supabase/migrations/20260916070000_staff_auth_foundation_part1.sql',import.meta.url),'utf8');
await db.exec(helpers.slice(helpers.indexOf('create or replace function private.is_live_manee_session()'),helpers.indexOf('create or replace function private.current_crew_id')));
await db.exec(fs.readFileSync(new URL('../supabase/migrations/20261012093336_native_ios_services.sql',import.meta.url),'utf8'));
await db.exec(fs.readFileSync(new URL('../supabase/migrations/20261012094025_native_ios_account_cleanup.sql',import.meta.url),'utf8'));
await db.exec(fs.readFileSync(new URL('../supabase/migrations/20261015195952_native_ios_catalog_gates.sql',import.meta.url),'utf8'));
await db.exec(fs.readFileSync(new URL('../supabase/migrations/20261111150959_native_ios_expired_subscription_repurchase.sql',import.meta.url),'utf8'));
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const owner=id(1),other=id(2),store=id(101),store2=id(102),device='ab'.repeat(32);
await db.exec(`insert into auth.users(id) values('${owner}'),('${other}');
insert into auth.sessions(id,user_id) select id,id from auth.users;
insert into public.profiles(user_id) select id from auth.users;
insert into public.stores(id) values('${store}'),('${store2}');
insert into public.store_memberships(user_id,store_id,role) values('${owner}','${store}','owner'),('${other}','${store2}','owner');`);
async function role(user){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",[user,JSON.stringify({sub:user,session_id:user,role:'authenticated'})]);await db.exec('set role authenticated');}
async function service(){await db.exec('reset role;set role service_role');}
const rpc=(sql,args)=>db.query(sql,args);
after(()=>db.close());
test('owner binding is stable and unauthorized users cannot read or assign entitlements',async()=>{
 await role(owner);const first=(await rpc('select public.manee_ios_context($1) as r',[store])).rows[0].r;
 assert.equal((await rpc('select public.manee_ios_context($1) as r',[store])).rows[0].r.appAccountToken,first.appAccountToken);
 await assert.rejects(()=>rpc('select public.manee_ios_context($1)',[store2]));
 await assert.rejects(()=>rpc('select * from private.ios_billing_accounts'));
 await assert.rejects(()=>rpc("select public.manee_ios_save_subscription('{}'::jsonb)"));
 await role(other);await assert.rejects(()=>rpc('select public.manee_ios_context($1)',[store]));
});
test('verified records cannot be rebound or rolled back by stale transaction dates',async()=>{
 await role(owner);const token=(await rpc('select public.manee_ios_context($1) as r',[store])).rows[0].r.appAccountToken;
 await role(other);const token2=(await rpc('select public.manee_ios_context($1) as r',[store2])).rows[0].r.appAccountToken;
 const record={productId:'manee.store1.monthly',environment:'Production',originalId:'1',transactionId:'2',token,status:5,revoked:true,expiresAt:'2099-01-01',signedAt:new Date().toISOString()};
 await service();await rpc('select public.manee_ios_save_subscription($1)',[record]);
 await assert.rejects(()=>rpc('select public.manee_ios_save_subscription($1)',[{...record,token:token2}]));
 await rpc('select public.manee_ios_save_subscription($1)',[{...record,revoked:false,status:1,signedAt:'2000-01-01'}]);
 await role(owner);const state=(await rpc('select public.manee_ios_context($1) as r',[store])).rows[0].r;
 assert.equal(state.subscriptions[0].revoked,true);assert.equal(state.subscriptions[0].status,5);
});
test('an expired Apple subscription accepts a verified repurchase without transferring an active subscription',async()=>{
 await role(owner);const token=(await rpc('select public.manee_ios_context($1) as r',[store])).rows[0].r.appAccountToken;
 await role(other);const token2=(await rpc('select public.manee_ios_context($1) as r',[store2])).rows[0].r.appAccountToken;
 const original={productId:'manee.store1.monthly',environment:'Sandbox',originalId:'3',transactionId:'4',token,status:2,
  revoked:false,expiresAt:'2020-01-02T00:00:00Z',signedAt:'2020-01-02T00:05:00Z'};
 const repurchase={...original,token:token2,transactionId:'5',status:1,expiresAt:'2099-01-01T00:00:00Z',
  signedAt:'2020-01-03T00:01:00Z',verifiedPurchaseAt:'2020-01-03T00:00:00Z'};
 const save=record=>rpc('select public.manee_ios_save_subscription($1)',[record]);
 await service();
 try{
  await save(original);
  await assert.rejects(()=>save({...repurchase,verifiedPurchaseAt:undefined}),{code:'23505'});
  await assert.rejects(()=>save({...repurchase,verifiedPurchaseAt:'2020-01-01T00:00:00Z'}),{code:'23505'});
  await assert.rejects(()=>save({...repurchase,transactionId:original.transactionId}),{code:'23505'});
  await assert.rejects(()=>save({...repurchase,status:2}),{code:'23505'});
  await save(repurchase);
  await save(repurchase);
  await assert.rejects(()=>save({...repurchase,token,transactionId:'6',signedAt:'2020-01-04T00:01:00Z',verifiedPurchaseAt:'2020-01-04T00:00:00Z'}),{code:'23505'});
  await role(owner);
  assert.equal((await rpc('select public.manee_ios_context($1) as r',[store])).rows[0].r.subscriptions.some(s=>s.originalId==='3'),false);
  await role(other);
  const [current]=(await rpc('select public.manee_ios_context($1) as r',[store2])).rows[0].r.subscriptions;
  assert.equal(current.status,1);
  assert.equal(current.environment,'Sandbox');
 }finally{
  await db.exec("reset role; delete from private.ios_subscriptions where environment='Sandbox' and original_id='3'");
 }
});
test('push authorization is current; account takeover and revoked sessions are rejected',async()=>{
 await role(owner);await rpc('select public.manee_ios_push($1,$2,true)',[store,device]);
 await role(other);await assert.rejects(()=>rpc('select public.manee_ios_push($1,$2,true)',[store2,device]));
 await service();assert.equal((await rpc('select * from public.manee_ios_push_targets($1,null)',[store])).rows.length,1);
 await db.exec(`reset role;update public.store_memberships set status='revoked' where user_id='${owner}'`);
 await service();assert.equal((await rpc('select * from public.manee_ios_push_targets($1,null)',[store])).rows.length,0);
 await role(owner);await rpc('select public.manee_ios_push(null,null,false)');
 await db.exec(`reset role;update auth.sessions set not_after=now()-interval '1 day' where user_id='${owner}'`);
 await role(owner);await assert.rejects(()=>rpc('select public.manee_ios_context($1)',[store]));
});

test('account deletion removes native bindings and cannot leave restorable client entitlements',async()=>{
 await db.exec('reset role');await db.query('delete from auth.users where id=$1',[owner]);
 assert.equal((await db.query('select count(*)::int as n from private.ios_billing_accounts where user_id=$1',[owner])).rows[0].n,0);
 assert.equal((await db.query('select count(*)::int as n from private.ios_subscriptions')).rows[0].n,0);
});
