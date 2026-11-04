import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const snapshot=JSON.parse(readFileSync(new URL('../security/fixtures/production-session-guards.json',import.meta.url),'utf8'));
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
test('exact production membership functions preserve all roles, revoke sessions, and restore byte-exactly',async()=>{
 const db=new PGlite();
 try {
 await db.exec(`create role authenticated;create role anon;create schema auth;create schema private;
 create function auth.uid() returns uuid language sql as $$select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid$$;
 create function auth.jwt() returns jsonb language sql as $$select nullif(current_setting('request.jwt.claims',true),'')::jsonb$$;
 create table auth.sessions(id uuid,user_id uuid,not_after timestamptz);
 create table public.profiles(user_id uuid,status text);
 create table public.stores(id uuid,archived_at timestamptz);
 create table public.crew(id uuid,store_id uuid,is_manager boolean,resign_date date,name text);
 create table public.store_memberships(user_id uuid,store_id uuid,crew_id uuid,role text,status text);
 create table public.platform_admins(user_id uuid,status text,role text);
 grant usage on schema public,private,auth to authenticated;
 grant select on public.crew to authenticated;alter table public.crew enable row level security;`);
 for(const name of ['is_live_manee_session','has_platform_role','has_store_membership','can_manage_store'])await db.exec(snapshot.functions.find(f=>f.name===name).definition);
 for(const p of snapshot.policies.filter(p=>p.tablename==='crew'))await db.exec(`create policy "${p.policyname}" on public.crew as ${p.permissive} for ${p.cmd} to authenticated ${p.qual?'using ('+p.qual+')':''} ${p.with_check?'with check ('+p.with_check+')':''}`);
 const u=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),store=u(100),other=u(101);
 await db.exec(`insert into public.stores values('${store}',null),('${other}',null)`);
 const roles=['owner','manager','staff','promoted','retired','revoked','admin'];
 for(let i=0;i<roles.length;i++){
 const uid=u(i+1),sid=u(i+21),cid=u(i+41),role=roles[i];
 await db.exec(`insert into public.profiles values('${uid}','active');insert into auth.sessions values('${sid}','${uid}',null);
 insert into public.crew values('${cid}','${store}',${role==='promoted'},${role==='retired'?"'2020-01-01'":"null"},'fixture');
 insert into public.store_memberships values('${uid}','${store}',${role==='owner'?'null':"'"+cid+"'"},'${['promoted','retired','revoked'].includes(role)?'staff':role}','${role==='revoked'?'revoked':'active'}');`);
 if(role==='admin')await db.exec(`insert into public.platform_admins values('${uid}','active','admin')`);
 }
 const check=async()=>{const out=[];for(let i=0;i<roles.length;i++){
 await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:u(i+1),session_id:u(i+21),role:'authenticated'})]);
 const value=(await db.query('select private.has_store_membership($1) own,private.has_store_membership($2) other,private.has_store_membership($1,array[\'owner\',\'manager\']) manage,private.has_platform_role(array[\'admin\']) admin',[store,other])).rows[0];
 await db.exec('set role authenticated');value.crew=(await db.query('select count(*)::int n from public.crew')).rows[0].n;await db.exec('reset role');out.push(value);
 }return out;};
 const before=await check();
 await db.exec('BEGIN;'+read('../security/reviewed-session-guards.sql')+'COMMIT;');
 assert.deepEqual(await check(),before,'live owner, manager, staff, promoted manager, retired/revoked and admin semantics unchanged');
 await db.exec(`delete from auth.sessions where user_id='${u(1)}'`);
 const revoked=await check();assert.equal(revoked[0].own,false);assert.equal(revoked[0].crew,0);
 assert.equal(revoked[1].own,true);assert.equal(revoked[2].own,true);assert.equal(revoked[3].manage,true);assert.equal(revoked[4].own,false);assert.equal(revoked[5].own,false);
 await db.exec(read('../security/reviewed-session-guards-rollback.sql'));
 assert.deepEqual(await check(),before,'rollback restores exact previous behavior');
 for(const name of ['has_store_membership','has_platform_role'])assert.equal((await db.query('select pg_get_functiondef(oid) d from pg_proc where proname=$1',[name])).rows[0].d,snapshot.functions.find(f=>f.name===name).definition);
 await db.exec('BEGIN;'+read('../security/reviewed-session-guards.sql')+'COMMIT;');
 assert.equal((await check())[0].own,false,'reapply restores protection');
 }finally{await db.close();}
});
