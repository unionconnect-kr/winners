import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

const db = new PGlite();
const source = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const id = n => '15700000-0000-4000-8000-' + String(n).padStart(12, '0');
const phone = n => '+8210' + String(n).padStart(8, '0');
const digest = 'a'.repeat(64);
await db.exec(source('./fixtures/phone-account-foundation.sql'));
await db.exec(`
  alter table auth.users add column encrypted_password text;
  alter table auth.sessions add column created_at timestamptz default now(), add column oauth_client_id uuid;
  create table auth.mfa_amr_claims(session_id uuid references auth.sessions on delete cascade,
    authentication_method text, created_at timestamptz not null default now());
  create or replace function private.manee_sms_ordinary_user(u uuid) returns boolean language sql stable as
  $$select exists(select 1 from auth.users a join public.profiles p on p.user_id=a.id where a.id=u
    and p.status='active' and a.email ~ '^u-[0-9a-f]{32}@auth[.]manee[.]local$' and coalesce(a.encrypted_password,'')<>''
    and not exists(select 1 from auth.identities i where i.user_id=a.id and i.provider<>'email'))$$;
  create function public.manee_sms_service(p_action text,p_payload jsonb) returns jsonb language sql set search_path=''
    as $$select null::jsonb$$;
`);
await db.exec(source('../supabase/migrations/20261105155942_one_phone_one_account.sql'));
await db.exec(`create or replace function public.manee_sms_service(p_action text,p_payload jsonb) returns jsonb
  language sql set search_path='' as $$select private.manee_sms_service(p_action,p_payload)$$;`);
await db.exec(source('../supabase/migrations/20261109095355_manee_existing_phone_bind.sql'));
after(() => db.close());

async function account(n, {provider='kakao', method='oauth', age=0, password=false, externalClient=false, profile=true}={}) {
  const user = id(n), session = id(n+1000), username = 'existing'+n;
  const email = password ? 'u-'+user.replaceAll('-','')+'@auth.manee.local' : 'fixture-'+n+'@example.invalid';
  await db.query('insert into auth.users(id,email,encrypted_password) values($1,$2,$3)', [user,email,password?'synthetic-hash':null]);
  await db.query('insert into auth.identities values($1,$2)', [user,provider]);
  if (profile) await db.query('insert into public.profiles(user_id,username) values($1,$2)', [user,username]);
  await db.query(`insert into auth.sessions(id,user_id,created_at,oauth_client_id)
    values($1,$2,now()-$3*interval '1 minute',$4)`, [session,user,age,externalClient?id(9999):null]);
  await db.query(`insert into auth.mfa_amr_claims(session_id,authentication_method,created_at)
    values($1,$2,now()-$3*interval '1 minute')`, [session,method,age]);
  return {user_id:user,session_id:session,username};
}

async function rpc(action,payload) {
  await db.exec('set role service_role');
  try {
    return (await db.query('select public.manee_sms_service($1,$2) result',[action,payload])).rows[0].result;
  } finally {
    await db.exec('reset role');
  }
}
async function bindMethod(account) {
  return (await db.query('select private.manee_phone_bind_method($1,$2) method',[account.user_id,account.session_id])).rows[0].method;
}
function request(account,n,method,destination=phone(n)) {
  return rpc('request',{...account,id:id(n),purpose:'bind',phone:destination,bind_method:method,
    phone_hash:destination.slice(1).padStart(64,'0'),username_hash:digest,ip_hash:digest,code_hash:digest});
}
async function verified(account,n,method,destination=phone(n)) {
  assert.equal((await request(account,n,method,destination)).send_allowed,true);
  assert.equal((await rpc('sent',{id:id(n)})).ok,true);
  const proof = {...account,id:id(n),purpose:'bind',proof_hash:digest};
  assert.equal((await rpc('verify',{...proof,code_hash:digest})).ok,true);
  return proof;
}

test('only a real recent provider session can authorize first bind without a password', async () => {
  const oauth = await account(1);
  const stale = await account(2,{age:11});
  const password = await account(3,{method:'password'});
  const oauthClient = await account(4,{externalClient:true});
  const noProfile = await account(5,{profile:false});
  assert.equal(await bindMethod(oauth),'recent_social');
  for (const denied of [stale,password,oauthClient]) {
    assert.equal(await bindMethod(denied),'social_reauth');
    assert.equal((await rpc('credentials',denied)).error,'social_reauth_required');
    assert.equal((await request(denied,200+Number(denied.username.slice(8)),'recent_social')).ok,false);
  }
  assert.equal(await bindMethod(noProfile),'unavailable');
  assert.equal(await bindMethod({...oauth,session_id:password.session_id}),'unavailable');
  for (const role of ['anon','authenticated']) {
    await db.exec('set role '+role);
    try {
      await assert.rejects(()=>db.query('select private.manee_phone_bind_method($1,$2)',[oauth.user_id,oauth.session_id]),/permission denied/);
      await assert.rejects(()=>db.query('select public.manee_sms_service($1,$2)',['credentials',oauth]),/permission denied/);
    } finally {
      await db.exec('reset role');
    }
  }
});

