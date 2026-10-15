import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const db=new PGlite();after(()=>db.close());
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
await db.exec(`create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;
 create schema private;create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table public.stores(id uuid primary key,name text);
 create table public.reservations(id bigint primary key,store_id uuid,date date not null,time text,customer_name text,phone text,memo text);
 create table private.android_push_deliveries(store_id uuid,source_id text,kind text,status text,finished_at timestamptz);
 create table private.test_events(kind text);
 create function private.enqueue_android_event(uuid,text,text,text,timestamptz) returns void language sql as $$insert into private.test_events values($2)$$;
 create function private.manee_store_write_entitled(uuid) returns boolean language sql as $$select false$$;`);
const push=read('../supabase/migrations/20261013131457_android_business_push.sql').match(/create function private\.queue_android_business_event\(\)[\s\S]*?end \$\$;/)?.[0];
const billing=read('../supabase/migrations/20261014035157_store_billing_write_gate.sql').match(/create function private\.manee_guard_billed_write\(\)[\s\S]*?end \$\$;/)?.[0];
assert.ok(push&&billing);await db.exec(push);await db.exec(billing);
await db.exec(`create trigger android_reservation_event after insert or delete on public.reservations for each row execute function private.queue_android_business_event();
 create trigger manee_billing_write_gate before insert or update or delete on public.reservations for each row execute function private.manee_guard_billed_write();`);
await db.exec(read('../supabase/migrations/20261015152000_reservation_retention.sql'));
const scalar=async(sql,args=[])=>(Object.values((await db.query(sql,args)).rows[0]))[0];
function scenario(name,fn){test(name,async()=>{await db.exec('begin');try{await fn();}finally{await db.exec('rollback');}});}
const deadline=(d,t)=>scalar('select private.manee_reservation_retention_deadline($1::date,$2)',[d,t]);

scenario('Seoul appointment time plus exactly 168 hours, independent of session timezone',async()=>{
 const expected='2026-10-22T00:15:30.000Z';
 for(const zone of ['UTC','America/Los_Angeles','Asia/Seoul']){
  await db.query("select set_config('TimeZone',$1,true)",[zone]);
  assert.equal((await deadline('2026-10-15','09:15:30')).toISOString(),expected);
 }
 assert.equal((await deadline('2026-10-15',' 09:15 ')).toISOString(),'2026-10-22T00:15:00.000Z');
});
scenario('missing times use end of reservation day; malformed times stay for review',async()=>{
 for(const value of [null,'',' '])assert.equal((await deadline('2026-10-15',value)).toISOString(),'2026-10-22T15:00:00.000Z');
 for(const value of ['24:00','12:60','not-a-time','09:00:00.1'])assert.equal(await deadline('2026-10-15',value),null);
});
scenario('exact due boundary is eligible while later and future appointments remain',async()=>{
 assert.equal(await scalar("select private.manee_reservation_retention_deadline('2026-10-15','09:00') <= '2026-10-22T00:00Z'::timestamptz"),true);
 assert.equal(await scalar("select private.manee_reservation_retention_deadline('2026-10-15','09:00') <= '2026-10-21T23:59:59.999Z'::timestamptz"),false);
 await db.exec(`insert into public.reservations values
 (1,'00000000-0000-4000-8000-000000000001',(now() at time zone 'Asia/Seoul')::date-10,'09:00','Expired','synthetic','synthetic'),
 (2,'00000000-0000-4000-8000-000000000002',(now() at time zone 'Asia/Seoul')::date+1,'09:00','Future','synthetic','synthetic'),
 (3,'00000000-0000-4000-8000-000000000002',(now() at time zone 'Asia/Seoul')::date-1,'09:00','Recent','synthetic','synthetic'),
 (4,'00000000-0000-4000-8000-000000000002',(now() at time zone 'Asia/Seoul')::date-10,'invalid','Review','synthetic','synthetic');`);
 const before=(await db.query('select * from public.reservations where id<>1 order by id')).rows;
 await db.exec('truncate private.test_events');
 assert.equal(await scalar('select private.manee_purge_expired_reservations()'),1);
 assert.deepEqual((await db.query('select * from public.reservations order by id')).rows,before);
 assert.equal(await scalar('select count(*)::int from private.test_events'),0,'maintenance must not send reservation-cancel notifications');
 assert.equal(await scalar('select private.manee_purge_expired_reservations()'),0);
});
scenario('bounded batches erase only due rows and keep other data',async()=>{
 await db.exec("insert into public.reservations(id,date,time) select x,(now() at time zone 'Asia/Seoul')::date-10,'10:00' from generate_series(1,5) x");
 assert.equal(await scalar('select private.manee_purge_expired_reservations(2)'),2);
 assert.equal(await scalar('select count(*)::int from public.reservations'),3);
 for(const value of [0,-1,1001,null]){
  await db.exec('savepoint invalid_batch');await assert.rejects(()=>scalar('select private.manee_purge_expired_reservations($1)',[value]),e=>e.code==='22023');await db.exec('rollback to invalid_batch');
 }
});
scenario('no client or service role can execute maintenance or helper; customer claims are refused',async()=>{
 for(const role of ['anon','authenticated','service_role'])for(const fn of ['private.manee_purge_expired_reservations(integer)','private.manee_reservation_retention_deadline(date,text)'])
  assert.equal(await scalar("select has_function_privilege($1,$2,'EXECUTE')",[role,fn]),false);
 assert.equal(await scalar("select prosecdef from pg_proc where oid='private.manee_purge_expired_reservations(integer)'::regprocedure"),false);
 await db.exec("select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true)");
 await assert.rejects(()=>scalar('select private.manee_purge_expired_reservations()'),e=>e.code==='42501');
});
test('exact Staging rehearsal passes five assertions and rolls every fixture back',async()=>{
 const result=(await db.exec(read('../security/reservation-retention-staging-rehearsal.sql'))).find(r=>r.rows?.[0]?.retention_rehearsal)?.rows[0].retention_rehearsal;
 assert.deepEqual(result,{checks_passed:5,original_reservations_unchanged:true,all_fixtures_rolled_back:true,cron_scheduled:false});
 assert.equal(await scalar('select count(*)::int from public.reservations'),0);
 assert.equal(await scalar('select count(*)::int from public.stores'),0);
});
