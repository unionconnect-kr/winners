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

test('Android credentials are private and owner/session scoped',async()=>{
 await role(owner);await rpc('select public.manee_android_push($1,$2,true)',[store,device]);
 await assert.rejects(()=>rpc('select * from private.android_push_devices'));
 await assert.rejects(()=>rpc('select * from public.manee_android_push_targets($1)',[store]));
 await assert.rejects(()=>rpc('select public.manee_android_push($1,$2,true)',[store2,device]));
 await role(other);await assert.rejects(()=>rpc('select public.manee_android_push($1,$2,true)',[store2,device]));
 await db.exec('reset role;set role anon');await assert.rejects(()=>rpc('select public.manee_android_push_context($1)',[store]));
});
test('test target is this live session only, rate limited, and preserves FCM token case',async()=>{
 await role(owner);assert.equal((await rpc('select public.manee_android_push_test_target($1) as token',[store])).rows[0].token,device);
 await assert.rejects(()=>rpc('select public.manee_android_push_test_target($1)',[store]));
 await role(other);await assert.rejects(()=>rpc('select public.manee_android_push_test_target($1)',[store]));
});
test('rotating token leaves one device; disabled/expired/revoked accounts cannot receive',async()=>{
 await role(owner);await rpc('select public.manee_android_push($1,$2,true)',[store,device+'NEW']);
 await service();assert.deepEqual((await rpc('select * from public.manee_android_push_targets($1)',[store])).rows.map(r=>r.token),[device+'NEW']);
 await db.exec(`reset role;update public.store_memberships set status='revoked' where user_id='${owner}'`);
 await service();assert.equal((await rpc('select * from public.manee_android_push_targets($1)',[store])).rows.length,0);
 await role(owner);await rpc('select public.manee_android_push(null,null,false)');
 await db.exec(`reset role;update public.store_memberships set status='active' where user_id='${owner}'`);
 await role(owner);await rpc('select public.manee_android_push($1,$2,true)',[store,device]);
 await db.exec(`reset role;update auth.sessions set not_after=now()-interval '1 day' where user_id='${owner}'`);
 await role(owner);await assert.rejects(()=>rpc('select public.manee_android_push_context($1)',[store]));
 await service();assert.equal((await rpc('select * from public.manee_android_push_targets($1)',[store])).rows.length,0);
 await db.exec('reset role');await db.query('delete from auth.users where id=$1',[owner]);
 assert.equal((await rpc('select count(*)::int as n from private.android_push_devices')).rows[0].n,0);
});
