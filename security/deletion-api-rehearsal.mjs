// Disposable local Supabase only. Never pass hosted-project keys to this script.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';

export function localApiConfig(status, acknowledgement) {
  assert.equal(acknowledgement, 'disposable-local-only', 'Local rehearsal acknowledgement required');
  assert.equal(status.API_URL, 'http://127.0.0.1:54321', 'Only the fixed local CLI API is allowed');
  assert.ok(typeof status.ANON_KEY === 'string' && status.ANON_KEY.length > 20, 'Local anon key required');
  assert.ok(typeof status.SERVICE_ROLE_KEY === 'string' && status.SERVICE_ROLE_KEY.length > 20, 'Local service key required');
  return status;
}

async function rehearse() {
  const config = localApiConfig(JSON.parse(readFileSync(process.argv[2], 'utf8')), process.env.MANEE_DELETION_API_REHEARSAL);
  const options = {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    // Refuse a redirect rather than forwarding fixture tokens to another host.
    global: { fetch: (url, init) => fetch(url, { ...init, redirect: 'error' }) },
  };
  const admin = createClient(config.API_URL, config.SERVICE_ROLE_KEY, options);
  const bucket = 'manee-delete-api-rehearsal';
  const users = [];
  const files = [];
  let bucketCreated = false;
  const check = (condition, message) => { assert.ok(condition, message); console.log(`PASS ${message}`); };
  const ok = (result, label) => { assert.equal(result.error, null, `${label} failed`); return result.data; };
  try {
    ok(await admin.storage.createBucket(bucket, { public: false }), 'create private fixture bucket');
    bucketCreated = true;
    // This policy exists only in the throwaway CLI database, never in a migration.
    execFileSync('psql', ['-X', '-v', 'ON_ERROR_STOP=1'], {
      env: { ...process.env, PGHOST: '127.0.0.1', PGPORT: '54322', PGUSER: 'postgres', PGPASSWORD: 'postgres', PGDATABASE: 'postgres' },
      input: `create policy deletion_api_fixture_insert on storage.objects for insert to authenticated
        with check (bucket_id = '${bucket}' and (storage.foldername(name))[1] = auth.uid()::text);
        create policy deletion_api_fixture_select on storage.objects for select to authenticated
        using (bucket_id = '${bucket}' and (storage.foldername(name))[1] = auth.uid()::text);`,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    for (const label of ['target', 'colleague', 'premature-delete']) {
      const email = `${label}-${randomUUID()}@example.test`;
      const password = `${randomUUID()}Aa9!`;
      const { user } = ok(await admin.auth.admin.createUser({ email, password, email_confirm: true }), 'create fixture user');
      assert.ok(user?.id);
      users.push(user.id);
      const client = createClient(config.API_URL, config.ANON_KEY, options);
      const { session } = ok(await client.auth.signInWithPassword({ email, password }), 'sign in fixture user');
      assert.ok(session?.access_token && session?.refresh_token);
      const path = `${user.id}/private.txt`;
      const content = `synthetic ${label} ${randomUUID()}`;
      files.push({ path, content, client, session, id: user.id });
      ok(await client.storage.from(bucket).upload(path, content, { contentType: 'text/plain' }), 'authenticated fixture upload');
    }
    const [target, colleague, premature] = files;
    assert.match(target.id, /^[0-9a-f-]{36}$/);
    const ownedCount = execFileSync('psql', ['-X', '-At', '-v', 'ON_ERROR_STOP=1', '-c',
      `select count(*) from storage.objects where bucket_id = '${bucket}' and owner_id = '${target.id}' and name = '${target.path}'`], {
      env: { ...process.env, PGHOST: '127.0.0.1', PGPORT: '54322', PGUSER: 'postgres', PGPASSWORD: 'postgres', PGDATABASE: 'postgres' },
      encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    check(ownedCount === '1', 'target owns uploaded object');
    const before = ok(await admin.storage.from(bucket).download(target.path), 'download fixture');
    check(await before.text() === target.content, 'target file bytes readable before deletion');
    // Some versions refuse owned-object deletion; others allow Auth deletion
    // while leaving bytes behind. Neither behavior replaces Storage erasure.
    const prematureDelete = await admin.auth.admin.deleteUser(premature.id);
    const prematureIdentity = await admin.auth.admin.getUserById(premature.id);
    if (prematureDelete.error) {
      check(prematureIdentity.data?.user?.id === premature.id, 'premature Auth deletion blocked with identity preserved');
    } else {
      check(!!prematureIdentity.error && !prematureIdentity.data.user, 'premature Auth deletion allowed without Storage erasure');
    }
    const retainedBytes = ok(await admin.storage.from(bucket).download(premature.path), 'read premature-deletion file');
    check(await retainedBytes.text() === premature.content, 'Auth deletion alone does not erase uploaded file bytes');
    ok(await admin.auth.admin.signOut(target.session.access_token, 'global'), 'revoke target sessions');
    const refreshAfterRevoke = await target.client.auth.refreshSession({ refresh_token: target.session.refresh_token });
    check(!!refreshAfterRevoke.error && !refreshAfterRevoke.data.session, 'revoked refresh token cannot renew session');
    // A previously issued JWT can still pass signature/expiry validation. Hosted
    // MANEE live-session authorization is checked separately by the SQL suites.
    ok(await admin.storage.from(bucket).remove([target.path]), 'remove target object through Storage API');
    const missing = await admin.storage.from(bucket).download(target.path);
    check(!!missing.error && !missing.data, 'deleted target bytes unavailable through Storage API');
    const afterList = ok(await admin.storage.from(bucket).list(target.id), 'list removed object');
    check(afterList.length === 0, 'target object absent from Storage listing');
    ok(await admin.auth.admin.deleteUser(target.id), 'delete target Auth identity');
    const gone = await admin.auth.admin.getUserById(target.id);
    check(!!gone.error && !gone.data.user, 'deleted identity absent from Auth Admin API');
    const oldToken = await target.client.auth.getUser(target.session.access_token);
    check(!!oldToken.error && !oldToken.data.user, 'Auth user lookup rejects deleted identity token');
    const oldRefresh = await target.client.auth.refreshSession({ refresh_token: target.session.refresh_token });
    check(!!oldRefresh.error && !oldRefresh.data.session, 'deleted identity cannot refresh old session');
    const untouched = ok(await admin.storage.from(bucket).download(colleague.path), 'download colleague object');
    check(await untouched.text() === colleague.content, 'colleague file bytes unchanged');
    const colleagueAuth = ok(await colleague.client.auth.getUser(colleague.session.access_token), 'read colleague session');
    check(colleagueAuth.user.id === colleague.id, 'colleague Auth session remains usable');
    console.log('PASS disposable API rehearsal complete (12 assertions)');
  } finally {
    // Exact fixtures only. CI always destroys the complete disposable stack too.
    if (bucketCreated) {
      if (files.length) ok(await admin.storage.from(bucket).remove(files.map(file => file.path)), 'fixture file cleanup');
      for (const id of users) {
        const existing = await admin.auth.admin.getUserById(id);
        if (existing.data?.user) ok(await admin.auth.admin.deleteUser(id), 'fixture identity cleanup');
      }
      ok(await admin.storage.deleteBucket(bucket), 'fixture bucket cleanup');
      console.log('PASS exact fixture cleanup complete');
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  rehearse().catch(() => {
    // Never print SDK exceptions, keys, tokens, fixture emails or object paths.
    console.error('FAIL disposable deletion API rehearsal; inspect the last PASS label');
    process.exitCode = 1;
  });
}
