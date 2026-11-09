import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

const db = new PGlite();
const sql = path => readFileSync(new URL(path, import.meta.url), 'utf8');
await db.exec(sql('./fixtures/phone-account-foundation.sql'));
await db.exec(sql('../supabase/migrations/20261105155839_manee_email_verification.sql'));
await db.exec(`
  grant usage on schema private to authenticated;
  create function auth.jwt() returns jsonb language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
  $$;
  create function auth.uid() returns uuid language sql stable as $$
    select (auth.jwt()->>'sub')::uuid
  $$;

  -- The SMS tests exercise the classifier. This fixture verifies that the status
  -- RPC delegates using exactly the caller's live user and session IDs.
  create table private.test_phone_methods(user_id uuid, session_id uuid, method text);
  create function private.manee_phone_bind_method(uuid, uuid)
  returns text language sql stable set search_path = '' as $$
    select method from private.test_phone_methods where user_id = $1 and session_id = $2
  $$;
  revoke all on function private.manee_phone_bind_method(uuid, uuid) from public, anon, authenticated;
`);
await db.exec(sql('../supabase/migrations/20261109095400_manee_account_verification_status.sql'));
after(() => db.close());

let nextAccount = 0;
const uuid = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const expected = (phone, email, method) => ({
  phone_verified: phone,
  email_verified: email,
  phone_method: method,
});

async function fixture(method = 'password') {
  const n = ++nextAccount;
  const uid = uuid(n), sid = uuid(n + 1000);
  await db.exec('reset role');
  await db.query('insert into auth.users(id, email) values ($1, $2)', [uid, `login${n}@example.com`]);
  await db.query('insert into public.profiles(user_id, username) values ($1, $2)', [uid, `member${n}`]);
  await db.query('insert into auth.sessions(id, user_id) values ($1, $2)', [sid, uid]);
  await db.query('insert into private.test_phone_methods values ($1, $2, $3)', [uid, sid, method]);
  return {uid, sid, phone: `+82105555${String(n).padStart(4, '0')}`};
}

async function caller(claims, role = 'authenticated') {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify(claims)]);
  const roles = {authenticated: 'set role authenticated', anon: 'set role anon', service_role: 'set role service_role'};
  await db.exec(roles[role]);
}

async function readStatus() {
  return (await db.query('select public.manee_account_verification_status() as status')).rows[0].status;
}

async function status({uid, sid}) {
  await caller({sub: uid, session_id: sid});
  return readStatus();
}

async function emailService(action, payload) {
  await db.exec('reset role; set role service_role');
  return (await db.query('select public.manee_email_service($1, $2) as result', [action, payload])).rows[0].result;
}

test('status only trusts canonical bindings, ignoring legacy contact mirrors and pending email', async () => {
  const a = await fixture();
  await db.query(`update public.profiles set phone_e164 = $2, phone_verified_at = now(),
    recovery_email = 'legacy@example.com', recovery_email_verified_at = now() where user_id = $1`, [a.uid, a.phone]);
  const registered = await emailService('register', {user_id: a.uid, email: 'pending@example.com'});
  assert.equal(registered.ok, true);
  assert.deepEqual(await status(a), expected(false, false, 'password'));

  await db.exec('reset role');
  await db.query('insert into private.manee_sms_bindings(user_id, phone_e164) values ($1, $2)', [a.uid, a.phone]);
  assert.deepEqual(await status(a), expected(true, false, null));
});

test('existing email-link verification updates status and a pending replacement preserves the verified address', async () => {
  const a = await fixture('social_reauth');
  const tokenHash = 'a'.repeat(64);
  const request = await emailService('prepare', {
    user_id: a.uid, session_id: a.sid, email: 'verified@example.com', token_hash: tokenHash,
  });
  assert.equal(request.ok, true);
  assert.deepEqual(await status(a), expected(false, false, 'social_reauth'));
  assert.equal((await emailService('sent', {challenge_id: request.challenge_id})).ok, true);
  assert.equal((await emailService('verify', {token_hash: tokenHash})).ok, true);
  assert.deepEqual(await status(a), expected(false, true, 'social_reauth'));

  const replacement = await emailService('register', {user_id: a.uid, email: 'replacement@example.com'});
  assert.equal(replacement.ok, true);
  await db.exec('reset role');
  await db.query('insert into private.manee_sms_bindings(user_id, phone_e164) values ($1, $2)', [a.uid, a.phone]);
  assert.deepEqual(await status(a), expected(true, true, null));
});

test('the phone method is restricted to the same live session and the agreed enum', async () => {
  for (const method of ['password', 'recent_social', 'social_reauth', 'unavailable', null, 'private-value']) {
    const a = await fixture(method);
    const result = await status(a);
    const allowed = ['password', 'recent_social', 'social_reauth', 'unavailable'].includes(method);
    assert.deepEqual(result, expected(false, false, allowed ? method : 'unavailable'));
  }
  const a = await fixture('recent_social');
  const otherSession = uuid(9000);
  await db.query('insert into auth.sessions(id, user_id) values ($1, $2)', [otherSession, a.uid]);
  assert.deepEqual(await status({uid: a.uid, sid: otherSession}), expected(false, false, 'unavailable'));
});

test('missing, malformed, foreign, expired and revoked sessions are denied', async () => {
  const a = await fixture(), b = await fixture();
  for (const claims of [{}, {sub: a.uid}, {sub: a.uid, session_id: '-'.repeat(36)},
    {sub: a.uid, session_id: b.sid}, {session_id: a.sid}]) {
    await caller(claims);
    await assert.rejects(readStatus, {code: '42501'});
  }
  await db.exec('reset role');
  await db.query("update auth.sessions set not_after = now() - interval '1 second' where id = $1", [a.sid]);
  await assert.rejects(() => status(a), {code: '42501'});
  await db.exec('reset role');
  await db.query('delete from auth.sessions where id = $1', [b.sid]);
  await assert.rejects(() => status(b), {code: '42501'});
});

test('inactive, missing, banned and active platform-admin profiles are denied', async () => {
  const inactive = await fixture(), missing = await fixture(), banned = await fixture(), admin = await fixture();
  await db.query("update public.profiles set status = 'inactive' where user_id = $1", [inactive.uid]);
  await db.query('delete from public.profiles where user_id = $1', [missing.uid]);
  await db.query("update auth.users set banned_until = now() + interval '1 hour' where id = $1", [banned.uid]);
  await db.query("insert into public.platform_admins values ($1, 'active')", [admin.uid]);
  for (const a of [inactive, missing, banned, admin]) await assert.rejects(() => status(a), {code: '42501'});
});

test('only authenticated callers can read status and no write access is needed', async () => {
  const a = await fixture();
  const claims = {sub: a.uid, session_id: a.sid};
  for (const role of ['anon', 'service_role']) {
    await caller(claims, role);
    await assert.rejects(readStatus, {code: '42501'});
  }
  await caller(claims);
  await assert.rejects(() => db.query('select * from private.manee_sms_bindings'), {code: '42501'});
  await assert.rejects(() => db.query('select * from private.manee_email_accounts'), {code: '42501'});
  await db.exec('begin read only');
  try {
    assert.deepEqual(await readStatus(), expected(false, false, 'password'));
  } finally {
    await db.exec('rollback');
  }
});
