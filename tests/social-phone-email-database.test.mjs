import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
await db.exec(read('./fixtures/phone-account-foundation.sql'));
await db.exec(read('../security/sms-service-production-before-152.sql')+';');
await db.exec(`create function public.manee_sms_service(p_action text,p_payload jsonb) returns jsonb language sql set search_path='' as $$select private.manee_sms_service(p_action,p_payload)$$;
create table private.social_signup_consents(user_id uuid primary key,provider text,terms_version text,privacy_version text,age_14_plus_confirmed boolean);
create table public.synthetic_stores(user_id uuid primary key);
create function public.bootstrap_owner_account(u uuid,n text,d text,s text,f text) returns uuid language plpgsql as $$begin if s='fail' then raise exception 'synthetic_bootstrap_failure';end if;insert into public.synthetic_stores values(u);insert into public.profiles(user_id,username) values(u,n);return u;end;$$;
create function public.bootstrap_staff_account(u uuid,n text,d text) returns void language plpgsql as $$begin insert into public.profiles(user_id,username,status) values(u,n,case when d='inactive' then 'inactive' else 'active' end);end;$$;
create function private.manee_social_signup(p_user_id uuid,p_payload jsonb) returns jsonb language sql set search_path='' as $$select '{}'::jsonb$$;
create function public.manee_social_signup(p_user_id uuid,p_payload jsonb) returns jsonb language sql set search_path='' as $$select private.manee_social_signup(p_user_id,p_payload)$$;`);
await db.exec(read('../supabase/migrations/20261105155839_manee_email_verification.sql'));
await db.exec(read('../supabase/migrations/20261105155942_one_phone_one_account.sql'));
await db.exec(read('../supabase/migrations/20261105160822_social_phone_email_signup.sql'));
after(()=>db.close());
const id=n=>(0x15210000+n).toString(16)+'-0000-4000-8000-'+String(n).padStart(12,'0');
const uname=uid=>'s_'+uid.replaceAll('-','').slice(0,28),hash='a'.repeat(64),dest=n=>'+8210'+String(n).padStart(8,'0');
async function root(){await db.exec('reset role');}
async function fixture(n,{phone=dest(n),status='verified'}={}){
 const uid=id(n);await root();await db.query('insert into auth.users(id) values($1)',[uid]);
 await db.query("insert into auth.identities(user_id,provider) values($1,'kakao')",[uid]);
 await db.query('insert into auth.sessions(id,user_id) values($1,$1)',[uid]);
 await db.query("insert into private.manee_sms_challenges(id,purpose,username,phone_e164,phone_hash,target_user_id,session_id,proof_hash,status,proof_expires_at) values($1,'signup_social',$2,$3,$4,$5,$5,$4,$6,clock_timestamp()+interval '10 minutes')",[id(n+1000),uname(uid),phone,hash,uid,status]);
 return {uid,payload:{provider:'kakao',role:'owner',displayName:'매니 QA',storeName:'매니 QA store',ageConfirmed:true,
  termsAccepted:true,privacyAccepted:true,termsVersion:'2026-10-26',privacyVersion:'2026-10-26',recovery_email:'social'+n+'@example.com',session_id:uid,sms_challenge_id:id(n+1000),sms_proof_hash:hash}};
}
async function signup(f,overrides={}){await db.exec('reset role;set role service_role');return (await db.query('select public.manee_social_signup($1,$2) as result',[f.uid,{...f.payload,...overrides}])).rows[0].result;}
async function state(f){await root();return (await db.query(`select exists(select 1 from public.profiles where user_id=$1) as profile,exists(select 1 from private.manee_email_accounts where user_id=$1) as email,exists(select 1 from private.manee_sms_bindings where user_id=$1) as phone,(select status from private.manee_sms_challenges where id=$2) as proof`,[f.uid,f.payload.sms_challenge_id])).rows[0];}
test('social membership atomically binds verified phone, reserves email, creates profile and consent',async()=>{
 const f=await fixture(1);assert.equal((await signup(f)).ok,true);
 assert.deepEqual(await state(f),{profile:true,email:true,phone:true,proof:'completed'});
 await root();const e=(await db.query('select pending_email,email,verified_at from private.manee_email_accounts where user_id=$1',[f.uid])).rows[0];
 assert.equal(e.pending_email,f.payload.recovery_email);assert.equal(e.email,null);assert.equal(e.verified_at,null);
 assert.equal((await db.query('select age_14_plus_confirmed from private.social_signup_consents where user_id=$1',[f.uid])).rows[0].age_14_plus_confirmed,true);
 assert.equal((await signup(f,{sms_proof_hash:null,recovery_email:null,session_id:null})).alreadyRegistered,true);
});
test('new social signup cannot reuse an ordinary account phone and failed attempt rolls back email reservation',async()=>{
 const f=await fixture(2);await root();await db.query("insert into auth.users(id) values($1)",[id(902)]);
 await db.query("insert into private.manee_sms_bindings(user_id,phone_e164) values($1,$2)",[id(902),dest(2)]);
 await assert.rejects(()=>signup(f),/phone_taken/);assert.deepEqual(await state(f),{profile:false,email:false,phone:false,proof:'verified'});
});
test('duplicate email prevents social account and phone-proof consumption',async()=>{
 const first=await fixture(3);await signup(first);const second=await fixture(4);
 await assert.rejects(()=>signup(second,{recovery_email:first.payload.recovery_email}),/email_taken/);
 assert.deepEqual(await state(second),{profile:false,email:false,phone:false,proof:'verified'});
});
test('bootstrap and completion failure roll back all social signup effects and retain proof',async()=>{
 const bootstrap=await fixture(5);await assert.rejects(()=>signup(bootstrap,{storeName:'fail'}),/synthetic_bootstrap_failure/);
 assert.deepEqual(await state(bootstrap),{profile:false,email:false,phone:false,proof:'verified'});
 const complete=await fixture(6);await assert.rejects(()=>signup(complete,{role:'staff',displayName:'inactive'}),/signup_completion_failed/);
 assert.deepEqual(await state(complete),{profile:false,email:false,phone:false,proof:'verified'});
});
test('social proof cannot cross authenticated users or sessions and expired sessions fail closed',async()=>{
 const a=await fixture(7),b=await fixture(8);
 await assert.rejects(()=>signup(b,{sms_challenge_id:a.payload.sms_challenge_id}),/phone_verification_required/);
 await assert.rejects(()=>signup(a,{session_id:b.uid}),/phone_verification_required/);
 await root();await db.query('delete from auth.sessions where user_id=$1',[a.uid]);
 await assert.rejects(()=>signup(a),/phone_verification_required/);assert.equal((await state(a)).proof,'verified');
});
test('social signup service RPC is inaccessible to customer roles',async()=>{
 for(const role of ['anon','authenticated']){await db.exec('reset role;set role '+role);await assert.rejects(()=>db.query('select public.manee_social_signup($1,$2)',[id(1),{}]),/permission denied/);}
});
test('social RPC enforces all consents before reserving email or claiming the proof',async()=>{
 const f=await fixture(9);
 for(const override of [{ageConfirmed:false},{termsAccepted:false},{privacyAccepted:false},{termsVersion:'other'}]) {
  await assert.rejects(()=>signup(f,override),/Required signup information/);
  assert.deepEqual(await state(f),{profile:false,email:false,phone:false,proof:'verified'});
 }
});
