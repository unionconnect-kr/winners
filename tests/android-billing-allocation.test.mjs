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
const allocate=async(s=store,u=owner)=>{await role(u);return (await db.query('select public.manee_android_billing_product($1) as sku',[s])).rows[0].sku;};
let tick=Date.now();
const record=(token,s=store,productId='manee.store1.monthly',changes={})=>({purchaseToken:token,...google.binding(owner,s),productId,basePlanId:'monthly',environment:'Sandbox',state:'SUBSCRIPTION_STATE_ACTIVE',checkedAt:new Date(++tick).toISOString(),expiresAt:new Date(Date.now()+86400000).toISOString(),...changes});
async function save(r,s=store){await service();return(await db.query('select public.manee_android_billing_save($1,$2,$3) as ok',[owner,s,r])).rows[0].ok;}
test('stable allocation is owner-only and clients cannot add products or overwrite bindings',async()=>{
 await assert.rejects(()=>allocate(store,other),/Owner access denied/);
 assert.equal(await allocate(),'manee.store1.monthly');assert.equal(await allocate(),'manee.store1.monthly');
 await assert.rejects(()=>db.exec("insert into private.android_billing_products values('manee.store2.monthly',2,true)"));
 await assert.rejects(()=>db.exec('delete from private.android_billing_allocations'));
 assert.equal(await allocate(store2,other),'manee.store1.monthly');
});
test('another store waits for an enabled SKU and never steals the first store product',async()=>{
 await db.exec(`reset role;insert into public.store_memberships(user_id,store_id,role) values('${owner}','${store2}','owner');
 insert into private.android_billing_products values('manee.store2.monthly',2,false);`);
 assert.equal(await allocate(store2),null);
 await db.exec("reset role;update private.android_billing_products set enabled=true where slot=2");
 assert.equal(await allocate(store2),'manee.store2.monthly');assert.equal(await allocate(),'manee.store1.monthly');
});
test('second SKU persists and cannot be restored against another store or linked across products',async()=>{
 assert.equal(await save(record('one')),true);
 assert.equal(await save(record('two',store2,'manee.store2.monthly'),store2),true);
 await assert.rejects(()=>save(record('bad',store2,'manee.store1.monthly'),store2),/Invalid purchase record/);
 await assert.rejects(()=>save(record('two',store,'manee.store1.monthly')),/binding conflict/);
 await assert.rejects(()=>save(record('cross',store2,'manee.store2.monthly',{linkedPurchaseToken:'one'}),store2),/Linked purchase binding conflict/);
 assert.equal(await save(record('new-two',store2,'manee.store2.monthly',{linkedPurchaseToken:'unknown-two'}),store2),true);
 await db.exec('reset role');const rows=(await db.query("select product_id from private.android_billing_purchases where purchase_token='unknown-two'")).rows;
 assert.equal(rows[0].product_id,'manee.store2.monthly');
});
test('checkout claim is scoped to the owner, store, product and request ID',async()=>{
 const first=id(301),second=id(302),third=id(303);
 const claim=(s=store,sku='manee.store1.monthly',request=first)=>db.query(
  'select public.manee_android_billing_checkout_claim($1,$2,$3) as result',[s,sku,request]).then(x=>x.rows[0].result);
 const release=(s=store,request=first)=>db.query(
  'select public.manee_android_billing_checkout_release($1,$2) as released',[s,request]).then(x=>x.rows[0].released);
 await role(owner);
 assert.deepEqual(await claim(),{status:'claimed'});
 assert.deepEqual(await claim(),{status:'claimed'});
 assert.deepEqual(await claim(store,'manee.store1.monthly',second),{status:'in_progress'});
 assert.equal(await release(store,second),false);
 assert.equal(await release(),true);
 assert.deepEqual(await claim(store,'manee.store1.monthly',second),{status:'claimed'});
 await assert.rejects(()=>claim(store,'manee.store2.monthly',third),/Invalid checkout allocation/);
 await assert.rejects(()=>claim(store2,'manee.store1.monthly',third),/Invalid checkout allocation/);
 await service();await assert.rejects(()=>db.exec('delete from private.android_billing_checkout_claims'));
 await db.exec('reset role');
 await db.exec('update private.android_billing_checkout_claims set expires_at=now()-interval \'1 second\'');
 await role(owner);assert.deepEqual(await claim(store,'manee.store1.monthly',third),{status:'claimed'});
 await role(other);await assert.rejects(()=>claim(store,'manee.store1.monthly',first),/Owner access denied/);
 await role(owner);assert.equal(await release(store,second),false);
 await save(record('paid-checkout',store,'manee.store1.monthly',{environment:'Production'}));
 await role(owner);assert.deepEqual(await claim(store,'manee.store1.monthly',first),{status:'active'});
});
