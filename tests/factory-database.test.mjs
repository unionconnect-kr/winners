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
await db.exec(fs.readFileSync(new URL('../supabase/migrations/20261020010856_factory_logistics_recipes.sql',import.meta.url),'utf8'));
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const owner=id(1),other=id(2),staff=id(3),store=id(101),otherStore=id(102),inactive=id(103),recipe=id(201),draft=id(202);
await db.exec(`insert into auth.users(id) values('${owner}'),('${other}'),('${staff}');
insert into auth.sessions(id,user_id) select id,id from auth.users;
insert into public.profiles(user_id) select id from auth.users;
insert into public.stores(id) values('${store}'),('${otherStore}'),('${inactive}');
insert into public.store_memberships(user_id,store_id,role) values('${owner}','${store}','owner'),('${owner}','${inactive}','owner'),('${other}','${otherStore}','owner'),('${staff}','${store}','staff');
insert into private.factory_logistics_accounts(store_id,status) values('${store}','active'),('${otherStore}','active'),('${inactive}','pending');
insert into private.factory_recipes(id,title,summary,instructions,video_url,published) values('${recipe}','Menu','Preview','secret steps','https://example.com/secret',true),('${draft}','Draft','','draft secret',null,false);`);
async function role(user,role='authenticated'){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",[user||'',JSON.stringify({sub:user,session_id:user,role})]);await db.exec('set role '+role);}
const call=async(name,args)=>(await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as result`,args)).rows[0].result;
after(()=>db.close());
test('logistics owner gets published recipe free; metadata never leaks body/video',async()=>{
 await role(owner);const data=await call('manee_factory_catalog',[store]);assert.equal(data.logistics_active,true);assert.equal(data.recipes.length,1);
 assert.equal(data.recipes[0].instructions,undefined);assert.equal(data.recipes[0].video_url,undefined);
 assert.equal((await call('manee_factory_recipe',[store,recipe])).instructions,'secret steps');
 await assert.rejects(()=>call('manee_factory_recipe',[store,draft]));
});
test('pending/non-logistics stores cannot read bodies or self-activate',async()=>{
 await role(owner);assert.equal((await call('manee_factory_catalog',[inactive])).logistics_active,false);
 await assert.rejects(()=>call('manee_factory_recipe',[inactive,recipe]));
 await assert.rejects(()=>db.query("update private.factory_logistics_accounts set status='active' where store_id=$1",[inactive]));
 await assert.rejects(()=>db.query('select * from private.factory_recipes'));
});
test('other owner, staff and anonymous direct RPCs are denied',async()=>{
 await role(other);await assert.rejects(()=>call('manee_factory_recipe',[store,recipe]));await assert.rejects(()=>call('manee_factory_catalog',[store]));
 await role(staff);await assert.rejects(()=>call('manee_factory_recipe',[store,recipe]));
 await role(null,'anon');await assert.rejects(()=>call('manee_factory_catalog',[store]));await assert.rejects(()=>call('manee_factory_recipe',[store,recipe]));
});
test('deactivation takes effect on the very next request',async()=>{
 await db.exec(`reset role;update private.factory_logistics_accounts set status='inactive' where store_id='${store}'`);
 await role(owner);await assert.rejects(()=>call('manee_factory_recipe',[store,recipe]));
 await db.exec(`reset role;update private.factory_logistics_accounts set status='active' where store_id='${store}'`);
});
test('revoked membership, banned user, archived store and expired session deny access',async()=>{
 for(const [table,field,value,where] of [['store_memberships','status',"'revoked'",`user_id='${owner}'`],['users','banned_until',"now()+interval '1 day'",`id='${owner}'`],['stores','archived_at','now()',`id='${store}'`],['sessions','not_after',"now()-interval '1 day'",`user_id='${owner}'`]]){
  const schema=['users','sessions'].includes(table)?'auth':'public';
  await db.exec(`reset role;update ${schema}.${table} set ${field}=${value} where ${where}`);await role(owner);
  await assert.rejects(()=>call('manee_factory_recipe',[store,recipe]));
  await db.exec(`reset role;update ${schema}.${table} set ${field}=${field==='status'?"'active'":'null'} where ${where}`);
 }
});
