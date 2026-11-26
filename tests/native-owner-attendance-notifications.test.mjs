import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import nativePush from '../netlify/functions/lib/native-push.cjs';
import {createFcmSender} from '../supabase/functions/manee-android-push/fcm.mjs';

const db = new PGlite();
after(() => db.close());
const id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const a = id(1), b = id(2), staffA = id(11), staffB = id(12), shiftA = id(21), shiftB = id(22);
const dispatch = 'a'.repeat(64);
await db.exec(`
  create schema private; create schema auth; create schema vault;
  create role anon; create role authenticated; create role service_role;
  grant usage on schema private to anon, authenticated, service_role;
  create function auth.role() returns text language sql as $$ select current_setting('fixture.actor', true) $$;
  create function auth.jwt() returns jsonb language sql as $$ select jsonb_build_object('role', auth.role()) $$;
  create table vault.decrypted_secrets(name text, decrypted_secret text);
  create table public.stores(id uuid primary key, name text);
  create table public.crew(id uuid primary key, store_id uuid, name text);
  create table public.attendance(id uuid primary key, store_id uuid, crew_id uuid, date date default current_date);
  create table private.manee_owner_activity(id uuid primary key, store_id uuid, message text);
  create table public.monthly_cost_reviews(store_id uuid, month_key text, completed_at timestamptz, remind_after date);
  create table public.monthly_report_closings(id uuid, store_id uuid, month_key text);
  create table public.reservations(id bigint, store_id uuid, status text, date date, time text);
  create table private.test_targets(store_id uuid, token text);
  create function private.seed_ios_reminders() returns void language sql as $$select$$;
`);
for (const platform of ['android', 'ios']) {
  await db.exec(`
    create table private.${platform}_push_deliveries(
      id uuid primary key default gen_random_uuid(), store_id uuid, token text, kind text, source_id text,
      event_key text, status text default 'pending', attempts integer default 0, created_at timestamptz default now(),
      available_at timestamptz default now(), expires_at timestamptz default now() + interval '1 hour',
      lease_id uuid, lease_until timestamptz, finished_at timestamptz
    );
    create function private.manee_${platform}_push_targets(uuid) returns table(token text) language sql as
      $$ select t.token from private.test_targets t where t.store_id = $1 $$;
  `);
  await db.query('insert into vault.decrypted_secrets values ($1, $2)', ['manee_' + platform + '_dispatch', dispatch]);
}
await db.exec(readFileSync(new URL('../supabase/migrations/20261127003500_owner_attendance_push_text.sql', import.meta.url), 'utf8'));
await db.query("insert into public.stores values ($1,'첫째점'), ($2,'둘째점')", [a, b]);
await db.query("insert into public.crew values ($1,$2,'직원가'), ($3,$4,'직원나')", [staffA, a, staffB, b]);
await db.query('insert into public.attendance(id,store_id,crew_id) values ($1,$2,$3), ($4,$5,$6)',
  [shiftA, a, staffA, shiftB, b, staffB]);
await db.query("insert into private.test_targets values ($1,'owner-a'), ($2,'owner-b')", [a, b]);
await db.query("insert into private.manee_owner_activity values ($1,$2,'기존 업무 변경 알림')", [id(30), a]);

async function textFor(store, kind, source) {
  const result = await db.query('select private.manee_owner_delivery_text($1,$2,$3) as body', [store, kind, source]);
  return result.rows[0].body;
}

test('clock text uses the committed shift and the employee in that store only', async () => {
  assert.equal(await textFor(a, 'attendance_in', shiftA), '첫째점 직원가님이 출근했어요.');
  assert.equal(await textFor(b, 'attendance_out', shiftB), '둘째점 직원나님이 퇴근했어요.');
  assert.equal(await textFor(a, 'attendance_in', shiftB), null);
  assert.equal(await textFor(a, 'attendance_out', 'invalid'), null);
  assert.equal(await textFor(a, 'reservation_created', shiftA), null);
  assert.equal(await textFor(b, 'notice', id(30)), null);
  for (const role of ['anon', 'authenticated', 'service_role']) {
    assert.equal((await db.query("select has_function_privilege($1, 'private.manee_owner_delivery_text(uuid,text,text)', 'execute') as allowed", [role])).rows[0].allowed, false);
  }
});

for (const [platform, fn, params] of [
  ['android', 'private.claim_android_deliveries($1)', [dispatch]],
  ['ios', 'private.claim_ios_deliveries($1)', [dispatch]],
  ['ios', 'private.manee_ios_claim_scheduled_deliveries()', []]
]) {
  test(fn + ' adds names for each store and preserves notices, routing, recipient restrictions and leases', async () => {
    await db.exec('begin');
    try {
      await db.query("select set_config('fixture.actor','service_role',true)");
      await db.query(`insert into private.${platform}_push_deliveries(store_id,token,kind,source_id) values
        ($1,'owner-a','attendance_in',$2), ($3,'owner-b','attendance_out',$4), ($1,'owner-b','attendance_in',$2),
        ($1,'owner-a','notice',$5)`, [a, shiftA, b, shiftB, id(30)]);
      const claim = async () => (await db.query('select ' + fn + ' as jobs', params)).rows[0].jobs;
      const jobs = await claim();
      assert.equal(jobs.length, 3);
      const start = jobs.find(x => x.kind === 'attendance_in');
      const end = jobs.find(x => x.kind === 'attendance_out');
      assert.deepEqual([start.store_id, start.token, start.message], [a, 'owner-a', '첫째점 직원가님이 출근했어요.']);
      assert.deepEqual([end.store_id, end.token, end.message], [b, 'owner-b', '둘째점 직원나님이 퇴근했어요.']);
      assert.match(start.event_date, /^\d{4}-\d{2}-\d{2}$/);
      assert.equal(jobs.find(x => x.kind === 'notice').message, '기존 업무 변경 알림');
      assert.deepEqual(await claim(), []);
    } finally { await db.exec('rollback'); }
  });
}

test('FCM and APNs display identical attendance text, preserve routing and do not accept text for other events', async () => {
  const key = generateKeyPairSync('rsa', {modulusLength: 2048}).privateKey;
  let android;
  const send = createFcmSender({project: 'manee-test', email: 'test@example.invalid', key}, async (url, request) => {
    if (url.includes('oauth2')) return Response.json({access_token: 'fixture', expires_in: 3600});
    android = JSON.parse(request.body).message;
    return Response.json({name: 'projects/test/messages/unit'});
  });
  for (const [kind, store, shift] of [['attendance_in', a, shiftA], ['attendance_out', b, shiftB]]) {
    const message = await textFor(store, kind, shift);
    const event = {id: shift, eventId: shift, storeId: store, kind, message, ttl: 60, eventDate: '2026-11-27'};
    const ios = nativePush.apnsPayload(event);
    await send('fixture-device-token-12345', store, event);
    assert.equal(ios.aps.alert.body, message);
    assert.equal(android.notification.body, message);
    assert.deepEqual([ios.kind, ios.storeId, ios.eventDate], [kind, store, event.eventDate]);
    assert.deepEqual([android.data.kind, android.data.storeId, android.data.eventId], [kind, store, shift]);
  }
  const unrelated = {kind: 'report_closed', storeId: a, id: shiftA, ttl: 10, message: 'unexpected text'};
  assert.notEqual(nativePush.apnsPayload(unrelated).aps.alert.body, unrelated.message);
  await send('fixture-device-token-12345', a, unrelated);
  assert.notEqual(android.notification.body, unrelated.message);
});
