import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const snapshot=JSON.parse(read('../security/fixtures/direct-read-policies.json'));
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const tables=[...new Set(snapshot.selected.map(p=>p.tablename))].sort();
async function fixture(){
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create schema private;create schema auth;
 create function auth.jwt() returns jsonb language sql as $$select nullif(current_setting('request.jwt.claims',true),'')::jsonb$$;
 create function auth.uid() returns uuid language sql as $$select (auth.jwt()->>'sub')::uuid$$;
 create table auth.sessions(id uuid,user_id uuid,aal text,not_after timestamptz);
 create table public.profiles(user_id uuid,status text);
 create table public.stores(id uuid,franchise_id uuid,archived_at timestamptz);
 create table public.crew(id uuid,store_id uuid,is_manager boolean,resign_date date);
 create table public.store_memberships(user_id uuid,store_id uuid,crew_id uuid,role text,status text);
 create table public.franchise_memberships(user_id uuid,franchise_id uuid,role text,status text);
 create table public.platform_admins(user_id uuid,role text,status text);
 create table public.hq_announcements(id uuid,target_type text,target_id uuid);
 create table public.claims(id uuid,franchise_id uuid);
 create table public.claim_messages(id uuid,claim_id uuid);
 create table public.franchise_join_requests(id uuid,franchise_id uuid);
 create table public.update_log(id uuid);
 grant usage on schema public,private,auth to authenticated,anon,service_role;
 grant select on all tables in schema public to authenticated,anon,service_role;
 insert into public.stores values('${id(200)}','${id(300)}',null),('${id(201)}','${id(301)}',null);
 insert into public.crew values('${id(202)}','${id(200)}',false,null);
 insert into public.store_memberships values('${id(1)}','${id(200)}',null,'owner','active'),('${id(2)}','${id(200)}','${id(202)}','staff','active');
 insert into public.platform_admins values('${id(4)}','admin','active');
 insert into public.hq_announcements values('${id(401)}','all',null),('${id(402)}','franchise','${id(300)}'),('${id(403)}','franchise','${id(301)}'),('${id(404)}','store','${id(200)}');
 insert into public.claims values('${id(410)}','${id(300)}'),('${id(411)}','${id(301)}');
 insert into public.claim_messages values('${id(420)}','${id(410)}'),('${id(421)}','${id(411)}');
 insert into public.franchise_join_requests values('${id(430)}','${id(300)}'),('${id(431)}','${id(301)}');
 insert into public.update_log values('${id(440)}');`);
 for(let n=1;n<=9;n++){
  await db.exec(`insert into public.profiles values('${id(n)}','${n===6?'disabled':'active'}');
   insert into auth.sessions values('${id(100+n)}','${id(n)}','${[3,4].includes(n)?'aal2':'aal1'}',${n===9?"now()-interval '1 hour'":"null"});`);
  if([3,6,7,8,9].includes(n))await db.exec(`insert into public.franchise_memberships values('${id(n)}','${id(300)}','admin','${n===8?'revoked':'active'}')`);
 }
 await db.exec(`delete from auth.sessions where user_id='${id(7)}'`);
 for(const name of ['is_live_manee_session','has_franchise_membership','has_platform_role','has_store_membership'])await db.exec(snapshot.helpers.find(h=>h.name===name).definition);
 for(const t of tables)await db.exec(`alter table public.${t} enable row level security`);
 // Reproduce the store visibility relevant to HQ audience joins without changing the tested policies.
 await db.exec(`alter table public.stores enable row level security;create policy store_read on public.stores to authenticated using(private.has_store_membership(id) or private.has_platform_role(array['admin']));`);
 for(const p of snapshot.policies)await db.exec(`create policy "${p.policyname}" on public.${p.tablename} as ${p.permissive} for ${p.cmd} to ${p.roles.join(',')} ${p.qual?'using ('+p.qual+')':''} ${p.with_check?'with check ('+p.with_check+')':''}`);
 return db;
}
async function visible(db,n,aal='aal1',extra={}){
 await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:id(n),session_id:id(100+n),role:'authenticated',aal,...extra})]);
 await db.exec('set role authenticated');
 try{const out={};for(const t of tables)out[t]=(await db.query(`select count(*)::int n from public.${t}`)).rows[0].n;return out;}
 finally{await db.exec('reset role');}
}
const apply=db=>db.exec('begin;'+read('../security/direct-read-guards.sql')+'commit;');
test('exact live policies: eight read paths require live sessions; franchise data requires AAL2; store notices and login bootstrap survive',async()=>{
 const db=await fixture();
 try{
  const beforeAal2=[];for(let n=1;n<=9;n++)beforeAal2.push(await visible(db,n,'aal2'));
  const beforeOwner=await visible(db,1),beforeStaff=await visible(db,2);
  assert.equal((await visible(db,3)).claims,1,'reproduce pre-fix AAL1 franchise access');
  assert.equal((await visible(db,7)).franchise_memberships,1,'reproduce revoked-session self-read');
  await apply(db);
  assert.deepEqual(await visible(db,1),beforeOwner);
  assert.deepEqual(await visible(db,2),beforeStaff);
  assert.equal(beforeOwner.hq_announcements,3,'global + own franchise + own store notices');
  for(let n=1;n<=5;n++)assert.deepEqual(await visible(db,n,'aal2'),beforeAal2[n-1]);
  const franchiseAal1=await visible(db,3,'aal1',{user_metadata:{aal:'aal2',role:'super_admin'}});
  for(const t of ['claims','claim_messages','franchise_join_requests','update_log'])assert.equal(franchiseAal1[t],0,t);
  assert.equal(franchiseAal1.franchise_memberships,1,'self-role bootstrap remains available');
  assert.equal(franchiseAal1.hq_announcements,1,'global announcement remains available');
  assert.equal((await visible(db,3,'aal2')).claims,1,'other franchise remains invisible');
  assert.equal((await visible(db,4,'aal1')).platform_admins,1,'admin self-role bootstrap');
  assert.equal((await visible(db,4,'aal1')).claims,0);
  assert.equal((await visible(db,4,'aal2')).claims,2);
  for(const n of [6,7,9])for(const [t,count] of Object.entries(await visible(db,n,'aal2')))assert.equal(count,0,`${n} ${t}`);
  assert.equal((await visible(db,8,'aal2')).claims,0,'revoked franchise membership');
  assert.equal((await visible(db,3,'aal2',{session_id:id(104)})).claims,0,'another user session cannot be used');
  await db.exec('set role anon');for(const t of tables)assert.equal((await db.query(`select count(*)::int n from public.${t}`)).rows[0].n,0);await db.exec('reset role');
  assert.equal((await db.query("select count(*)::int n from private.manee_security_policy_backup")).rows[0].n,8);
  assert.equal((await db.query("select has_table_privilege('authenticated','private.manee_security_policy_backup','select') ok")).rows[0].ok,false);
 }finally{await db.close();}
});
test('rollback restores the eight original expressions and drift aborts the whole change',async()=>{
 const db=await fixture();
 try{
  const original=(await db.query("select tablename,policyname,qual,permissive,roles,cmd,with_check from pg_policies where schemaname='public' order by tablename,policyname")).rows;
  await apply(db);
  await db.exec('begin;'+read('../security/direct-read-guards-rollback.sql')+'commit;');
  assert.deepEqual((await db.query("select tablename,policyname,qual,permissive,roles,cmd,with_check from pg_policies where schemaname='public' order by tablename,policyname")).rows,original);
  await db.exec("delete from private.manee_security_policy_backup;alter policy platform_admins_select_self on public.platform_admins using(false)");
  await assert.rejects(apply(db),/Policy changed since review/);await db.exec('rollback');
  assert.equal((await db.query('select count(*)::int n from private.manee_security_policy_backup')).rows[0].n,0);
 }finally{await db.close();}
});
