import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

const db=new PGlite();after(()=>db.close());
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const owner=id(1),outsider=id(2),store=id(101),other=id(102),template=id(201);
await db.exec(`create role anon;create role authenticated;create role service_role;
create schema auth;create schema private;
create table auth.users(id uuid primary key,banned_until timestamptz);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create table public.profiles(user_id uuid,status text);
create table public.stores(id uuid primary key,archived_at timestamptz);
create table public.store_memberships(user_id uuid,store_id uuid,role text,status text);
create table private.android_billing_purchases(user_id uuid,store_id uuid,environment text,state text,expires_at timestamptz,checked_at timestamptz,superseded_by text);
create function private.is_live_manee_session() returns boolean language sql as $$select auth.uid() is not null$$;
create function private.has_store_membership(s uuid) returns boolean language sql as $$select exists(select 1 from public.store_memberships where store_id=s and user_id=auth.uid() and status='active')$$;
create function private.can_manage_store(s uuid) returns boolean language sql as $$select exists(select 1 from public.store_memberships where store_id=s and user_id=auth.uid() and role='owner' and status='active')$$;
grant usage on schema auth,private to authenticated;
create table public.fixed_expenses(id uuid primary key default gen_random_uuid(),store_id uuid,month_key text,name text,amount integer,cost_template_id uuid);
create unique index fixed_template_unique on public.fixed_expenses(store_id,month_key,cost_template_id) where cost_template_id is not null;
create table public.recurring_cost_templates(id uuid,store_id uuid,name text,amount integer,mode text,active boolean,start_month text);
grant select,insert,update,delete on public.fixed_expenses to authenticated;`);
const gate=readFileSync(new URL('../supabase/migrations/20261014035157_store_billing_write_gate.sql',import.meta.url),'utf8');
await db.exec(gate.slice(0,gate.indexOf('-- First rollout covers'))+'commit;');
await db.exec(`create trigger manee_billing_write_gate before insert or update or delete on public.fixed_expenses
for each row execute function private.manee_guard_billed_write();
create function private.assert_cost_access(s uuid,m text) returns void language plpgsql security definer set search_path='' as $$begin
 if auth.uid() is null or not private.can_manage_store(s) then raise exception 'Cost access denied' using errcode='42501';end if;
 if m is null or m !~ '^\\d{4}-(0[1-9]|1[0-2])$' then raise exception 'Invalid month' using errcode='22023';end if;
end$$;
insert into auth.users(id) values('${owner}'),('${outsider}');
insert into public.profiles(user_id,status) values('${owner}','active'),('${outsider}','active');
insert into public.stores(id) values('${store}'),('${other}');
insert into public.store_memberships(user_id,store_id,role,status) values('${owner}','${store}','owner','active'),('${owner}','${other}','owner','active');`);
await db.exec(readFileSync(new URL('../supabase/migrations/20261015112000_fixed_cost_read_billing_gate.sql',import.meta.url),'utf8'));
const {rows:[{current,previous}]}=await db.query(`select to_char(now() at time zone 'Asia/Seoul','YYYY-MM') current,
 to_char((now() at time zone 'Asia/Seoul')-interval '1 month','YYYY-MM') previous`);
async function as(user){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);await db.exec('set role authenticated');}
async function admin(){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub','',false)");}
const prepare=s=>db.query('select private.manee_prepare_fixed_costs($1,$2)',[s,current]);
const rows=s=>db.query('select name from public.fixed_expenses where store_id=$1 and month_key=$2 order by name',[s,current]);

test('expired enrollment leaves existing fixed costs readable and skips both automatic write paths',async()=>{
 await admin();
 await db.query('insert into private.store_billing_enforcement(store_id,environment) values($1,$2)',[store,'Production']);
 await db.query('insert into public.fixed_expenses(store_id,month_key,name,amount) values($1,$2,$3,1),($1,$4,$5,2)',[store,previous,'prior',current,'saved']);
 await db.query('insert into public.recurring_cost_templates values($1,$2,$3,3,$4,true,$5)',[template,store,'template','fixed',previous]);
 await as(owner);await prepare(store);
 assert.deepEqual((await rows(store)).rows.map(r=>r.name),['saved']);
 await assert.rejects(()=>db.query('insert into public.fixed_expenses(store_id,month_key,name,amount) values($1,$2,$3,1)',[store,current,'blocked']),e=>e.code==='P4402');
 await as(outsider);await assert.rejects(()=>prepare(store),e=>e.code==='42501');
});
test('current verified entitlement restores carry-forward for the enrolled store',async()=>{
 await admin();await db.query(`insert into private.android_billing_purchases values($1,$2,'Production','SUBSCRIPTION_STATE_ACTIVE',now()+interval '1 day',now(),null)`,[owner,store]);
 await db.query('delete from public.fixed_expenses where store_id=$1 and month_key=$2',[store,current]);
 await as(owner);await prepare(store);await prepare(store);
 assert.deepEqual((await rows(store)).rows.map(r=>r.name),['prior','template']);
});
test('unenrolled other store retains automatic carry-forward without a receipt',async()=>{
 await admin();await db.query('insert into public.fixed_expenses(store_id,month_key,name,amount) values($1,$2,$3,4)',[other,previous,'other cost']);
 await as(owner);await prepare(other);
 assert.deepEqual((await rows(other)).rows.map(r=>r.name),['other cost']);
});
