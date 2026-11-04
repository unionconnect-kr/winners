import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
test('admin and franchise access require live AAL2; user metadata cannot grant it; rollback restores definitions',async()=>{
 const db=new PGlite(),u='00000000-0000-4000-8000-000000000001',sid='00000000-0000-4000-8000-000000000002',fr='00000000-0000-4000-8000-000000000003';
 try{
 await db.exec(`create role anon;create role authenticated;create schema private;create schema auth;
 create function auth.jwt() returns jsonb language sql as $$select current_setting('request.jwt.claims')::jsonb$$;
 create function auth.uid() returns uuid language sql as $$select (auth.jwt()->>'sub')::uuid$$;
 create table auth.sessions(id uuid,user_id uuid,not_after timestamptz);
 create table public.profiles(user_id uuid,status text);
 create table public.platform_admins(user_id uuid,status text,role text);
 create table public.franchise_memberships(user_id uuid,franchise_id uuid,status text,role text);
 insert into auth.sessions values('${sid}','${u}',null);insert into public.profiles values('${u}','active');
 insert into public.platform_admins values('${u}','active','admin');insert into public.franchise_memberships values('${u}','${fr}','active','admin');`);
 const snapshot=JSON.parse(read('../security/fixtures/production-session-guards.json'));
 await db.exec(snapshot.functions.find(f=>f.name==='is_live_manee_session').definition);
 for(const f of JSON.parse(read('../security/fixtures/production-admin-functions.json')))await db.exec(f.definition);
 const claims=async aal=>db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:u,session_id:sid,aal,user_metadata:{aal:'aal2',role:'super_admin'}})]);
 const permissions=async()=> (await db.query('select private.has_platform_role(array[\'admin\']) admin,private.is_platform_admin() platform,private.has_franchise_membership($1) franchise',[fr])).rows[0];
 await claims('aal1');assert.deepEqual(await permissions(),{admin:true,platform:true,franchise:true});
 await db.exec('BEGIN;'+read('../security/admin-mfa-guards.sql')+'COMMIT;');
 assert.deepEqual(await permissions(),{admin:false,platform:false,franchise:false});
 await claims('aal2');assert.deepEqual(await permissions(),{admin:true,platform:true,franchise:true});
 await db.exec('delete from auth.sessions');assert.deepEqual(await permissions(),{admin:false,platform:false,franchise:false});
 for(const r of (await db.query("select definition from private.manee_security_function_backup where change_id='admin_mfa_20261104'")).rows)await db.exec(r.definition);
 for(const f of JSON.parse(read('../security/fixtures/production-admin-functions.json')))assert.equal((await db.query('select pg_get_functiondef(oid) d from pg_proc where proname=$1',[f.proname])).rows[0].d,f.definition);
 }finally{await db.close();}
});
