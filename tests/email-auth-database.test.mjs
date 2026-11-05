import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();
await db.exec(`create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;
create schema auth;create schema private;
create table auth.users(id uuid primary key,banned_until timestamptz);
create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id) on delete cascade,not_after timestamptz);
create table public.profiles(user_id uuid primary key references auth.users(id) on delete cascade,username text,status text default 'active');
grant usage on schema auth,private to anon,authenticated,service_role;
grant select,insert,update on public.profiles to authenticated;`);
await db.exec(fs.readFileSync(new URL('../supabase/migrations/20261105155839_manee_email_verification.sql',import.meta.url),'utf8'));
after(()=>db.close());
let seq=0;
const uuid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
async function fixture(){const id=uuid(++seq);await db.exec('reset role');await db.query('insert into auth.users(id) values($1)',[id]);await db.query('insert into public.profiles(user_id,username) values($1,$2)',[id,'tester'+seq]);await db.query('insert into auth.sessions(id,user_id) values($1,$1)',[id]);return id;}
async function service(action,payload={}){await db.exec('reset role;set role service_role');return(await db.query('select public.manee_email_service($1,$2) as result',[action,payload])).rows[0].result;}
async function age(uid){await db.exec('reset role');await db.query("update private.manee_email_accounts set last_requested_at=now()-interval '61 seconds' where user_id=$1",[uid]);}
async function issue(uid,email,kh='a'.repeat(64)){const r=await service('prepare',{user_id:uid,session_id:uid,email,token_hash:kh});assert.equal(r.ok,true);await service('sent',{challenge_id:r.challenge_id});return r;}

