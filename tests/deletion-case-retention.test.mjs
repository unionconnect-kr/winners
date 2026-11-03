import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

const db=new PGlite();after(()=>db.close());
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
await db.exec(`create role anon;create role authenticated;create role service_role;
 create schema private;create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;`);
await db.exec(read('../supabase/migrations/20261015123500_account_deletion_requests.sql'));
await db.exec("insert into private.account_deletion_requests(username,contact,status,reviewed_at) values('legacy','synthetic@example.invalid','completed',now()-interval '100 days')");
await db.exec(read('../supabase/migrations/20261015164128_deletion_case_retention.sql'));
const scalar=async(sql,args=[])=>(Object.values((await db.query(sql,args)).rows[0]))[0];
const row=async(name)=>(await db.query('select * from private.account_deletion_requests where username=$1',[name])).rows[0];
const insert=async(name,status='pending')=>db.query("insert into private.account_deletion_requests(username,contact,status) values($1,'synthetic@example.invalid',$2)",[name,status]);
function scenario(name,fn){test(name,async()=>{await db.exec('begin');try{await fn();}finally{await db.exec('rollback;reset role');}});}

scenario('migration preserves legacy completed cases without inventing a disposal date',async()=>{
 assert.equal((await row('legacy')).completed_at,null);
 assert.equal(await scalar('select private.manee_purge_completed_deletion_cases()'),0);
 assert.ok(await row('legacy'));
});
scenario('only actual transition to completed records the server completion time',async()=>{
 await insert('caseone');assert.equal((await row('caseone')).completed_at,null);
 await db.exec("update private.account_deletion_requests set status='in_review',reviewed_at=now()-interval '100 days' where username='caseone'");
 assert.equal((await row('caseone')).completed_at,null);
 await db.exec("update private.account_deletion_requests set status='completed',completed_at=now()-interval '100 days' where username='caseone'");
 assert.ok((await row('caseone')).completed_at.getTime()>=Date.now()-5000);
 const original=(await row('caseone')).completed_at;
 await db.exec("update private.account_deletion_requests set note='Synthetic update',completed_at=now()-interval '100 days' where username='caseone'");
 assert.equal((await row('caseone')).completed_at.toISOString(),original.toISOString());
 assert.equal(await scalar('select private.manee_purge_completed_deletion_cases()'),0);
});
scenario('reopened cases stop disposal and a later completion starts a fresh period',async()=>{
 await insert('reopened','completed');
 await db.exec("update private.account_deletion_requests set status='in_review' where username='reopened'");
 assert.equal((await row('reopened')).completed_at,null);
 await db.exec("update private.account_deletion_requests set status='completed' where username='reopened'");
 assert.ok((await row('reopened')).completed_at.getTime()>=Date.now()-5000);
});

// Only local synthetic fixture setup may assign historical completion times.
// The installed production trigger always controls actual completion timestamps.
async function history(){
 await db.exec('alter table private.account_deletion_requests disable trigger manee_stamp_deletion_case_completion');
 await db.exec(`insert into private.account_deletion_requests(username,contact,status,completed_at,note) values
 ('due','synthetic@example.invalid','completed',now()-interval '720 hours','Synthetic private case'),
 ('later','synthetic@example.invalid','completed',now()-interval '720 hours'+interval '1 millisecond','Synthetic private case'),
 ('recent','synthetic@example.invalid','completed',now()-interval '1 hour','Synthetic private case'),
 ('pendingold','synthetic@example.invalid','pending',null,'Synthetic pending'),
 ('reviewold','synthetic@example.invalid','in_review',null,'Synthetic review'),
 ('rejected','synthetic@example.invalid','rejected',null,'Synthetic rejection');
 update private.account_deletion_requests set requested_at=now()-interval '100 days';`);
 await db.exec('alter table private.account_deletion_requests enable trigger manee_stamp_deletion_case_completion');
}
scenario('exact 720-hour boundary erases only completed case including contact and note',async()=>{
 await history();
 const preserved=(await db.query("select * from private.account_deletion_requests where username<>'due' order by username")).rows;
 assert.equal(await scalar('select private.manee_purge_completed_deletion_cases()'),1);
 assert.equal(await row('due'),undefined);
 assert.deepEqual((await db.query('select * from private.account_deletion_requests order by username')).rows,preserved);
 assert.equal(await scalar('select private.manee_purge_completed_deletion_cases()'),0);
});
scenario('expiry interval is independent of session timezone including daylight saving',async()=>{
 for(const zone of ['UTC','Asia/Seoul','America/Los_Angeles']){
  await db.query("select set_config('TimeZone',$1,true)",[zone]);
  assert.equal(await scalar("select extract(epoch from (('2026-11-20T00:00Z'::timestamptz)-('2026-11-20T00:00Z'::timestamptz-interval '720 hours')))::bigint"),2592000);
 }
});
scenario('bounded batches and invalid sizes cannot broaden erasure',async()=>{
 await history();
 await db.exec('alter table private.account_deletion_requests disable trigger manee_stamp_deletion_case_completion');
 await db.exec("insert into private.account_deletion_requests(username,contact,status,completed_at) select 'batch'||n,'synthetic@example.invalid','completed',now()-interval '721 hours' from generate_series(1,5)n");
 await db.exec('alter table private.account_deletion_requests enable trigger manee_stamp_deletion_case_completion');
 assert.equal(await scalar('select private.manee_purge_completed_deletion_cases(2)'),2);
 assert.equal(await scalar("select count(*)::int from private.account_deletion_requests where username like 'batch%'"),3);
 for(const value of [null,0,-1,1001]){
  await db.exec('savepoint invalid');
  await assert.rejects(()=>scalar('select private.manee_purge_completed_deletion_cases($1)',[value]),e=>e.code==='22023');
  await db.exec('rollback to invalid;release invalid');
 }
});
scenario('no customer or service role can maintain/read cases; customer JWT is refused',async()=>{
 for(const role of ['anon','authenticated','service_role']){
  for(const fn of ['private.manee_stamp_deletion_case_completion()','private.manee_purge_completed_deletion_cases(integer)'])
   assert.equal(await scalar("select has_function_privilege($1,$2,'EXECUTE')",[role,fn]),false);
  assert.equal(await scalar("select has_table_privilege($1,'private.account_deletion_requests','SELECT')",[role]),false);
 }
 assert.equal(await scalar("select prosecdef from pg_proc where oid='private.manee_purge_completed_deletion_cases(integer)'::regprocedure"),false);
 await db.exec("select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true)");
 await assert.rejects(()=>scalar('select private.manee_purge_completed_deletion_cases()'),e=>e.code==='42501');
});
scenario('public intake remains available to the service without a completion claim',async()=>{
 await db.exec('set local role service_role');
 await db.query('select public.manee_account_deletion_request($1,$2)',['newrequest','synthetic@example.invalid']);
 await db.exec('reset role');
 const request=await row('newrequest');assert.equal(request.status,'pending');assert.equal(request.completed_at,null);
});
