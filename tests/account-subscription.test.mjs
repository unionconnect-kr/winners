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
const migration=name=>db.exec(fs.readFileSync(new URL('../supabase/migrations/'+name,import.meta.url),'utf8'));
await migration('20261014040120_android_billing_product_allocation.sql');
await migration('20261014145616_android_billing_checkout_claim.sql');
await migration('20261012093336_native_ios_services.sql');
await migration('20261012094025_native_ios_account_cleanup.sql');
await db.exec('create table private.store_billing_enforcement(store_id uuid primary key,environment text)');
await migration('20261015195952_native_ios_catalog_gates.sql');
const third=id(103),foreign=id(104),sku='manee.store1.monthly',sku2='manee.store2.monthly';
await db.exec(`insert into public.stores(id) values('${third}'),('${foreign}');
 insert into public.store_memberships(user_id,store_id,role) values('${owner}','${store2}','owner'),('${owner}','${third}','owner'),('${other}','${foreign}','owner'),('${owner}','${foreign}','manager');
 insert into private.android_billing_products values('${sku2}',2,true);
 update private.ios_product_catalog set enabled=true;update private.ios_billing_release set production_enabled=true;
 insert into private.store_billing_enforcement select id,'Production' from public.stores;`);
// Existing per-store allocations and receipts are preserved across the migration.
await role(owner);
for(const st of [store,store2])await rpc('select public.manee_android_billing_product($1)',[st]);
const legacy=[];
for(const st of [store,store2])legacy.push((await rpc('select public.manee_ios_context($1) r',[st])).rows[0].r);
await db.exec('reset role');
await migration('20261026103709_account_subscription_scope.sql');
const context=async(st=store,product=null,u=owner)=>{await role(u);return(await rpc('select public.manee_android_account_context($1,$2) r',[st,product])).rows[0].r;};
const entitled=async(st)=>{await db.exec('reset role');return(await rpc('select private.manee_store_write_entitled($1) ok',[st])).rows[0].ok;};
let tick=Date.now();
const receipt=(changes={})=>({purchaseToken:'account-paid',...google.binding(owner,store),productId:sku,basePlanId:'monthly',environment:'Production',state:'SUBSCRIPTION_STATE_ACTIVE',checkedAt:new Date(++tick).toISOString(),expiresAt:new Date(Date.now()+86400000).toISOString(),...changes});
const save=async(changes={})=>{await service();return(await rpc('select public.manee_android_billing_save($1,$2,$3) ok',[owner,store,receipt(changes)])).rows[0].ok;};
const reset=async()=>{await db.exec(`reset role;delete from private.android_billing_purchases;delete from private.ios_subscriptions;delete from private.account_billing_checkouts;
 update public.store_memberships set status='active';update public.profiles set status='active';update public.stores set archived_at=null;update auth.users set banned_until=null;
 update private.ios_product_catalog set enabled=true;update private.ios_billing_release set production_enabled=true,sandbox_enabled=false;`);};
