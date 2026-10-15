import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

const sql=readFileSync(new URL('../security/account-deletion-preflight.sql',import.meta.url),'utf8');
const db=new PGlite();after(()=>db.close());
const id=n=>'10000000-0000-4000-8000-'+String(n).padStart(12,'0');
const person=id(1),other=id(2),crew=id(3),otherCrew=id(4),store=id(5);
await db.exec(`create schema auth;create schema private;create schema storage;
create table auth.users(id uuid primary key);
create table auth.sessions(id uuid primary key,user_id uuid references auth.users on delete cascade);
create table public.profiles(user_id uuid primary key references auth.users on delete cascade,username text);
create table public.stores(id uuid primary key,archived_at timestamptz,owner_username text);
create table public.crew(id uuid primary key,name text,phone text);
create table public.store_memberships(user_id uuid references auth.users on delete cascade,store_id uuid,role text,status text,crew_id uuid);
create table public.attendance(id uuid primary key,crew_id uuid references public.crew on delete cascade);
create table public.push_subscriptions(user_id uuid references auth.users,crew_id uuid);
create table private.profile_prior_values(user_id uuid,crew_id uuid,old_value text);
create table private.staff_link_requests(requester_user_id uuid,reviewed_by uuid,crew_id uuid);
create table private.account_deletion_requests(username text,contact text);
create table storage.objects(owner uuid,owner_id text,name text);
create table storage.buckets(owner uuid,owner_id text);
insert into auth.users values('${person}'),('${other}');
insert into auth.sessions values('${person}','${person}');
insert into public.profiles values('${person}','synthetic_subject'),('${other}','synthetic_other');
insert into public.stores values('${store}',null,'synthetic_subject');
insert into public.crew values('${crew}','PRIVATE NAME','PRIVATE PHONE'),('${otherCrew}','OTHER PRIVATE NAME','OTHER PRIVATE PHONE');
insert into public.store_memberships values('${person}','${store}','owner','active','${crew}'),('${other}','${store}','owner','active','${otherCrew}');
insert into public.attendance values('${crew}','${crew}'),('${otherCrew}','${otherCrew}');
insert into public.push_subscriptions values('${person}','${crew}');
insert into private.profile_prior_values values('${person}','${crew}','PRIVATE OLD PHONE');
insert into private.staff_link_requests values('${other}','${person}','${otherCrew}');
insert into private.account_deletion_requests values('synthetic_subject','PRIVATE RETURN CONTACT');
insert into storage.objects values('${person}',null,'PRIVATE FILE'),(null,'${person}','PRIVATE FILE 2');
insert into storage.buckets values(null,'${person}');`);

const quote=v=>String(v).replaceAll("'","''");
async function inventory({subject='',username='',crews=[]}={}){
 const query=sql.replace("set local manee.deletion_subject='';",`set local manee.deletion_subject='${quote(subject)}';`)
  .replace("set local manee.deletion_username='';",`set local manee.deletion_username='${quote(username)}';`)
  .replace("set local manee.deletion_crew_ids='[]';",`set local manee.deletion_crew_ids='${quote(JSON.stringify(crews))}';`);
 try{
  const results=await db.exec(query);
  return results.find(r=>r.rows?.[0]?.deletion_preflight)?.rows[0].deletion_preflight;
 }catch(error){await db.exec('rollback');throw error;}
}
const row=(report,key,table,column)=>report[key].find(r=>r.table===table&&r.column===column)?.rows;
async function snapshot(){return (await db.query(`select jsonb_build_object(
 'crew',(select jsonb_agg(to_jsonb(c) order by id) from public.crew c),
 'attendance',(select jsonb_agg(to_jsonb(a) order by id) from public.attendance a),
 'profile',(select jsonb_agg(to_jsonb(p) order by user_id) from public.profiles p),
 'prior',(select jsonb_agg(to_jsonb(p)) from private.profile_prior_values p),
 'storage',(select jsonb_agg(to_jsonb(o) order by name) from storage.objects o)) as value`)).rows[0].value;}

