import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const snapshot=JSON.parse(read('../security/fixtures/remaining-security-snapshot.json'));
const images=JSON.parse(read('../security/fixtures/attachment-samples.json'));
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
test('profile guard preserves AAL1/AAL2 self access, blocks dead/foreign sessions and rolls back exactly',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role authenticated;create role anon;create role service_role;create schema auth;create schema private;
 create function auth.jwt() returns jsonb language sql as $$select nullif(current_setting('request.jwt.claims',true),'')::jsonb$$;
 create function auth.uid() returns uuid language sql as $$select (auth.jwt()->>'sub')::uuid$$;
 create table auth.sessions(id uuid,user_id uuid,aal text,not_after timestamptz);
 create table public.profiles(user_id uuid,status text);
 create table private.manee_security_policy_backup(change_id text,table_name text,policy_name text,original_qual text,applied_qual text,primary key(change_id,table_name,policy_name));
 grant usage on schema auth,private to authenticated,anon;grant select on public.profiles to authenticated,anon;
 alter table public.profiles enable row level security;
 create policy profiles_select_self on public.profiles for select to authenticated using (${snapshot.prod.profile_policy.qual});
 insert into public.profiles values('${id(1)}','active'),('${id(2)}','active'),('${id(3)}','disabled');
 insert into auth.sessions values('${id(101)}','${id(1)}','aal1',null),('${id(102)}','${id(2)}','aal2',null),('${id(103)}','${id(3)}','aal1',null);`);
 await db.exec(snapshot.prod.functions.find(f=>f.name==='is_live_manee_session').definition);
 const visible=async(n,sid=100+n,aal='aal1')=>{
  await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:id(n),session_id:id(sid),role:'authenticated',aal})]);
  await db.exec('set role authenticated');try{return (await db.query('select count(*)::int n from public.profiles')).rows[0].n}finally{await db.exec('reset role')}
 };
 await db.exec('begin;'+read('../security/profile-session-guard.sql')+'commit;');
 assert.equal(await visible(1),1);assert.equal(await visible(2,102,'aal2'),1);
 assert.equal(await visible(1,102),0);assert.equal(await visible(3),0);
 await db.exec("update auth.sessions set not_after=now()-interval '1 minute'");assert.equal(await visible(1),0);
 await db.exec('delete from auth.sessions');assert.equal(await visible(2),0);
 await db.exec('set role anon');assert.equal((await db.query('select count(*)::int n from public.profiles')).rows[0].n,0);await db.exec('reset role');
 await db.exec('begin;'+read('../security/profile-session-guard-rollback.sql')+'commit;');assert.equal(await visible(1),1);
 assert.equal((await db.query("select qual from pg_policies where policyname='profiles_select_self'")).rows[0].qual,snapshot.prod.profile_policy.qual);
 await db.exec("delete from private.manee_security_policy_backup;alter policy profiles_select_self on public.profiles using(false)");
 await assert.rejects(db.exec('begin;'+read('../security/profile-session-guard.sql')+'commit;'),/changed since review/);await db.exec('rollback');
 }finally{await db.close()}
});
test('attachments: real baseline/progressive JPEG, PNG, WebP and PDF accepted; forged headers/truncation/active PDFs rejected',async()=>{
 const db=new PGlite();try{
 await db.exec('create schema private;create role anon;create role authenticated;create role service_role;create table public.sales_reports(id int,settlement_photos jsonb,receipt_photos jsonb,note_photos jsonb,label text);create table public.manee_contract_documents(id int,attachment_type text,attachment_base64 text)');
 await db.exec(read('../security/attachment-structure.sql'));
 const valid=async(s,mime)=>(await db.query('select private.manee_safe_file($1,$2,5242880) ok',[s,mime])).rows[0].ok;
 for(const [key,mime] of [['jpeg','image/jpeg'],['progressive_jpeg','image/jpeg'],['png','image/png'],['webp','image/webp'],['pdf','application/pdf']]){
  assert.equal(await valid(images[key],mime),true,key);
  assert.equal(await valid(Buffer.from(images[key],'base64').subarray(0,12).toString('base64'),mime),false,key+' truncation');
 }
 const fakePng=Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),Buffer.from('not-an-image')]).toString('base64');
 assert.equal(await valid(fakePng,'image/png'),false);
 assert.equal(await valid(Buffer.from('%PDF-1.7\nnot a pdf\n%%EOF').toString('base64'),'application/pdf'),false);
 for(const name of ['JavaScript','J#53','OpenAction','EmbeddedFile','ObjStm','Encrypt']){
  const active=Buffer.from(Buffer.from(images.pdf,'base64').toString('latin1').replace('/Catalog','/Catalog /'+name),'latin1').toString('base64');
  assert.equal(await valid(active,'application/pdf'),false,name);
 }
 const pngUri='data:image/png;base64,'+images.png;
 await db.query('insert into public.sales_reports values(1,$1,null,null,$2)',[JSON.stringify([pngUri]),'valid']);
 for(const photos of [[{url:pngUri}],['https://example.invalid/a.png'],['data:image/png;base64,'+fakePng],Array(21).fill(pngUri)])
  await assert.rejects(db.query('insert into public.sales_reports(id,receipt_photos) values(2,$1)',[JSON.stringify(photos)]),e=>e.code==='22023');
 // Historical invalid data is preserved on unrelated edits, but cannot be copied into another row.
 await db.exec("alter table public.sales_reports disable trigger manee_validate_attachments;insert into public.sales_reports values(3,'[\"legacy\"]',null,null,'old');alter table public.sales_reports enable trigger manee_validate_attachments");
 await db.exec("update public.sales_reports set label='changed' where id=3");
 await db.query('update public.sales_reports set settlement_photos=$1 where id=3',[JSON.stringify(['legacy',pngUri])]);
 await assert.rejects(db.exec("insert into public.sales_reports(id,settlement_photos) select 4,settlement_photos from public.sales_reports where id=3"),e=>e.code==='22023');
 await db.query('insert into public.manee_contract_documents values(1,$1,$2)',['application/pdf',images.pdf]);
 await assert.rejects(db.query('update public.manee_contract_documents set attachment_type=$1 where id=1',['image/png']),e=>e.code==='22023');
 const before=(await db.query('select * from public.sales_reports order by id')).rows;
 await db.exec('begin;'+read('../security/attachment-structure-rollback.sql')+'commit;');
 assert.deepEqual((await db.query('select * from public.sales_reports order by id')).rows,before);
 assert.equal((await db.query("select to_regprocedure('private.manee_safe_file(text,text,integer)') gone")).rows[0].gone,null);
 }finally{await db.close()}
});
test('SMS retention: established seven-day boundary, in-flight proofs and bindings retained; maintenance unavailable to clients',async()=>{
 const db=new PGlite();try{
 await db.exec(`create schema private;create schema auth;create role anon;create role authenticated;create role service_role;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 create table private.manee_sms_challenges(id uuid,created_at timestamptz,expires_at timestamptz,proof_expires_at timestamptz,status text);
 create table private.manee_sms_bindings(user_id uuid);insert into private.manee_sms_bindings values('${id(1)}');
 insert into private.manee_sms_challenges values
 ('${id(1)}',now()-interval '8 days',now()-interval '7 days',null,'sent'),
 ('${id(2)}',now()-interval '8 days',now()-interval '7 days',now()-interval '7 days','completed'),
 ('${id(3)}',now()-interval '1 day',now()-interval '1 hour',null,'sent'),
 ('${id(4)}',now()-interval '8 days',now()-interval '7 days',now()+interval '1 hour','verified'),
 ('${id(5)}',now()-interval '8 days',now()-interval '7 days',null,'consuming');`);
 await db.exec(read('../security/sms-challenge-retention.sql'));
 assert.equal((await db.query('select private.manee_purge_expired_sms_challenges(1) n')).rows[0].n,1);
 assert.equal((await db.query('select private.manee_purge_expired_sms_challenges(500) n')).rows[0].n,1);
 assert.equal((await db.query('select count(*)::int n from private.manee_sms_challenges')).rows[0].n,3);
 assert.equal((await db.query('select count(*)::int n from private.manee_sms_bindings')).rows[0].n,1);
 for(const role of ['anon','authenticated','service_role'])assert.equal((await db.query("select has_function_privilege($1,'private.manee_purge_expired_sms_challenges(integer)','execute') ok",[role])).rows[0].ok,false);
 for(const n of [0,-1,1001,null])await assert.rejects(db.query('select private.manee_purge_expired_sms_challenges($1)',[n]),e=>e.code==='22023');
 await db.query("select set_config('test.uid',$1,false)",[id(1)]);await assert.rejects(db.query('select private.manee_purge_expired_sms_challenges(10)'),e=>e.code==='42501');
 }finally{await db.close()}
});