test('one account uses a stable product/token from every owned store and retains all legacy restore bindings',async()=>{
 for(const st of [store,store2,third]){
  const c=await context(st);assert.equal(c.productId,sku);assert.equal(c.billingStoreId,store);assert.deepEqual(c.restoreProductIds,[sku,sku2]);
  const ios=(await rpc('select public.manee_ios_context($1) r',[st])).rows[0].r;
  assert.equal(ios.appAccountToken,legacy[0].appAccountToken);assert.equal(ios.bindings.length,2);
 }
 assert.equal((await context(third,sku2)).billingStoreId,store2);
 await assert.rejects(()=>context(foreign),/Owner access denied/);
 await assert.rejects(()=>context(store,null,other),/Owner access denied/);
 await db.exec('reset role;set role anon');await assert.rejects(()=>rpc('select public.manee_android_account_context($1)',[store]));
 await role(owner);await assert.rejects(()=>rpc('select * from private.account_billing_checkouts'));
});
test('one Google subscription covers current owned stores, never manager-only or another owner stores',async()=>{
 await reset();await save();
 for(const st of [store,store2,third])assert.equal(await entitled(st),true);
 assert.equal(await entitled(foreign),false);
 await role(owner);const status=(await rpc('select public.manee_android_billing_status($1) r',[third])).rows[0].r;
 assert.equal(status.subscriptions[0].active,true);assert.ok(!JSON.stringify(status).includes('account-paid'));
 const ios=(await rpc('select public.manee_ios_context($1) r',[third])).rows[0].r;assert.equal(ios.otherPlatformActive,true);
 await db.exec(`reset role;update public.store_memberships set status='revoked' where user_id='${owner}' and store_id='${third}'`);
 assert.equal(await entitled(third),false);assert.equal(await entitled(store2),true);
});
test('sandbox, stale receipts, hold, expiry, supersession and banned accounts cannot unlock production stores',async()=>{
 for(const change of [{environment:'Sandbox'},{state:'SUBSCRIPTION_STATE_ON_HOLD'},{expiresAt:new Date(Date.now()-1000).toISOString()}]){
  await reset();await save(change);assert.equal(await entitled(third),false);
 }
 await reset();await save();
 await db.exec("reset role;update private.android_billing_purchases set checked_at=now()-interval '16 minutes'");assert.equal(await entitled(third),false);
 await db.exec("update private.android_billing_purchases set checked_at=now(),superseded_by='new-token'");assert.equal(await entitled(third),false);
 await db.exec("update private.android_billing_purchases set superseded_by=null;update auth.users set banned_until=now()+interval '1 day'");assert.equal(await entitled(third),false);
});
test('Apple account receipt covers all owned stores while catalog, environment and revocation gates remain enforced',async()=>{
 await reset();await db.exec('reset role');
 await rpc(`insert into private.ios_subscriptions(environment,original_id,token,product_id,transaction_id,status,expires_at,revoked,signed_at)
 values('Production','123',$1,$2,'124',1,now()+interval '1 day',false,now())`,[legacy[1].appAccountToken,sku2]);
 assert.equal(await entitled(third),true);assert.equal(await entitled(foreign),false);
 const android=await context(third);assert.equal(android.otherPlatformActive,true);
 await db.exec('reset role;update private.ios_subscriptions set revoked=true');assert.equal(await entitled(third),false);
 await db.exec('update private.ios_subscriptions set revoked=false;update private.ios_product_catalog set enabled=false');assert.equal(await entitled(third),false);
 await db.exec('update private.ios_product_catalog set enabled=true;update private.ios_billing_release set production_enabled=false');assert.equal(await entitled(third),false);
});
test('shared account checkout lease serializes stores and platforms, releases only its exact request',async()=>{
 await reset();await context();
 const claim=async(st,provider,request)=>{await role(owner);return(await rpc('select public.manee_account_billing_checkout_claim($1,$2,$3,$4) r',[st,provider,sku,request])).rows[0].r.status;};
 const release=async(request)=>{await role(owner);return(await rpc("select public.manee_account_billing_checkout_release($1,'android',$2) r",[third,request])).rows[0].r;};
 assert.equal(await claim(store,'android',id(301)),'claimed');
 assert.equal(await claim(third,'android',id(301)),'claimed');
 assert.equal(await claim(store2,'android',id(302)),'in_progress');
 assert.equal(await claim(third,'ios',id(303)),'in_progress');
 assert.equal(await release(id(302)),false);assert.equal(await release(id(301)),true);
 assert.equal(await claim(third,'ios',id(303)),'claimed');
 await save();assert.equal(await claim(store2,'android',id(304)),'active');
});
test('archiving the original receipt store preserves the account subscription without granting access to the archived store',async()=>{
 await reset();await save();await db.exec('reset role');await rpc('update public.stores set archived_at=now() where id=$1',[store]);
 assert.equal(await entitled(third),true);assert.equal(await entitled(store),false);
 assert.equal((await context(third)).billingStoreId,store);
 assert.equal(await save({purchaseToken:'after-archive'}),true);
 await service();await assert.rejects(()=>rpc('select public.manee_android_billing_save($1,$2,$3)',[other,foreign,{...receipt(),...google.binding(other,foreign)}]));
});
