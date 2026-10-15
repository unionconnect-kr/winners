import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {renderDeletionRehearsal,STAGING} from '../scripts/render-deletion-staging-rehearsal.mjs';

const db=new PGlite();after(()=>db.close());
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
await db.exec(`create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;
create schema auth;create table auth.users(id uuid primary key,email text,banned_until timestamptz);
create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id) on delete cascade,
 created_at timestamptz default now(),updated_at timestamptz,not_after timestamptz);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
create function auth.role() returns text language sql stable as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;
grant usage on schema auth to anon,authenticated,service_role;`);
for(const path of ['fixtures/staging-baseline.sql','staff-auth.sql','account-recovery.sql','store-permissions.sql',
 'support-password-recovery.sql','store-staff-link-code.sql'])await db.exec(read('../security/'+path));
await db.exec(read('../supabase/migrations/20261013103655_native_android_push.sql'));
// Use the actual table DDL, without installing unrelated profile/RPC wrappers.
for(const [path,pattern] of [
 ['../security/self-profile-management.sql',/create table if not exists private\.profile_prior_values \([\s\S]*?\n\);/],
 ['../security/self-profile-management-v3.sql',/create table private\.profile_adoption\([\s\S]*?primary key \(crew_id,user_id,field\)\);/],
 ['../supabase/migrations/20261005113245_monthly_cost_reminders_report_details.sql',/create table public\.monthly_cost_reviews \([\s\S]*?\n\);/],
 ['../supabase/migrations/20261013131457_android_business_push.sql',/create table private\.android_push_deliveries \([\s\S]*?\n\);/]
]){const ddl=read(path).match(pattern)?.[0];assert.ok(ddl,'Missing real fixture DDL in '+path);await db.exec(ddl);}
await db.exec('alter table public.push_subscriptions add column user_id uuid references auth.users(id);');
await db.exec(read('../supabase/migrations/20261015123500_account_deletion_requests.sql'));

const rendered=renderDeletionRehearsal(STAGING);
async function run(sql){
 try{return (await db.exec(sql)).find(r=>r.rows?.[0]?.deletion_rehearsal)?.rows[0].deletion_rehearsal;}
 catch(error){await db.exec('rollback');throw error;}
}
async function assertEmpty(){
 for(const table of ['auth.users','auth.sessions','public.profiles','public.stores','public.crew','public.attendance',
  'public.store_memberships','private.profile_prior_values','private.account_deletion_requests']){
  assert.equal((await db.query('select count(*)::int as n from '+table)).rows[0].n,0,table+' fixture leaked');
 }
}
test('rehearsal renderer refuses Production, unspecified and unrecognized targets',()=>{
 for(const ref of [undefined,'','bhwuuxcrzxespkjlmqxr','other-project'])assert.throws(()=>renderDeletionRehearsal(ref),/restricted/);
});
test('rendered real SQL passes all nine checks and restores all synthetic rows',async()=>{
 const result=await run(rendered);
 assert.equal(result.checks_passed,9);assert.equal(result.all_fixtures_rolled_back,true);
 assert.equal(result.business_fingerprints_unchanged,true);assert.equal(result.other_employee_preserved,true);
 assert.equal(result.synthetic_case_retention_visible,true);assert.equal(result.client_authentication_tested,false);
 await assertEmpty();
});
test('rehearsal fails if personal history cleanup is accidentally omitted',async()=>{
 const omitted=rendered.replace('delete from private.profile_prior_values where user_id=subject_id and crew_id=subject_crew;','null;');
 assert.notEqual(omitted,rendered);
 await assert.rejects(()=>run(omitted),/Residual direct subject reference/);await assertEmpty();
});
test('rehearsal detects another employee attendance being removed',async()=>{
 const marker="  select jsonb_build_object('crew',(select to_jsonb(c) from public.crew c where id=keeper_crew),";
 const position=rendered.lastIndexOf(marker);assert.ok(position>0);
 const damaged=rendered.slice(0,position)+'delete from public.attendance where id=keeper_attendance;\n'+rendered.slice(position);
 await assert.rejects(()=>run(damaged),/Other employee business data changed/);await assertEmpty();
});
test('explicit synthetic push identity leaves its sequence unchanged',async()=>{
 const seq=(await db.query("select pg_get_serial_sequence('public.push_subscriptions','id') as seq")).rows[0].seq;
 assert.ok(seq);const state=async()=>(await db.query('select last_value,is_called from '+seq)).rows[0];
 const before=await state();await run(rendered);assert.deepEqual(await state(),before);await assertEmpty();
});
