import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();after(()=>db.close());
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),owner=id(1),manager=id(2),staff=id(3),other=id(4),store=id(10),foreign=id(11),crew=id(20),att=id(30),install=id(40);
await db.exec(`create role anon;create role authenticated;create role service_role;
create schema auth;create schema private;create schema vault;
create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('role','authenticated')$$;
create function auth.role() returns text language sql stable as $$select 'authenticated'::text$$;
create table public.profiles(user_id uuid primary key references auth.users,username text,display_name text,status text default 'active');
create table public.stores(id uuid primary key,name text);
create table public.crew(id uuid primary key,store_id uuid references public.stores,name text,position text default '홀',wage integer default 12000,wage_type text default 'hourly',tax33 boolean default false,insurance4 boolean default false,insurance2 boolean default false,weekly_allowance boolean default false,probation boolean default false,hire_date date,resign_date date,is_manager boolean default false,employment_setup_required boolean default false);
create table public.store_memberships(user_id uuid,store_id uuid,role text,status text default 'active',crew_id uuid);
create table public.attendance(id uuid primary key default gen_random_uuid(),store_id uuid references public.stores,crew_id uuid references public.crew,date date,check_in time,check_out time,confirmed boolean default false,staff_confirmed boolean default false);
create table public.monthly_net_payroll(id uuid primary key default gen_random_uuid(),store_id uuid references public.stores,crew_id uuid references public.crew,month_key text,net_pay integer,paid_on date,adjustment_snapshot jsonb default '[]',confirmed_by uuid,updated_at timestamptz default now(),unique(store_id,crew_id,month_key));
create table public.crew_pay_adjustments(id uuid primary key default gen_random_uuid(),store_id uuid,crew_id uuid,month_key text,type text,amount integer,note text,unpaid_date date,adjustment_date date,created_at timestamptz default now());
create table private.manee_manager_permissions(crew_id uuid,store_id uuid,enabled boolean,permissions jsonb,revision bigint);
create table public.monthly_cost_reviews(store_id uuid,month_key text,completed_at timestamptz,remind_after date);
create table public.reservations(id uuid,store_id uuid,date date,time text,status text);
create table public.monthly_report_closings(id uuid,store_id uuid,month_key text,revision bigint,closed_at timestamptz);
create table public.sales_reports(store_id uuid,total_sales integer,discount integer,refund integer,date date);
create table public.expense_entries(store_id uuid,amount integer,category text,date date);
create table public.manee_mobile_update_policy(platform text primary key,available_version text,available_build text);
insert into public.manee_mobile_update_policy values('android','0','0'),('ios','0','0');
create table vault.decrypted_secrets(name text,decrypted_secret text);
create function private.is_live_manee_session() returns boolean language sql stable as $$select auth.uid() is not null and coalesce(current_setting('test.live',true),'yes')<>'no'$$;
create function private.has_store_membership(s uuid,roles text[] default null) returns boolean language sql stable as $$select exists(select 1 from public.store_memberships m where m.store_id=s and m.user_id=auth.uid() and m.status='active' and (roles is null or m.role=any(roles)))$$;
create function private.has_platform_role(roles text[]) returns boolean language sql stable as $$select current_setting('test.hq',true)='yes'$$;
create function private.manee_manager_cap(s uuid,cap text) returns boolean language sql stable as $$select private.is_live_manee_session() and private.has_store_membership(s,array['manager']) and coalesce(current_setting('test.cap',true),'all') in ('all',cap)$$;
create function private.current_crew_id(s uuid) returns uuid language sql stable as $$select crew_id from public.store_memberships where store_id=s and user_id=auth.uid() limit 1$$;
create function private.manee_store_write_entitled(s uuid) returns boolean language sql stable as $$select coalesce(current_setting('test.entitled',true),'yes')<>'no'$$;
create function private.manee_manager_normalize(p jsonb) returns jsonb language sql as $$select p$$;
create function private.manee_android_push_targets(s uuid) returns table(token text) language sql as $$select 'synthetic-android'::text$$;
create function private.manee_ios_push_targets(s uuid) returns table(token text) language sql as $$select 'synthetic-ios'::text$$;
create table private.android_push_deliveries(id uuid primary key default gen_random_uuid(),event_key text,source_id text,kind text constraint android_push_deliveries_kind_check check(kind in ('attendance_in')),store_id uuid,token text,expires_at timestamptz,status text default 'pending',attempts integer default 0,available_at timestamptz default now(),lease_id uuid,lease_until timestamptz,finished_at timestamptz,unique(event_key,token));
create table private.ios_push_deliveries(like private.android_push_deliveries including defaults including indexes);
alter table private.ios_push_deliveries add constraint ios_push_deliveries_kind_check check(kind in ('attendance_in'));
`);
// Baseline function is retained in the committed migration before v2; no external DB is used.
const migration=fs.readFileSync(new URL('../supabase/migrations/20261126062207_manager_work_and_device_versions.sql',import.meta.url),'utf8');
await db.exec(migration);
await db.exec(fs.readFileSync(new URL('../supabase/migrations/20261126093000_manager_confirmation_retry.sql',import.meta.url),'utf8'));
await db.exec(`create trigger guard_net before insert or update on public.monthly_net_payroll for each row execute function private.guard_monthly_net_payroll();
insert into auth.users values('${owner}'),('${manager}'),('${staff}'),('${other}');
insert into public.profiles(user_id,username,display_name) select id,'user'||row_number() over(),'Synthetic' from auth.users;
insert into public.stores values('${store}','Synthetic'),('${foreign}','Foreign');
insert into public.crew(id,store_id,name) values('${crew}','${store}','Worker');
insert into public.store_memberships(user_id,store_id,role,crew_id) values('${owner}','${store}','owner',null),('${manager}','${store}','manager',null),('${staff}','${store}','staff','${crew}'),('${other}','${foreign}','manager',null);
insert into public.attendance(id,store_id,crew_id,date,check_in,check_out) values('${att}','${store}','${crew}',current_date,'18:12:14','23:47:31');
insert into public.monthly_net_payroll(store_id,crew_id,month_key,net_pay) values('${store}','${crew}',to_char(current_date,'YYYY-MM'),50000);`);
async function actor(user,cap='all'){await db.query("select set_config('test.uid',$1,false),set_config('test.cap',$2,false),set_config('test.live','yes',false),set_config('test.hq','no',false)",[user,cap]);}
async function record(){return (await db.query('select * from public.attendance where id=$1',[att])).rows[0];}
const previous=a=>Object.fromEntries(['check_in','check_out','confirmed','pay_check_in','pay_check_out'].map(k=>[k,a[k]]));
async function confirm(start,end,old){return db.query("select public.manee_manager_work($1,current_date,'confirm',$2,$3,$4,$5)",[store,att,start,end,old||previous(await record())]);}
test('manager sales writer reads only its store, rejects staff, foreign store and off-grid times',async()=>{
 await actor(staff);await assert.rejects(()=>db.query('select public.manee_manager_work($1,current_date)',[store]),/권한/);
 await actor(other);await assert.rejects(()=>db.query('select public.manee_manager_work($1,current_date)',[store]),/권한/);
 await actor(manager,'wage');await assert.rejects(()=>confirm('18:00','23:30'),/권한/);
 await actor(manager,'salesWrite');for(const [a,b] of [['18:12','23:30'],['18:00','23:31'],['18:00','18:00']])await assert.rejects(()=>confirm(a,b),/30분/);
 assert.equal((await record()).confirmed,false);
});
test('half-hour confirmation preserves raw seconds, invalidates settled pay and sends exactly one owner event',async()=>{
 await actor(manager,'salesWrite');const old=previous(await record());await confirm('18:30','23:30',old);const a=await record();assert.equal(a.check_in,'18:12:14');assert.equal(a.check_out,'23:47:31');assert.equal(a.pay_check_in,'18:30:00');assert.equal(a.pay_confirmed_by,manager);
 const p=(await db.query('select * from public.monthly_net_payroll')).rows[0];assert.equal(p.needs_reconfirmation,true);assert.notDeepEqual(p.adjustment_snapshot,[]);
 assert.equal((await db.query('select count(*) n from private.manee_owner_activity')).rows[0].n,1);assert.equal((await db.query('select count(*) n from private.android_push_deliveries')).rows[0].n,1);
 const duplicate=await confirm('18:30','23:30');assert.ok(Array.isArray(duplicate.rows[0].manee_manager_work));assert.equal((await db.query('select count(*) n from private.manee_owner_activity')).rows[0].n,1);
 await assert.rejects(()=>confirm('19:00','23:30',old),/변경/);
 const total=(await db.query("select private.net_payroll_totals($1,to_char(current_date,'YYYY-MM'),current_date) result",[store])).rows[0].result;assert.equal(total.unknown_count,1);
});
test('reconfirm payroll restores total, edits use approved hours and deductions with actor audit',async()=>{
 await actor(manager);await db.exec('update public.monthly_net_payroll set net_pay=50000');assert.equal((await db.query('select needs_reconfirmation from public.monthly_net_payroll')).rows[0].needs_reconfirmation,false);
 await db.exec('delete from public.monthly_net_payroll');const total=(await db.query("select private.net_payroll_totals($1,to_char(current_date,'YYYY-MM'),current_date) result",[store])).rows[0].result;assert.equal(total.net_pay,60000);
 const c=(await db.query('select * from public.crew')).rows[0],old=Object.fromEntries(['wage','wage_type','tax33','insurance4','insurance2','weekly_allowance','probation'].map(k=>[k,c[k]])),payload={...old,wage:13000,tax33:true};
 await db.query("select public.manee_manager_write_v2($1,to_char(current_date,'YYYY-MM'),'wage',$2,$3,$4)",[store,crew,payload,old]);assert.equal((await db.query('select wage from public.crew')).rows[0].wage,13000);const message=(await db.query("select message from private.manee_owner_activity where kind='pay_change' order by created_at desc limit 1")).rows[0].message;assert.match(message,/시급 12,000원 → 13,000원/);assert.match(message,/3.3% 원천징수 미적용 → 적용/);
 await assert.rejects(()=>db.query("select public.manee_manager_write_v2($1,to_char(current_date,'YYYY-MM'),'wage',$2,$3,$4)",[store,crew,payload,old]),/변경/);
 await actor(staff);await assert.rejects(()=>db.query('select public.manee_owner_activity_read($1)',[store]),/사장님/);await actor(owner);assert.ok((await db.query('select public.manee_owner_activity_read($1) r',[store])).rows[0].r.length>=2);
});
test('raw correction revokes approval, old direct confirmation cannot bypass half-hour selection',async()=>{
 await actor(owner);await db.exec("update public.attendance set check_in='18:20' where id='"+att+"'");const a=await record();assert.equal(a.confirmed,false);assert.equal(a.pay_check_in,null);await assert.rejects(()=>db.exec('update public.attendance set confirmed=true'),/30분/);
});
test('version report binds auth identity; HQ-only read, multiple devices and last seen are preserved',async()=>{
 await actor(staff);await db.query("select public.manee_report_client_version($1,'android','1.63','64')",[install]);await db.query("select public.manee_report_client_version($1,'ios','1.58','158.1.1')",[id(41)]);
 await assert.rejects(()=>db.query('select public.manee_hq_client_versions()'),/HQ/);await assert.rejects(()=>db.query("select public.manee_report_client_version($1,'web','1.2','3')",[install]),/버전/);
 await db.exec("select set_config('test.hq','yes',false)");const r=(await db.query('select public.manee_hq_client_versions() r')).rows[0].r;assert.equal(r.items.filter(x=>x.user_id===staff).length,2);assert.equal(r.items.find(x=>x.user_id===other).platform,null);
 await db.exec("select set_config('test.live','no',false)");await assert.rejects(()=>db.query("select public.manee_report_client_version($1,'ios','1.58','158.1.1')",[id(41)]),/로그인/);
});
