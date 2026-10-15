// Disposable local/CI PostgreSQL only. Never connects to Supabase.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFileSync} from 'node:fs';
const base=process.env.MANEE_TEST_DATABASE_URL;
test('Real PostgreSQL: store creation serializes with launch and stale snapshots cannot bypass enrollment',{skip:!base},async()=>{
 assert.match(base,/^postgresql:\/\/postgres:[^@]+@(?:127\.0\.0\.1|localhost):5432\/manee_code_test$/);
 const database='manee_new_store_billing_test',admin=base.replace(/\/manee_code_test$/,'/postgres'),url=base.replace(/\/manee_code_test$/,'/'+database),children=new Set();
 function session(target){
  const child=spawn('psql',[target,'-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose'],{stdio:['pipe','pipe','pipe']});
  children.add(child);let out='',err='',finished=false;const timer=setTimeout(()=>child.kill('SIGKILL'),30000);
  child.stdout.on('data',b=>out+=b);child.stderr.on('data',b=>err+=b);
  const done=new Promise(resolve=>{child.on('error',e=>{err+=e.message;});child.on('close',code=>{finished=true;clearTimeout(timer);children.delete(child);resolve({code,out:out.trim(),err});});});
  return {send(sql){child.stdin.write(sql+'\n');},async marker(value){
   const end=Date.now()+10000;while(!out.includes(value)){if(finished||Date.now()>end)throw Error('Missing session barrier '+value+' '+err);await new Promise(r=>setTimeout(r,25));}
  },async finish(sql='commit;'){child.stdin.end(sql+'\n');return done;}};
 }
 async function run(target,sql){const s=session(target);const r=await s.finish(sql);if(r.code!==0)throw Error(r.err);return r.out;}
 async function locked(application){
  const end=Date.now()+10000;while(Date.now()<end){
   if(await run(url,`select exists(select 1 from pg_stat_activity where application_name='${application}' and wait_event_type='Lock')`)==='t')return;
   await new Promise(r=>setTimeout(r,25));
  }throw Error('Expected lock wait was not observed: '+application);
 }
 const id=n=>'80000000-0000-4000-8000-'+String(n).padStart(12,'0');
 await run(admin,`drop database if exists ${database} with (force)`);await run(admin,`create database ${database}`);
 try{
  await run(url,`do $$begin
   if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin;end if;
   if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin;end if;
   if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls;end if;
  end $$;create schema private;create table public.stores(id uuid primary key,created_at timestamptz default now());
  create table private.store_billing_enforcement(store_id uuid primary key references public.stores(id) on delete cascade,environment text,enabled_at timestamptz default now());`);
  await run(url,readFileSync(new URL('../supabase/migrations/20261015134721_new_store_billing_rollout.sql',import.meta.url),'utf8'));
  // A prelaunch store's shared lock makes launch wait for that transaction.
  const before=session(url);before.send(`begin;insert into public.stores(id) values('${id(1)}');select 'STORE_BEFORE_LAUNCH';`);await before.marker('STORE_BEFORE_LAUNCH');
  const launching=run(url,"set application_name='rollout_launch_waiter';select private.manee_launch_new_store_billing();");
  await locked('rollout_launch_waiter');assert.equal((await before.finish()).code,0);await launching;
  assert.equal(await run(url,`select count(*) from private.store_billing_enforcement where store_id='${id(1)}'`),'0');
  // A launch already holding its lock makes the next store see the new state.
  await run(url,'update private.new_store_billing_rollout set launched_at=null;');
  const activation=session(url);activation.send("begin;select private.manee_launch_new_store_billing();select 'LAUNCH_HELD';");await activation.marker('LAUNCH_HELD');
  const creating=run(url,`set application_name='rollout_store_waiter';insert into public.stores(id,created_at) values('${id(2)}','1900-01-01');`);
  await locked('rollout_store_waiter');assert.equal((await activation.finish()).code,0);await creating;
  assert.equal(await run(url,`select environment from private.store_billing_enforcement where store_id='${id(2)}'`),'Production');
  // A transaction that cached an older policy cannot commit a free store.
  await run(url,'update private.new_store_billing_rollout set launched_at=null;');
  const stale=session(url);stale.send("begin isolation level repeatable read;select count(*) from public.stores;select 'OLD_SNAPSHOT';");await stale.marker('OLD_SNAPSHOT');
  await run(url,'select private.manee_launch_new_store_billing();');
  const rejected=await stale.finish(`insert into public.stores(id) values('${id(3)}');commit;`);
  assert.notEqual(rejected.code,0);assert.match(rejected.err,/40001/);
  assert.equal(await run(url,`select count(*) from public.stores where id='${id(3)}'`),'0');
  await Promise.all(Array.from({length:12},(_,i)=>run(url,`insert into public.stores(id) values('${id(100+i)}');`)));
  assert.equal(await run(url,'select count(*) from private.store_billing_enforcement'),'13');
 }finally{
  for(const child of children)child.kill('SIGTERM');
  await run(admin,`drop database if exists ${database} with (force)`);
 }
});
