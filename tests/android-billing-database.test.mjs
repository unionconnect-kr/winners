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
test('purchase persistence is service-only; rows and tokens stay private',async()=>{
 await role(owner);await assert.rejects(()=>db.query('select public.manee_android_billing_save($1,$2,$3)',[owner,store,record('a')]));
 await assert.rejects(()=>db.query('select * from private.android_billing_purchases'));
 await db.exec('reset role;set role anon');await assert.rejects(()=>db.query('select public.manee_android_billing_status($1)',[store]));
 assert.equal(await save(record('a')),true);
 const rows=await status();assert.equal(rows[0].active,true);assert.equal(rows[0].purchaseToken,undefined);
 await role(other);await assert.rejects(()=>db.query('select public.manee_android_billing_status($1)',[store]));
});
test('same token cannot change owner, store or environment, including forged binding',async()=>{
 await db.exec(`reset role;insert into public.store_memberships(user_id,store_id,role) values('${owner}','${store2}','owner')`);
 await assert.rejects(()=>save(record('a',{...google.binding(other,store2)}),other,store2),/binding conflict/);
 await assert.rejects(()=>save(record('a',{...google.binding(owner,store2)}),owner,store2),/binding conflict/);
 await assert.rejects(()=>save(record('a',{environment:'Sandbox'})),/binding conflict/);
 await assert.rejects(()=>save(record('forged',{profileId:'0'.repeat(64)})),/Invalid purchase/);
});
test('stale verification cannot overwrite a newer revocation',async()=>{
 const stale=record('a');await save(record('a',{state:'SUBSCRIPTION_STATE_EXPIRED'}));
 assert.equal(await save(stale),false);assert.equal((await status())[0].active,false);
});
test('linked token is superseded atomically and unknown prior token is tombstoned',async()=>{
 await save(record('b',{linkedPurchaseToken:'a'}));assert.equal(await save(record('a')),false);
 await save(record('c',{linkedPurchaseToken:'not-seen'}));assert.equal(await save(record('not-seen')),false);
 assert.equal((await status()).length,2);
 await assert.rejects(()=>save(record('d',{linkedPurchaseToken:'a'})),/Linked purchase binding conflict/);
 await assert.rejects(()=>save(record('cross-owner',{...google.binding(other,store2),linkedPurchaseToken:'b'}),other,store2),/Linked purchase binding conflict/);
});
test('sandbox never grants production access; cancel keeps access until expiry and hold blocks it',async()=>{
 await save(record('sandbox',{environment:'Sandbox'}));let rows=await status();let s=rows.find(r=>r.environment==='Sandbox');assert.equal(s.active,false);assert.equal(s.testActive,true);
 await save(record('b',{state:'SUBSCRIPTION_STATE_CANCELED'}));rows=await status();assert.equal(rows.find(r=>r.state.endsWith('_CANCELED')).active,true);
 await save(record('b',{state:'SUBSCRIPTION_STATE_CANCELED',expiresAt:new Date(Date.now()-1000).toISOString()}));rows=await status();assert.equal(rows.find(r=>r.state.endsWith('_CANCELED')).active,false);
 await save(record('c',{state:'SUBSCRIPTION_STATE_ON_HOLD'}));rows=await status();assert.equal(rows.find(r=>r.state.endsWith('_ON_HOLD')).active,false);
});
test('unrefreshed subscriptions and revoked owners cannot grant access',async()=>{
 await db.exec("reset role;update private.android_billing_purchases set checked_at=now()-interval '16 minutes'");
 assert.equal((await status()).some(r=>r.active||r.testActive),false);
 await db.exec(`reset role;update public.store_memberships set status='revoked' where user_id='${owner}'`);
 await assert.rejects(()=>save(record('revoked-owner')),/Owner access denied/);
 await assert.rejects(()=>status(),/Owner access denied/);
});