test('proof cannot change account, username or session and cannot replace a verified phone', async () => {
  const a = await account(10);
  const b = await account(11);
  const first = await verified(a,210,'recent_social');
  const second = await verified(a,211,'recent_social');
  assert.equal((await rpc('finish_bind',{...first,username:b.username})).ok,false);
  assert.equal((await rpc('finish_bind',{...first,user_id:b.user_id})).ok,false);
  assert.equal((await rpc('finish_bind',{...first,session_id:b.session_id})).ok,false);
  assert.equal((await rpc('finish_bind',{...first,purpose:'signup_social'})).ok,false);
  assert.equal((await rpc('finish_bind',first)).ok,true);
  assert.equal(await bindMethod(a),'unavailable');
  assert.equal((await rpc('finish_bind',second)).ok,false);
  assert.equal((await rpc('finish_bind',first)).ok,false);
  assert.equal((await db.query('select phone_e164 from private.manee_sms_bindings where user_id=$1',[a.user_id])).rows[0].phone_e164,phone(210));
  await db.query("update private.manee_sms_challenges set created_at=now()-interval '31 seconds' where id=$1",[first.id]);
  const collision = await verified(b,212,'recent_social',phone(210));
  assert.equal((await rpc('finish_bind',collision)).error,'phone_taken');
  assert.equal((await db.query('select status from private.manee_sms_challenges where id=$1',[collision.id])).rows[0].status,'verified');
});

test('final bind rechecks the live session and rolls back a failed completion', async () => {
  const a = await account(20);
  const proof = await verified(a,220,'recent_social');
  await db.exec(`
    create function private.test_revoke_bind_session() returns trigger language plpgsql as $$
    begin
      if new.status='consuming' and new.id='${proof.id}' then
        delete from auth.sessions where id=new.session_id;
      end if;
      return new;
    end $$;
    create trigger test_revoke_bind_session after update on private.manee_sms_challenges
    for each row execute function private.test_revoke_bind_session();
  `);
  try {
    await assert.rejects(()=>rpc('finish_bind',proof),/phone_bind_not_completed/);
    assert.equal((await db.query('select status from private.manee_sms_challenges where id=$1',[proof.id])).rows[0].status,'verified');
    assert.equal((await db.query('select count(*)::int n from private.manee_sms_bindings where user_id=$1',[a.user_id])).rows[0].n,0);
    assert.equal(await bindMethod(a),'recent_social');
  } finally {
    await db.exec('drop trigger test_revoke_bind_session on private.manee_sms_challenges');
  }
  await db.query('delete from auth.sessions where id=$1',[a.session_id]);
  assert.equal((await rpc('finish_bind',proof)).ok,false);
});

test('password-backed ordinary and linked accounts retain verified password paths', async () => {
  const ordinary = await account(30,{provider:'email',method:'password',password:true});
  const linked = await account(31,{method:'password',password:true});
  assert.equal(await bindMethod(ordinary),'password');
  assert.equal(await bindMethod(linked),'password');
  const credentials = await rpc('credentials',ordinary);
  assert.equal(credentials.username,ordinary.username);
  assert.match(credentials.email,/^u-[0-9a-f]{32}@auth[.]manee[.]local$/);
  assert.equal((await request(linked,230,'recent_social')).ok,false);
  const oldProof = await verified(ordinary,231,undefined);
  // A verified request issued before the migration has no recorded method.
  await db.query('update private.manee_sms_challenges set bind_method=null where id=$1',[oldProof.id]);
  const oldClaim = await rpc('claim',oldProof);
  assert.equal(oldClaim.ok,true);
  assert.equal((await rpc('complete',{id:oldProof.id,operation_id:oldClaim.operation_id,user_id:oldClaim.user_id})).ok,true);
  assert.equal((await rpc('finish_bind',await verified(ordinary,232,'password'))).ok,true);
  assert.equal((await rpc('finish_bind',await verified(linked,233,'password'))).ok,true);
  assert.equal(await bindMethod(linked),'unavailable');
});

test('a first-bind proof can finish as the same live session ages past the request window', async () => {
  const a = await account(40);
  const proof = await verified(a,240,'recent_social');
  // Advance the relative ages: sign-in 11 minutes ago, request 2 minutes ago.
  await db.query("update auth.sessions set created_at=now()-interval '11 minutes' where id=$1",[a.session_id]);
  await db.query("update auth.mfa_amr_claims set created_at=now()-interval '11 minutes' where session_id=$1",[a.session_id]);
  await db.query("update private.manee_sms_challenges set created_at=now()-interval '2 minutes' where id=$1",[proof.id]);
  assert.equal(await bindMethod(a),'social_reauth');
  assert.equal((await rpc('finish_bind',proof)).ok,true);
});
