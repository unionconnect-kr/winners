// Disposable local PostgreSQL only. Never connects to a hosted database.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFileSync} from 'node:fs';
const base=process.env.MANEE_TEST_DATABASE_URL;
test('Real PostgreSQL: two phone signup proofs serialize and only one account claims the destination',{skip:!base,timeout:60000},async()=>{
 assert.match(base,/^postgresql:\/\/postgres:[^@]+@(?:127\.0\.0\.1|localhost):5432\/manee_code_test$/);
 const name='manee_phone_account_test',admin=base.replace(/\/manee_code_test$/,'/postgres'),url=base.replace(/\/manee_code_test$/,'/'+name),children=new Set();
 function session(target){const child=spawn('psql',[target,'-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose'],{stdio:['pipe','pipe','pipe']});children.add(child);let out='',err='',finished=false;const timer=setTimeout(()=>child.kill('SIGKILL'),30000);child.stdout.on('data',b=>out+=b);child.stderr.on('data',b=>err+=b);const done=new Promise(resolve=>{child.on('error',e=>err+=e.message);child.on('close',code=>{finished=true;clearTimeout(timer);children.delete(child);resolve({code,out:out.trim(),err})})});return {send(sql){child.stdin.write(sql+'\n')},async marker(value){const end=Date.now()+10000;while(!out.includes(value)){if(finished||Date.now()>end)throw Error('Missing phone test barrier '+value+' '+err);await new Promise(r=>setTimeout(r,25))}},finish(sql='commit;'){child.stdin.end(sql+'\n');return done}}}
 async function run(target,sql){const r=await session(target).finish(sql);if(r.code!==0)throw Error(r.err);return r.out}
 async function locked(application){const end=Date.now()+10000;while(Date.now()<end){if(await run(url,`select exists(select 1 from pg_stat_activity where application_name='${application}' and wait_event_type='Lock')`)==='t')return;await new Promise(r=>setTimeout(r,25))}throw Error('Expected phone account lock wait not observed')}
 const id=n=>'15200000-0000-4000-8000-'+String(n).padStart(12,'0'),hash='a'.repeat(64),dest='+821000000000';
 const payload=n=>JSON.stringify({id:id(n),purpose:n===1?'signup_owner':'signup_staff',username:'synthetic'+n,proof_hash:hash});
 await run(admin,`drop database if exists ${name} with(force);create database ${name};`);
 try{
  await run(url,readFileSync(new URL('./fixtures/phone-account-foundation.sql',import.meta.url),'utf8'));
  await run(url,readFileSync(new URL('../security/sms-service-production-before-152.sql',import.meta.url),'utf8')+';');
  await run(url,`create function public.manee_sms_service(p_action text,p_payload jsonb default '{}') returns jsonb language sql set search_path='' as $$select private.manee_sms_service(p_action,p_payload)$$;`);
  await run(url,readFileSync(new URL('../supabase/migrations/20261105155942_one_phone_one_account.sql',import.meta.url),'utf8'));
  await run(url,`insert into private.manee_sms_challenges(id,purpose,username,phone_e164,phone_hash,proof_hash,status,proof_expires_at) values('${id(1)}','signup_owner','synthetic1','${dest}','${hash}','${hash}','verified',now()+interval '10 minutes'),('${id(2)}','signup_staff','synthetic2','${dest}','${hash}','${hash}','verified',now()+interval '10 minutes');`);
  const a=session(url);a.send(`begin;set role service_role;select public.manee_sms_service('claim','${payload(1)}');select 'PHONE_CLAIM_HELD';`);await a.marker('PHONE_CLAIM_HELD');
  const b=run(url,`set application_name='manee_phone_claim_waiter';set role service_role;select public.manee_sms_service('claim','${payload(2)}');`);await locked('manee_phone_claim_waiter');assert.equal((await a.finish()).code,0);
  assert.deepEqual(JSON.parse(await b),{ok:false,error:'phone_taken'});assert.equal(await run(url,"select count(*) from private.manee_sms_challenges where status='consuming'"),'1');
  const stale=await session(url).finish(`begin isolation level repeatable read;set role service_role;select public.manee_sms_service('claim','${payload(2)}');commit;`);assert.notEqual(stale.code,0);assert.match(stale.err,/40001/);
 }finally{for(const child of children)child.kill('SIGTERM');await run(admin,`drop database if exists ${name} with(force)`)}
});
