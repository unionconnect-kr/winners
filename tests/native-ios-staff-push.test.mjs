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
const read=name=>fs.readFileSync(new URL('../supabase/migrations/'+name,import.meta.url),'utf8');
const helpers=read('20260916070000_staff_auth_foundation_part1.sql');
await db.exec(helpers.slice(helpers.indexOf('create or replace function private.is_live_manee_session()'),helpers.indexOf('create or replace function private.current_crew_id')));
await db.exec(read('20261012093336_native_ios_services.sql'));
await db.exec(`create function private.manee_ios_push_context(p_store_id uuid) returns boolean language sql stable security definer set search_path='' as $$select false$$;
create function public.manee_ios_push_context(p_store_id uuid) returns boolean language sql stable security invoker set search_path='' as $$select private.manee_ios_push_context(p_store_id)$$;
revoke all on function public.manee_ios_push_context(uuid) from public,anon;grant execute on function public.manee_ios_push_context(uuid) to authenticated;`);
await db.exec(read('20261016063427_native_ios_staff_push.sql'));
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const owner=id(1),staff=id(2),other=id(3),store=id(101),foreign=id(102),crew=id(201),ownerToken='ab'.repeat(32),staffToken='cd'.repeat(32);
await db.exec(`insert into auth.users(id) values('${owner}'),('${staff}'),('${other}');
insert into auth.sessions(id,user_id) select id,id from auth.users;
insert into public.profiles(user_id) select id from auth.users;
insert into public.stores(id) values('${store}'),('${foreign}');
insert into public.crew(id,store_id) values('${crew}','${store}');
insert into public.store_memberships(user_id,store_id,role,crew_id) values('${owner}','${store}','owner',null),('${staff}','${store}','staff','${crew}');`);
const q=(sql,args)=>db.query(sql,args);
async function role(user){await db.exec('reset role');await q("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",[user,JSON.stringify({sub:user,session_id:user,role:'authenticated'})]);await db.exec('set role authenticated');}
const targets=async user=>{await db.exec('reset role;set role service_role');return (await q('select * from public.manee_ios_push_targets($1,$2)',[store,user])).rows.map(x=>x.token);};
after(()=>db.close());
test('approved staff may bind and self-test, while owner broadcast never includes staff',async()=>{
 await role(owner);await q('select public.manee_ios_push($1,$2,true)',[store,ownerToken]);
 await role(staff);assert.equal((await q('select public.manee_ios_push_context($1) as ok',[store])).rows[0].ok,true);
 await q('select public.manee_ios_push($1,$2,true)',[store,staffToken]);
 await assert.rejects(()=>q('select public.manee_ios_context($1)',[store])); // Billing remains owner only.
 await assert.rejects(()=>q('select * from private.ios_push_devices'));
 await assert.rejects(()=>q('select * from public.manee_ios_push_targets($1,$2)',[store,owner]));
 assert.deepEqual(await targets(null),[ownerToken]);assert.deepEqual(await targets(staff),[staffToken]);assert.deepEqual(await targets(other),[]);
});
test('foreign stores, unlinked users, retired crew, revoked memberships and expired sessions fail closed',async()=>{
 await role(other);assert.equal((await q('select public.manee_ios_push_context($1) as ok',[store])).rows[0].ok,false);
 await assert.rejects(()=>q('select public.manee_ios_push($1,$2,true)',[store,'ef'.repeat(32)]));
 await role(staff);await assert.rejects(()=>q('select public.manee_ios_push($1,$2,true)',[foreign,staffToken]));
 for(const [deny,restore] of [
  [`update public.crew set resign_date=current_date where id='${crew}'`,`update public.crew set resign_date=null where id='${crew}'`],
  [`update public.store_memberships set status='revoked' where user_id='${staff}'`,`update public.store_memberships set status='active' where user_id='${staff}'`],
  [`update auth.sessions set not_after=now()-interval '1 minute' where user_id='${staff}'`,`update auth.sessions set not_after=null where user_id='${staff}'`],
  [`update auth.users set banned_until=now()+interval '1 day' where id='${staff}'`,`update auth.users set banned_until=null where id='${staff}'`]
 ]){
  await db.exec('reset role;'+deny);assert.deepEqual(await targets(staff),[]);
  await role(staff);await assert.rejects(()=>q('select public.manee_ios_push($1,$2,true)',[store,staffToken]));
  await db.exec('reset role;'+restore);
 }
});
test('a device cannot be taken over; disabling removes only the current account session',async()=>{
 await role(staff);await assert.rejects(()=>q('select public.manee_ios_push($1,$2,true)',[store,ownerToken]));
 await q('select public.manee_ios_push(null,null,false)');assert.deepEqual(await targets(staff),[]);assert.deepEqual(await targets(null),[ownerToken]);
 await db.exec('reset role;set role anon');await assert.rejects(()=>q('select public.manee_ios_push_context($1)',[store]));
});
