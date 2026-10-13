import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

test('scheduler selects the configured deployment and rejects untrusted URLs before side effects', async()=>{
 const db=new PGlite();
 try {
  await db.exec(`create role anon;create role authenticated;create role service_role;
   create schema private;create schema vault;create schema net;
   create table vault.decrypted_secrets(name text,decrypted_secret text);
   insert into vault.decrypted_secrets values('manee_android_dispatch','test-scheduler-bearer');
   create table private.android_push_deliveries(created_at timestamptz,status text,available_at timestamptz,lease_until timestamptz);
   insert into private.android_push_deliveries values(now(),'pending',now(),null);
   create table private.requests(url text,headers jsonb);
   create table private.seed_calls(value integer);
   create function private.seed_android_reminders() returns void language sql as $$insert into private.seed_calls values(1)$$;
   create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer) returns bigint
    language plpgsql as $$begin insert into private.requests values(url,headers);return 1;end$$;`);
  await db.exec(fs.readFileSync(new URL('../supabase/migrations/20261013172452_android_push_scheduler_project_routing.sql',import.meta.url),'utf8'));
  const calls=async()=>(await db.query('select * from private.requests')).rows;
  await db.exec('select private.dispatch_android_notifications()');
  assert.equal((await calls())[0].url,'https://obpkzecgswnfuyhwvncd.supabase.co/functions/v1/manee-android-delivery');
  await db.query('insert into vault.decrypted_secrets values($1,$2)',['manee_android_project_url','https://bhwuuxcrzxespkjlmqxr.supabase.co']);
  await db.exec('select private.dispatch_android_notifications()');
  assert.equal((await calls())[1].url,'https://bhwuuxcrzxespkjlmqxr.supabase.co/functions/v1/manee-android-delivery');
  assert.equal((await calls())[1].headers.Authorization,'Bearer test-scheduler-bearer');
  await db.exec("update vault.decrypted_secrets set decrypted_secret='https://untrusted.invalid' where name='manee_android_project_url'");
  await assert.rejects(()=>db.exec('select private.dispatch_android_notifications()'),/Invalid Android deployment URL/);
  assert.equal((await calls()).length,2);
  assert.equal((await db.query('select count(*)::int n from private.seed_calls')).rows[0].n,2);
  for(const role of ['anon','authenticated','service_role']) {
   const result=await db.query("select has_function_privilege($1,'private.dispatch_android_notifications()','EXECUTE') allowed",[role]);
   assert.equal(result.rows[0].allowed,false);
  }
 }finally{await db.close();}
});