test('email records and service RPC are not callable or writable by clients',async()=>{
 const uid=await fixture();await db.exec('reset role;set role authenticated');
 await assert.rejects(()=>db.query('select public.manee_email_service($1,$2)',['check',{email:'someone@example.com'}]),/permission denied/);
 await assert.rejects(()=>db.exec('select * from private.manee_email_accounts'),/permission denied/);
 await assert.rejects(()=>db.query("update public.profiles set recovery_email='forged@example.com',recovery_email_verified_at=now() where user_id=$1",[uid]),/server managed/);
 await db.query("update public.profiles set username='changed' where user_id=$1",[uid]);
});
test('normalized duplicate registration is blocked before profile bootstrap and cleanup cascades',async()=>{
 const u=await fixture(),v=await fixture();
 assert.equal((await service('register',{user_id:u,email:' FIRST@Example.COM '})).ok,true);
 assert.equal((await service('check',{email:'first@example.com'})).available,false);
 assert.equal((await service('check',{email:'first@example.com',user_id:u})).available,true);
 assert.equal((await service('register',{user_id:v,email:'first@example.com'})).error,'email_taken');
 await db.exec('reset role');await db.query('delete from auth.users where id=$1',[u]);
 assert.equal((await service('check',{email:'first@example.com'})).available,true);
});
test('verification requires sent unexpired token and updates authoritative plus member email atomically',async()=>{
 const u=await fixture(),kh='b'.repeat(64);
 await service('register',{user_id:u,email:'typo@example.com'});
 const r=await service('prepare',{user_id:u,session_id:u,email:'right@example.com',token_hash:kh});
 assert.equal((await service('status',{user_id:u,session_id:u})).email,null);
 assert.equal((await service('verify',{token_hash:kh})).error,'invalid_link');
 await service('sent',{challenge_id:r.challenge_id});
 assert.equal((await service('verify',{token_hash:kh})).ok,true);
 const s=await service('status',{user_id:u,session_id:u});assert.equal(s.email,'right@example.com');assert.equal(s.pending_email,null);assert.equal(s.email_verified,true);
 await db.exec('reset role');const p=(await db.query('select recovery_email,recovery_email_verified_at from public.profiles where user_id=$1',[u])).rows[0];assert.equal(p.recovery_email,s.email);assert.ok(p.recovery_email_verified_at);
 assert.equal((await service('verify',{token_hash:kh})).error,'invalid_link');
});
test('editing a verified address preserves prior recovery until replacement verification',async()=>{
 const u=await fixture();await issue(u,'old@example.com','c'.repeat(64));await service('verify',{token_hash:'c'.repeat(64)});await age(u);
 await issue(u,'new@example.com','d'.repeat(64));let s=await service('status',{user_id:u,session_id:u});assert.equal(s.email,'old@example.com');assert.equal(s.pending_email,'new@example.com');
 await service('verify',{token_hash:'d'.repeat(64)});s=await service('status',{user_id:u,session_id:u});assert.equal(s.email,'new@example.com');
 assert.equal((await service('check',{email:'old@example.com'})).available,true);
});
test('resend invalidates prior link and request throttle is server enforced',async()=>{
 const u=await fixture();await issue(u,'resend@example.com','e'.repeat(64));
 assert.equal((await service('prepare',{user_id:u,session_id:u,email:'changed@example.com',token_hash:'f'.repeat(64)})).error,'rate_limited');
 await age(u);await issue(u,'resend@example.com','f'.repeat(64));assert.equal((await service('verify',{token_hash:'e'.repeat(64)})).error,'invalid_link');assert.equal((await service('verify',{token_hash:'f'.repeat(64)})).ok,true);
});
test('returning to the verified address cancels an outstanding replacement link',async()=>{
 const u=await fixture();await issue(u,'kept@example.com','a1'.repeat(32));await service('verify',{token_hash:'a1'.repeat(32)});await age(u);await issue(u,'cancelled@example.com','b1'.repeat(32));await age(u);
 const same=await service('prepare',{user_id:u,session_id:u,email:'kept@example.com',token_hash:'c1'.repeat(32)});assert.equal(same.already_verified,true);
 assert.equal((await service('status',{user_id:u,session_id:u})).pending_email,null);assert.equal((await service('verify',{token_hash:'b1'.repeat(32)})).error,'invalid_link');assert.equal((await service('check',{email:'cancelled@example.com'})).available,true);
});
test('expired, failed-delivery, banned and non-live-session challenges fail closed',async()=>{
 const u=await fixture();const r=await issue(u,'expire@example.com','1'.repeat(64));
 await db.exec('reset role');await db.query("update private.manee_email_challenges set expires_at=now()-interval '1 second' where id=$1",[r.challenge_id]);assert.equal((await service('verify',{token_hash:'1'.repeat(64)})).error,'invalid_link');
 await age(u);const r2=await service('prepare',{user_id:u,session_id:u,email:'expire@example.com',token_hash:'2'.repeat(64)});await service('delivery_failed',{challenge_id:r2.challenge_id});assert.equal((await service('verify',{token_hash:'2'.repeat(64)})).error,'invalid_link');
 await age(u);await issue(u,'banned@example.com','b2'.repeat(32));await db.exec('reset role');await db.query("update auth.users set banned_until=now()+interval '1 day' where id=$1",[u]);
 assert.equal((await service('verify',{token_hash:'b2'.repeat(32)})).error,'invalid_link');assert.equal((await service('recover_prepare',{email:'banned@example.com',token_hash:'b3'.repeat(32)})).deliver,false);
 await db.exec('reset role');await db.query('update auth.users set banned_until=null where id=$1',[u]);
 await db.exec('reset role');await db.query('delete from auth.sessions where user_id=$1',[u]);assert.equal((await service('status',{user_id:u,session_id:u})).error,'invalid_session');
 assert.equal((await service('prepare',{user_id:u,session_id:u,email:'other@example.com',token_hash:'3'.repeat(64)})).error,'invalid_session');
});
test('recovery sends only to a verified address; consume is single-use and completion revokes sessions',async()=>{
 const u=await fixture();await service('register',{user_id:u,email:'recover@example.com'});
 assert.equal((await service('recover_prepare',{email:'recover@example.com',token_hash:'4'.repeat(64)})).deliver,false);
 await issue(u,'recover@example.com','5'.repeat(64));await service('verify',{token_hash:'5'.repeat(64)});
 const r=await service('recover_prepare',{email:'recover@example.com',token_hash:'6'.repeat(64)});assert.equal(r.deliver,true);await service('sent',{challenge_id:r.challenge_id});
 const preview=await service('recover_preview',{token_hash:'6'.repeat(64)});assert.ok(preview.username);
 assert.equal((await service('verify',{token_hash:'6'.repeat(64)})).error,'invalid_link');
 const consumed=await service('recover_consume',{token_hash:'6'.repeat(64)});assert.equal(consumed.user_id,u);assert.equal((await service('recover_consume',{token_hash:'6'.repeat(64)})).error,'invalid_link');
 assert.equal((await service('recover_complete',consumed)).ok,true);assert.equal((await service('status',{user_id:u,session_id:u})).error,'invalid_session');
});
test('address replacement invalidates recovery links addressed to the former email',async()=>{
 const u=await fixture();await issue(u,'before@example.com','7'.repeat(64));await service('verify',{token_hash:'7'.repeat(64)});
 const r=await service('recover_prepare',{email:'before@example.com',token_hash:'8'.repeat(64)});await service('sent',{challenge_id:r.challenge_id});
 await age(u);await issue(u,'after@example.com','9'.repeat(64));await service('verify',{token_hash:'9'.repeat(64)});assert.equal((await service('recover_preview',{token_hash:'8'.repeat(64)})).error,'invalid_link');
});
test('invalid addresses are rejected and stale challenge cleanup is bounded and callable service-only',async()=>{
 for(const email of ['bad','a..b@example.com','.start@example.com','end.@example.com','a'.repeat(65)+'@example.com'])assert.equal((await service('check',{email})).error,'invalid_email');
 const u=await fixture();const r=await issue(u,'prune@example.com','0'.repeat(64));await db.exec('reset role');await db.query("update private.manee_email_challenges set expires_at=now()-interval '8 days' where id=$1",[r.challenge_id]);await service('prune');await db.exec('reset role');assert.equal((await db.query('select count(*)::int as n from private.manee_email_challenges where id=$1',[r.challenge_id])).rows[0].n,0);
});