test('default mode inventories constraints without scanning customer rows or emitting private values',async()=>{
 const report=await inventory();
 assert.equal(report.mode,'schema_only');assert.equal(report.auth_user_exists,null);
 assert.deepEqual(report.user_references,[]);assert.deepEqual(report.crew_references,[]);
 assert.ok(report.foreign_keys.some(r=>r.table==='public.push_subscriptions'&&!r.definition.includes('CASCADE')));
 assert.ok(!JSON.stringify(report).includes('PRIVATE'));
});
test('selected subject includes no-FK historical copies and linked crew business records without changing them',async()=>{
 const before=await snapshot(),report=await inventory({subject:person});
 assert.equal(report.auth_user_exists,true);assert.equal(report.sessions,1);
 assert.equal(row(report,'user_references','private.profile_prior_values','user_id'),1);
 assert.equal(row(report,'crew_references','public.crew','id'),1);
 assert.equal(row(report,'crew_references','public.attendance','crew_id'),1);
 assert.equal(row(report,'username_references','private.account_deletion_requests','username'),1);
 assert.deepEqual(await snapshot(),before);assert.ok(!JSON.stringify(report).includes('PRIVATE'));
});
test('reviewing another employee does not make that employee an erasure target',async()=>{
 const report=await inventory({subject:person});
 assert.equal(row(report,'user_references','private.staff_link_requests','reviewed_by'),1);
 assert.deepEqual(report.linked_crew_ids,[crew]);
 assert.equal(report.owned_store_review[0].other_active_owners,1);
 assert.equal(report.owned_store_review[0].other_active_members,1);
});
test('storage inventory includes legacy and current ownership without returning object paths',async()=>{
 const report=await inventory({subject:person});
 assert.equal(row(report,'storage_owner_references','storage.objects','owner'),1);
 assert.equal(row(report,'storage_owner_references','storage.objects','owner_id'),1);
 assert.equal(row(report,'storage_owner_references','storage.buckets','owner_id'),1);
 assert.ok(!JSON.stringify(report).includes('PRIVATE FILE'));
});
test('inputs require a subject and reject wrong username or malformed UUIDs',async()=>{
 await assert.rejects(()=>inventory({username:'synthetic_subject'}),/verified subject/);
 await assert.rejects(()=>inventory({subject:person,username:'synthetic_other'}),/does not match/);
 await assert.rejects(()=>inventory({subject:'not-a-uuid'}),e=>e.code==='22P02');
 await assert.rejects(()=>inventory({subject:person,crews:['bad-id']}),e=>e.code==='22P02');
});
test('database enforces read-only even if a mutation is accidentally added to the operator script',async()=>{
 const injected=sql.replace('select current_setting(\'manee.deletion_report\')',"delete from public.crew;select current_setting('manee.deletion_report')");
 try{await assert.rejects(()=>db.exec(injected),e=>e.code==='25006');}
 finally{await db.exec('rollback');}
 assert.equal((await db.query('select count(*)::int as n from public.crew')).rows[0].n,2);
});
test('post-erasure inventory still locates residual copies using the private preflight identifiers',async()=>{
 await assert.rejects(()=>db.query('delete from auth.users where id=$1',[person]),e=>e.code==='23503');
 await db.query('delete from public.push_subscriptions where user_id=$1',[person]);
 await db.query('delete from auth.users where id=$1',[person]);
 const report=await inventory({subject:person,username:'synthetic_subject',crews:[crew]});
 assert.equal(report.auth_user_exists,false);assert.equal(report.sessions,0);
 assert.equal(row(report,'user_references','private.profile_prior_values','user_id'),1);
 assert.equal(row(report,'crew_references','public.crew','id'),1);
 assert.equal(row(report,'crew_references','public.attendance','crew_id'),1);
 assert.equal(row(report,'username_references','public.stores','owner_username'),1);
});
