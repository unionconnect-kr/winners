import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const owner='10000000-0000-4000-8000-000000000001',staff='10000000-0000-4000-8000-000000000002',outsider='10000000-0000-4000-8000-000000000003';
const store='20000000-0000-4000-8000-000000000001',other='20000000-0000-4000-8000-000000000002';
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
test('checklist photo database contracts use the actual migration and PostgreSQL triggers',async t=>{
 const db=new PGlite();
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema private;
 create table auth.users(id uuid primary key);insert into auth.users values('${owner}'),('${staff}'),('${outsider}');
 create table public.profiles(user_id uuid,display_name text,username text);
 insert into profiles values('${owner}','Owner','owner'),('${staff}','Staff','staff');
 create table public.stores(id uuid primary key,archived_at timestamptz,business_day_cutoff_hour int);
 insert into stores values('${store}',null,6),('${other}',null,6);
 create table public.checklist_templates(store_id uuid,tab text,data jsonb,primary key(store_id,tab));
 create table public.checklist_checks(store_id uuid,date date,item_id text,checked boolean,checked_at timestamptz,checked_by text,primary key(store_id,date,item_id));
 create table public.checklist_log(store_id uuid,date date,done int,total int,closed_at timestamptz,primary key(store_id,date));
 create table public.checklist_history(store_id uuid,date date,revision int,done int,total int,closed_at timestamptz,closed_by text,reason text,items jsonb,checks jsonb,primary key(store_id,date,revision));
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('app.uid',true),'')::uuid$$;
 create function private.is_live_manee_session() returns boolean language sql stable as $$select current_setting('app.live',true)='yes' and auth.uid() is not null$$;
 create function private.has_store_membership(s uuid,r text[] default null) returns boolean language sql stable as $$select private.is_live_manee_session() and s='${store}' and auth.uid() in ('${owner}','${staff}')$$;
 create function private.can_manage_store(s uuid) returns boolean language sql stable as $$select private.has_store_membership(s,null) and auth.uid()='${owner}'$$;
 create function private.manee_checklist_due(i jsonb,d date) returns boolean language sql immutable as $$select true$$;
 create function private.manee_guard_billed_write() returns trigger language plpgsql as $$begin if current_setting('app.billing',true)='no' then raise exception 'expired' using errcode='P4402';end if;if TG_OP='DELETE' then return old;end if;return new;end$$;
 grant usage on schema private,auth,public to authenticated;`);
 const safe=readFileSync(new URL('./attachment-structure.sql',import.meta.url),'utf8');
 await db.exec(safe.slice(safe.indexOf('CREATE OR REPLACE FUNCTION private.manee_file_uint'),safe.indexOf('CREATE OR REPLACE FUNCTION private.manee_validate_attachments')));
 const file=readdirSync(new URL('../supabase/migrations',import.meta.url)).find(f=>f.endsWith('_checklist_photo_evidence.sql'));
 await db.exec(readFileSync(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
 const uid=async id=>{await db.query("select set_config('app.uid',$1,false),set_config('app.live','yes',false),set_config('app.billing','yes',false)",[id]);};
 await uid(owner);
 const date=(await db.query("select ((now() at time zone 'Asia/Seoul')-interval '6 hours')::date::text as d")).rows[0].d;
 const templates={morning:[{id:'category',name:'마감',items:[{id:'photo',label:'주방 청소',photoRequired:true},{id:'plain',label:'소등 확인'},{id:'off',label:'테이블 정리',photoRequired:false}]}]};
 const rpc=(action,payload={},sid=store)=>db.query('select private.manee_checklist($1,$2,$3,$4) as result',[action,sid,date,payload]);
 await rpc('templates',{items:templates});
 await t.test('legacy items without photoRequired still complete without a photo',async()=>{await uid(staff);await rpc('check',{item_id:'plain',checked:true});assert.equal((await db.query("select checked from checklist_checks where item_id='plain'")).rows[0].checked,true);});
 await t.test('required photos cannot be omitted by old clients or direct writes',async()=>{await assert.rejects(rpc('check',{item_id:'photo',checked:true}),/완료 사진/);await assert.rejects(db.query('insert into checklist_checks(store_id,date,item_id,checked) values($1,$2,$3,true)',[store,date,'photo']),/완료 사진/);});
 await t.test('disabled photo collection does not accept attached files',async()=>{await assert.rejects(rpc('check',{item_id:'off',checked:true,photo:{type:'image/png',data:png}}),/사진을 받지/);});
 await t.test('staff cannot change photo collection settings',async()=>{await assert.rejects(rpc('templates',{items:templates}),/Manager required/);await assert.rejects(db.query('update checklist_templates set data=data where store_id=$1',[store]),/Owner required/);});
 await t.test('invalid image bytes and MIME cannot produce a completed check',async()=>{await assert.rejects(rpc('check',{item_id:'photo',checked:true,photo:{type:'image/jpeg',data:png}}),/사진 형식/);await assert.rejects(rpc('check',{item_id:'photo',checked:true,photo:{type:'image/svg+xml',data:png}}),/사진 형식/);assert.equal((await db.query("select count(*)::int as n from checklist_checks where item_id='photo'")).rows[0].n,0);});
 let photo;
 await t.test('valid image and completion are saved together with a server evidence ID',async()=>{await rpc('check',{item_id:'photo',checked:true,photo:{type:'image/png',data:png},expected_items:templates});photo=(await db.query("select photo_id from checklist_checks where item_id='photo'")).rows[0].photo_id;assert.ok(photo);assert.equal((await db.query('select uploaded_by from manee_checklist_photos where id=$1',[photo])).rows[0].uploaded_by,staff);});
 await t.test('another store cannot reuse an evidence ID or read the image',async()=>{await assert.rejects(db.query('insert into checklist_checks(store_id,date,item_id,checked,photo_id) values($1,$2,$3,true,$4)',[store,date,'plain',photo]),/사진과 점검 항목/);await assert.rejects(db.query('select public.manee_checklist_photo($1,$2)',[other,photo]),/Membership/);await uid(outsider);await assert.rejects(db.query('select public.manee_checklist_photo($1,$2)',[store,photo]),/Membership/);await uid(staff);});
 await t.test('staff cannot approve evidence; owner approval is server recorded',async()=>{await assert.rejects(rpc('review-photo',{photo_id:photo}),/Owner/);await uid(owner);const r=(await rpc('review-photo',{photo_id:photo})).rows[0].result.photo;assert.equal(r.reviewed_by,owner);assert.ok(r.reviewed_at);});
 await t.test('metadata reads cannot select raw image bytes directly',async()=>{await db.exec('set role authenticated');try{assert.equal((await db.query('select id from manee_checklist_photos')).rows.length,1);await assert.rejects(db.query('select image_base64 from manee_checklist_photos'),/permission denied/);assert.equal((await db.query('select public.manee_checklist_photo($1,$2) as p',[store,photo])).rows[0].p.image_base64,png);}finally{await db.exec('reset role');}});
 await t.test('expired accounts cannot upload or approve evidence',async()=>{await db.query("select set_config('app.billing','no',false)");await assert.rejects(rpc('review-photo',{photo_id:photo}),e=>e.code==='P4402');await assert.rejects(rpc('check',{item_id:'photo',checked:true,photo:{type:'image/png',data:png}}),e=>e.code==='P4402');await uid(owner);});
 await t.test('closing and resetting keep historical evidence readable',async()=>{await rpc('close',{reason:'remaining task',expected_items:templates});assert.equal((await db.query('select photos from checklist_history')).rows[0].photos.photo,photo);await rpc('reopen');await rpc('reset');assert.equal((await db.query('select count(*)::int as n from checklist_checks')).rows[0].n,0);assert.equal((await db.query('select public.manee_checklist_photo($1,$2) as p',[store,photo])).rows[0].p.id,photo);});
 await t.test('a revoked session cannot read old evidence',async()=>{await db.query("select set_config('app.live','no',false)");await assert.rejects(db.query('select public.manee_checklist_photo($1,$2)',[store,photo]),/Membership/);});
 await db.exec(`create schema storage;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text unique,owner_id text,metadata jsonb);
 alter table storage.objects enable row level security;
 grant usage on schema storage to authenticated;
 grant select,insert,delete on storage.objects to authenticated;
 create function private.manee_store_write_entitled(s uuid) returns boolean language sql stable as $$select current_setting('app.billing',true)<>'no'$$;`);
 const multi=readdirSync(new URL('../supabase/migrations',import.meta.url)).find(f=>f.endsWith('_checklist_multi_photo_storage.sql'));
 await db.exec(readFileSync(new URL('../supabase/migrations/'+multi,import.meta.url),'utf8'));
 await uid(staff);
 const prepare=async(count=4,sid=store,item='photo',request=crypto.randomUUID())=>(await db.query('select public.manee_checklist_prepare_photos($1,$2,$3,$4,$5,$6) as r',[sid,date,item,count,request,templates])).rows[0].r.photos;
 const upload=async tickets=>{
  // The Edge Function's service client creates store-owned objects (no user owner_id).
  for(const ticket of tickets)for(const path of [ticket.object_path,ticket.thumbnail_path])await db.query("insert into storage.objects(bucket_id,name,owner_id,metadata) values('manee-checklist-evidence',$1,null,$2)",[path,{mimetype:'image/jpeg',size:100}]);
 };
 let tickets;
 await t.test('multi-photo reservation rejects a fifth picture, wrong store and disabled collection',async()=>{
  await assert.rejects(prepare(5),/1~4장/);await assert.rejects(prepare(1,other),/Membership/);await assert.rejects(prepare(1,store,'off'),/사진을 받는/);
  tickets=await prepare();assert.equal(tickets.length,4);assert.equal(new Set(tickets.map(p=>p.id)).size,4);
 });
 await t.test('customers cannot directly upload arbitrary or reserved files to the private bucket',async()=>{
  await db.exec('set role authenticated');try{
   await assert.rejects(db.query("insert into storage.objects(bucket_id,name,owner_id,metadata) values('manee-checklist-evidence','arbitrary/file.jpg',$1,$2)",[staff,{mimetype:'image/jpeg',size:100}]),/row-level security/);
   await assert.rejects(db.query("insert into storage.objects(bucket_id,name,owner_id,metadata) values('manee-checklist-evidence',$1,$2,$3)",[tickets[0].thumbnail_path,staff,{mimetype:'image/jpeg',size:40000}]),/row-level security/);
  }finally{await db.exec('reset role');}
  await upload(tickets);
 });
 await t.test('four pictures and completion commit together; duplicate IDs and incomplete uploads do not',async()=>{
  await assert.rejects(rpc('check',{item_id:'photo',checked:true,photos:[tickets[0].id,tickets[0].id]}),/중복/);
  const missing=await prepare(1);await assert.rejects(rpc('check',{item_id:'photo',checked:true,photos:missing.map(p=>p.id)}),/완료되지/);
  const ids=tickets.map(p=>p.id);await rpc('check',{item_id:'photo',checked:true,photos:ids,expected_items:templates});
  const row=(await db.query("select photo_id,photo_ids from checklist_checks where item_id='photo'")).rows[0];assert.deepEqual(row.photo_ids,ids);assert.equal(row.photo_id,ids[0]);
  assert.equal((await db.query('select count(*)::int as n from manee_checklist_photos where object_path is not null and image_base64 is null')).rows[0].n,4);
  await rpc('check',{item_id:'photo',checked:true,photos:ids,expected_items:templates});
 });
 await t.test('committed files are readable to members and cannot be removed by upload cleanup',async()=>{
  await db.exec('set role authenticated');try{
   assert.equal((await db.query('select * from storage.objects')).rows.length,8);
   assert.equal((await db.query('delete from storage.objects where name=$1 returning id',[tickets[0].object_path])).rows.length,0);
   await assert.rejects(db.query('select * from private.manee_checklist_uploads'),/permission denied/);
  }finally{await db.exec('reset role');}
  await uid(outsider);await db.exec('set role authenticated');try{assert.equal((await db.query('select * from storage.objects')).rows.length,0);}finally{await db.exec('reset role');}
  await uid(staff);await db.query("select set_config('app.live','no',false)");await db.exec('set role authenticated');try{assert.equal((await db.query('select * from storage.objects')).rows.length,0);}finally{await db.exec('reset role');}await uid(owner);
 });
 await t.test('multi-photo history keeps ordered IDs and legacy inline evidence remains readable',async()=>{
  await rpc('close',{reason:'remaining tasks'});const latest=(await db.query('select photos,photo_sets from checklist_history order by revision desc limit 1')).rows[0];
  assert.deepEqual(latest.photo_sets.photo,tickets.map(p=>p.id));assert.equal(latest.photos.photo,tickets[0].id);
  assert.equal((await db.query('select public.manee_checklist_photo($1,$2) as p',[store,photo])).rows[0].p.image_base64,png);
 });
 const versionFile=readdirSync(new URL('../supabase/migrations',import.meta.url)).find(f=>f.endsWith('_mobile_update_policy.sql'));
 await db.exec(readFileSync(new URL('../supabase/migrations/'+versionFile,import.meta.url),'utf8'));
 await t.test('update policy defaults off and is readable but not editable by app users',async()=>{
  for(const role of ['anon','authenticated']){await db.exec('set role '+role);try{const rows=(await db.query('select * from manee_mobile_update_policy')).rows;assert.equal(rows.length,2);assert.ok(rows.every(r=>r.enabled===false));await assert.rejects(db.query("update manee_mobile_update_policy set enabled=true"),/permission denied/);}finally{await db.exec('reset role');}}
  await assert.rejects(db.query("update manee_mobile_update_policy set enabled=true where platform='android'"),/check constraint/);
 });
 await t.test('store-owned evidence remains available when the uploading staff account is deleted',async()=>{
  await uid(owner);await db.query('delete from auth.users where id=$1',[staff]);assert.equal((await db.query('select uploaded_by from manee_checklist_photos where id=$1',[tickets[0].id])).rows[0].uploaded_by,null);
  await db.exec('set role authenticated');try{assert.equal((await db.query('select * from storage.objects')).rows.length,8);assert.equal((await db.query('select public.manee_checklist_photo($1,$2) as p',[store,tickets[0].id])).rows[0].p.id,tickets[0].id);}finally{await db.exec('reset role');}
 });
 }finally{await db.close();}
});
