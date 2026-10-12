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
create table public.store_memberships(user_id uuid,store_id uuid,role text,status text default 'active',crew_id uuid);`);
const helpers=fs.readFileSync(new URL('../supabase/migrations/20260916070000_staff_auth_foundation_part1.sql',import.meta.url),'utf8');
await db.exec(helpers.slice(helpers.indexOf('create or replace function private.is_live_manee_session()'),helpers.indexOf('create or replace function private.current_crew_id')));
await db.exec(fs.readFileSync(new URL('../supabase/migrations/20261012093336_native_ios_services.sql',import.meta.url),'utf8'));
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
