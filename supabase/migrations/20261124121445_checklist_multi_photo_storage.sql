begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
do $$begin
 if (select md5(prosrc) from pg_proc where oid='private.manee_checklist(text,uuid,date,jsonb)'::regprocedure)<>'908190fb28a5cf23ca49b81dc38407e1' then
  raise exception 'Checklist RPC changed since review; reconcile before applying';
 end if;
end $$;
-- Legacy inline images stay readable; new evidence uses a private Storage bucket.
alter table public.manee_checklist_photos alter column image_base64 drop not null;
alter table public.manee_checklist_photos add column object_path text unique,add column thumbnail_path text unique;
alter table public.manee_checklist_photos drop constraint checklist_photo_image_valid;
alter table public.manee_checklist_photos add constraint checklist_photo_image_valid check(
 (image_base64 is not null and object_path is null and thumbnail_path is null and private.manee_safe_file(image_base64,image_type,1048576))
 or (image_base64 is null and image_type='image/jpeg' and object_path is not null and thumbnail_path is not null
     and object_path=store_id::text||'/'||date::text||'/'||uploaded_by::text||'/'||id::text||'/image.jpg'
     and thumbnail_path=store_id::text||'/'||date::text||'/'||uploaded_by::text||'/'||id::text||'/thumb.jpg'));
grant select(object_path,thumbnail_path) on public.manee_checklist_photos to authenticated;
alter table public.checklist_checks add column photo_ids uuid[] not null default '{}';
update public.checklist_checks set photo_ids=array[photo_id] where photo_id is not null;
alter table public.checklist_history add column photo_sets jsonb not null default '{}'::jsonb;

create table private.manee_checklist_uploads(
 id uuid primary key default gen_random_uuid(),request_id uuid not null,ordinal int not null check(ordinal between 1 and 4),
 store_id uuid not null references public.stores(id) on delete cascade,date date not null,item_id text not null,
 uploaded_by uuid not null references auth.users(id) on delete cascade,
 expires_at timestamptz not null default clock_timestamp()+interval '1 hour',committed boolean not null default false,
 unique(uploaded_by,request_id,ordinal)
);
alter table private.manee_checklist_uploads enable row level security;
revoke all on private.manee_checklist_uploads from public,anon,authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('manee-checklist-evidence','manee-checklist-evidence',false,358400,array['image/jpeg']);

create function private.manee_checklist_storage_access(p_name text,p_action text) returns boolean
language plpgsql security definer set search_path='' as $$
declare ticket private.manee_checklist_uploads; sid uuid;
begin
 if auth.uid() is null or not private.is_live_manee_session() then return false;end if;
 if p_action='read' then
  select p.store_id into sid from public.manee_checklist_photos p where p.object_path=p_name or p.thumbnail_path=p_name;
  if found then return private.has_store_membership(sid,null);end if;
 end if;
 select * into ticket from private.manee_checklist_uploads u
 where u.uploaded_by=auth.uid() and not u.committed
 and p_name in(u.store_id::text||'/'||u.date::text||'/'||u.uploaded_by::text||'/'||u.id::text||'/image.jpg',
               u.store_id::text||'/'||u.date::text||'/'||u.uploaded_by::text||'/'||u.id::text||'/thumb.jpg');
 if not found or not private.has_store_membership(ticket.store_id,null) then return false;end if;
 if p_action='delete' then
  select * into ticket from private.manee_checklist_uploads u where u.id=ticket.id and not u.committed for update;
  if not found then return false;end if;
 end if;
 if p_action='upload' then return ticket.expires_at>now() and private.manee_store_write_entitled(ticket.store_id);end if;
 return p_action in('read','delete');
end $$;
revoke all on function private.manee_checklist_storage_access(text,text) from public,anon;
grant execute on function private.manee_checklist_storage_access(text,text) to authenticated;
-- Only the authenticated upload Edge Function writes objects with the service key.
-- Objects belong to the store record rather than blocking deletion of a staff account.
-- Customers receive no INSERT or UPDATE policy for this bucket.
create policy manee_checklist_storage_read on storage.objects for select to authenticated
 using(bucket_id='manee-checklist-evidence' and private.manee_checklist_storage_access(name,'read'));
create policy manee_checklist_storage_cleanup on storage.objects for delete to authenticated
 using(bucket_id='manee-checklist-evidence' and private.manee_checklist_storage_access(name,'delete'));

create function private.manee_checklist_prepare_photos(p_store_id uuid,p_date date,p_item_id text,p_count int,p_request_id uuid,p_expected_items jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare st public.stores; item jsonb; snapshot jsonb; result jsonb; ticket private.manee_checklist_uploads; n int;
begin
 if auth.uid() is null or not private.is_live_manee_session() then raise exception 'Authentication required' using errcode='42501';end if;
 select * into st from public.stores where id=p_store_id and archived_at is null for update;
 if not found or not private.has_store_membership(p_store_id,null) then raise exception 'Membership required' using errcode='42501';end if;
 if not private.manee_store_write_entitled(p_store_id) then raise exception '매니 구독을 확인해 주세요.' using errcode='P4402';end if;
 if p_count is null or p_count not between 1 and 4 or p_request_id is null or p_date is null then raise exception '사진은 1~4장까지 첨부해 주세요.' using errcode='22023';end if;
 if not private.can_manage_store(p_store_id) and p_date<>((now() at time zone 'Asia/Seoul')-make_interval(hours=>coalesce(st.business_day_cutoff_hour,6)))::date then raise exception 'Only today can be changed' using errcode='42501';end if;
 if exists(select 1 from public.checklist_log where store_id=p_store_id and date=p_date) then raise exception 'Checklist already closed' using errcode='55000';end if;
 select coalesce(jsonb_object_agg(tab,data),'{}') into snapshot from public.checklist_templates where store_id=p_store_id;
 if p_expected_items is distinct from snapshot then raise exception '점검 항목이 변경됐어요. 다시 불러와 주세요.' using errcode='40001';end if;
 select it into item from public.checklist_templates t,lateral jsonb_array_elements(t.data) cat,lateral jsonb_array_elements(cat->'items') it
 where t.store_id=p_store_id and it->>'id'=p_item_id and private.manee_checklist_due(it,p_date) limit 1;
 if item is null or not coalesce((item->>'photoRequired')::boolean,false) then raise exception '사진을 받는 점검 항목이 아니에요.' using errcode='22023';end if;
 -- Serialize by store above; a request ID cannot be repurposed for another task.
 if exists(select 1 from private.manee_checklist_uploads u where u.uploaded_by=auth.uid() and u.request_id=p_request_id
 and (u.store_id<>p_store_id or u.date<>p_date or u.item_id<>p_item_id or u.ordinal>p_count or u.committed or u.expires_at<=now())) then raise exception '사진 업로드를 새로 시도해 주세요.' using errcode='40001';end if;
 if (select count(*) from private.manee_checklist_uploads where uploaded_by=auth.uid() and expires_at>now() and not committed)
  +greatest(p_count-(select count(*)::int from private.manee_checklist_uploads where uploaded_by=auth.uid() and request_id=p_request_id),0)>64 then
  raise exception '진행 중인 사진 첨부를 완료한 뒤 다시 시도해 주세요.' using errcode='54000';end if;
 for n in 1..p_count loop
  insert into private.manee_checklist_uploads(request_id,ordinal,store_id,date,item_id,uploaded_by)
  values(p_request_id,n,p_store_id,p_date,p_item_id,auth.uid()) on conflict(uploaded_by,request_id,ordinal) do nothing;
 end loop;
 select jsonb_agg(jsonb_build_object('id',u.id,'object_path',u.store_id::text||'/'||u.date::text||'/'||u.uploaded_by::text||'/'||u.id::text||'/image.jpg',
 'thumbnail_path',u.store_id::text||'/'||u.date::text||'/'||u.uploaded_by::text||'/'||u.id::text||'/thumb.jpg') order by ordinal) into result
 from private.manee_checklist_uploads u where u.uploaded_by=auth.uid() and u.request_id=p_request_id;
 if jsonb_array_length(result)<>p_count then raise exception '사진 수가 변경됐어요. 다시 시도해 주세요.' using errcode='40001';end if;
 return jsonb_build_object('photos',result);
end $$;
revoke all on function private.manee_checklist_prepare_photos(uuid,date,text,int,uuid,jsonb) from public,anon;
grant execute on function private.manee_checklist_prepare_photos(uuid,date,text,int,uuid,jsonb) to authenticated;
create function public.manee_checklist_prepare_photos(p_store_id uuid,p_date date,p_item_id text,p_count int,p_request_id uuid,p_expected_items jsonb) returns jsonb
language sql set search_path='' as $$select private.manee_checklist_prepare_photos(p_store_id,p_date,p_item_id,p_count,p_request_id,p_expected_items);$$;
revoke all on function public.manee_checklist_prepare_photos(uuid,date,text,int,uuid,jsonb) from public,anon;
grant execute on function public.manee_checklist_prepare_photos(uuid,date,text,int,uuid,jsonb) to authenticated;

create or replace function private.manee_checklist_photo_guard() returns trigger
language plpgsql security definer set search_path='' as $$
declare required boolean; pid uuid;
begin
 -- Legacy clients still write the first photo ID; normalize only that old path.
 if TG_OP='INSERT' and coalesce(cardinality(new.photo_ids),0)=0 and new.photo_id is not null then new.photo_ids=array[new.photo_id];
 elsif TG_OP='UPDATE' and new.photo_id is distinct from old.photo_id and new.photo_ids is not distinct from old.photo_ids then new.photo_ids=case when new.photo_id is null then '{}'::uuid[] else array[new.photo_id] end;end if;
 if coalesce(cardinality(new.photo_ids),0)>4 or cardinality(new.photo_ids)<>(select count(distinct x) from unnest(new.photo_ids) x)
 or new.photo_id is distinct from new.photo_ids[1] then raise exception '완료 사진은 최대 4장까지 첨부해 주세요.' using errcode='22023';end if;
 if auth.uid() is null then return new;end if;
 if not private.is_live_manee_session() or not private.has_store_membership(new.store_id,null) then raise exception 'Membership required' using errcode='42501';end if;
 select coalesce((it->>'photoRequired')::boolean,false) into required from public.checklist_templates t,lateral jsonb_array_elements(t.data) cat,
 lateral jsonb_array_elements(cat->'items') it where t.store_id=new.store_id and it->>'id'=new.item_id limit 1;
 if new.checked and coalesce(required,false) and cardinality(new.photo_ids)=0 then raise exception '완료 사진을 첨부해 주세요.' using errcode='22023';end if;
 foreach pid in array new.photo_ids loop
  if not exists(select 1 from public.manee_checklist_photos p where p.id=pid and p.store_id=new.store_id and p.date=new.date and p.item_id=new.item_id) then raise exception '사진과 점검 항목이 일치하지 않아요.' using errcode='22023';end if;
 end loop;
 return new;
end $$;
-- The updated checklist RPC is appended below. Preserve the public wrapper and ACL.
create function private.manee_checklist_commit_photos(p_store_id uuid,p_date date,p_item_id text,p_photos jsonb,p_label text) returns uuid[]
language plpgsql security definer set search_path='' as $$
declare ids uuid[]:='{}'; pid uuid; ticket private.manee_checklist_uploads; base text; full_object storage.objects; thumb_object storage.objects;
begin
 if auth.uid() is null or not private.is_live_manee_session() or not private.has_store_membership(p_store_id,null) then raise exception 'Membership required' using errcode='42501';end if;
 if jsonb_typeof(p_photos) is distinct from 'array' or jsonb_array_length(p_photos) not between 1 and 4 then raise exception '사진은 1~4장까지 첨부해 주세요.' using errcode='22023';end if;
 for pid in select value::uuid from jsonb_array_elements_text(p_photos) loop
  if pid=any(ids) then raise exception '사진이 중복됐어요.' using errcode='22023';end if;
  ids=array_append(ids,pid);
 end loop;
 if exists(select 1 from public.checklist_checks c where c.store_id=p_store_id and c.date=p_date and c.item_id=p_item_id and c.checked and c.photo_ids=ids) then return ids;end if;
 foreach pid in array ids loop
  select * into ticket from private.manee_checklist_uploads where id=pid for update;
  if not found or ticket.uploaded_by<>auth.uid() or ticket.store_id<>p_store_id or ticket.date<>p_date or ticket.item_id<>p_item_id or ticket.committed or ticket.expires_at<=now() then raise exception '사진 업로드를 다시 시도해 주세요.' using errcode='22023';end if;
  base=p_store_id::text||'/'||p_date::text||'/'||auth.uid()::text||'/'||pid::text;
  select * into full_object from storage.objects where bucket_id='manee-checklist-evidence' and name=base||'/image.jpg' for update;
  select * into thumb_object from storage.objects where bucket_id='manee-checklist-evidence' and name=base||'/thumb.jpg' for update;
  if full_object.id is null or thumb_object.id is null or full_object.owner_id is not null or thumb_object.owner_id is not null
   or full_object.metadata->>'mimetype' is distinct from 'image/jpeg' or thumb_object.metadata->>'mimetype' is distinct from 'image/jpeg'
   or coalesce((full_object.metadata->>'size')::bigint,0) not between 1 and 358400 or coalesce((thumb_object.metadata->>'size')::bigint,0) not between 1 and 32768 then raise exception '사진 업로드가 완료되지 않았어요.' using errcode='22023';end if;
  insert into public.manee_checklist_photos(id,store_id,date,item_id,item_label,uploaded_by,image_type,object_path,thumbnail_path)
   values(pid,p_store_id,p_date,p_item_id,p_label,auth.uid(),'image/jpeg',base||'/image.jpg',base||'/thumb.jpg');
  update private.manee_checklist_uploads set committed=true where id=pid;
 end loop;
 return ids;
end $$;
revoke all on function private.manee_checklist_commit_photos(uuid,date,text,jsonb,text) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION private.manee_checklist(p_action text, p_store_id uuid, p_date date, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  st public.stores%rowtype; manager boolean; business_date date; item text;
  photo_list uuid[]:='{}'; snapshot_sets jsonb;
  photo_uuid uuid; photo_item jsonb; photo_record public.manee_checklist_photos%rowtype; snapshot_photos jsonb;
  actor text; snapshot_items jsonb; snapshot_checks jsonb; rev int; ids text[]:=array[]::text[]; total_count int; done_count int; result jsonb; tab_entry record; category jsonb; entry jsonb;
begin
  if auth.uid() is null or not private.is_live_manee_session() then raise exception 'Authentication required' using errcode='42501'; end if;
  select * into st from public.stores where id=p_store_id and archived_at is null for update;
  if not found or not private.has_store_membership(p_store_id,null) then raise exception 'Membership required' using errcode='42501'; end if;
  manager:=private.can_manage_store(p_store_id);
  business_date:=((now() at time zone 'Asia/Seoul')-make_interval(hours=>coalesce(st.business_day_cutoff_hour,6)))::date;
  if p_date is null or (not manager and p_date<>business_date) then raise exception 'Only today can be changed' using errcode='42501'; end if;
  select coalesce(nullif(display_name,''),username) into actor from public.profiles where user_id=auth.uid();
  select coalesce(jsonb_object_agg(tab,data),'{}'::jsonb) into snapshot_items from public.checklist_templates where store_id=p_store_id;
  select coalesce(jsonb_object_agg(item_id,true),'{}'::jsonb) into snapshot_checks from public.checklist_checks where store_id=p_store_id and date=p_date and checked;
  if p_payload ? 'expected_items' and p_payload->'expected_items' is distinct from snapshot_items then raise exception '점검 항목이 변경됐어요. 새로 불러와 주세요.' using errcode='40001';end if;
  if p_action='close' and p_payload ? 'expected_checks' and p_payload->'expected_checks' is distinct from snapshot_checks then raise exception '점검 상태가 변경됐어요. 다시 확인해 주세요.' using errcode='40001';end if;
  if p_action='templates' and exists(select 1 from public.checklist_log where store_id=p_store_id and date=p_date) then raise exception 'Checklist already closed' using errcode='55000';end if;
  if p_action in ('templates','initialize') then
    if not manager then raise exception 'Manager required' using errcode='42501'; end if;
    if p_action='initialize' and exists(select 1 from public.checklist_templates where store_id=p_store_id) then
      return jsonb_build_object('ok',true); end if;
    if jsonb_typeof(p_payload->'items') is distinct from 'object' or octet_length(p_payload::text)>200000 then raise exception 'Invalid checklist' using errcode='22023'; end if;
    for tab_entry in select key,value from jsonb_each(p_payload->'items') loop
      if tab_entry.key not in ('morning','afternoon','routine') or jsonb_typeof(tab_entry.value)<>'array' then raise exception 'Invalid checklist' using errcode='22023'; end if;
      for category in select value from jsonb_array_elements(tab_entry.value) loop
        if jsonb_typeof(category->'items') is distinct from 'array' or jsonb_typeof(category->'id') is distinct from 'string'
          or jsonb_typeof(category->'name') is distinct from 'string' then raise exception 'Invalid category' using errcode='22023'; end if;
        for entry in select value from jsonb_array_elements(category->'items') loop
          if entry->>'id'=any(ids) then raise exception 'Duplicate item id' using errcode='22023';end if;
          ids:=array_append(ids,entry->>'id');
          if length(btrim(coalesce(entry->>'label','')))=0 then raise exception 'Empty label' using errcode='22023';end if;
          if entry ? 'schedule' then
            if coalesce(entry->'schedule'->>'kind','') not in ('daily','weekly','monthly') then raise exception 'Invalid schedule' using errcode='22023';end if;
            if entry->'schedule'->>'kind'='weekly' and ((entry->'schedule'->>'day') is null or (entry->'schedule'->>'day')::int not between 0 and 6) then raise exception 'Invalid weekday' using errcode='22023';end if;
            if entry->'schedule'->>'kind'='monthly' and ((entry->'schedule'->>'day') is null or (entry->'schedule'->>'day')::int not between 1 and 31) then raise exception 'Invalid month day' using errcode='22023';end if;
          end if;
          if jsonb_typeof(entry->'id') is distinct from 'string' or length(entry->>'id') not between 1 and 120
            or jsonb_typeof(entry->'label') is distinct from 'string' or length(entry->>'label')>1000 then raise exception 'Invalid item' using errcode='22023'; end if;
        end loop;
      end loop;
      insert into public.checklist_templates(store_id,tab,data) values(p_store_id,tab_entry.key,tab_entry.value)
        on conflict(store_id,tab) do update set data=excluded.data;
    end loop;
  elsif p_action='review-photo' then
    if not manager then raise exception 'Owner required' using errcode='42501';end if;
    photo_uuid:=(p_payload->>'photo_id')::uuid;
    update public.manee_checklist_photos set reviewed_at=coalesce(reviewed_at,clock_timestamp()),reviewed_by=coalesce(reviewed_by,auth.uid())
     where id=photo_uuid and store_id=p_store_id returning * into photo_record;
    if not found then raise exception '사진을 찾지 못했어요.' using errcode='22023';end if;
    return jsonb_build_object('ok',true,'photo',to_jsonb(photo_record));
  elsif p_action='reopen' then
    if not manager then raise exception 'Manager required' using errcode='42501'; end if;
    delete from public.checklist_log where store_id=p_store_id and date=p_date;
  elsif p_action in ('check','reset','close') then
    if exists(select 1 from public.checklist_log where store_id=p_store_id and date=p_date) then
      if p_action<>'close' then raise exception 'Checklist already closed' using errcode='55000'; end if;
    elsif p_action='reset' then
      if not manager then raise exception 'Manager required' using errcode='42501'; end if;
      delete from public.checklist_checks where store_id=p_store_id and date=p_date;
    elsif p_action='check' then
      item:=p_payload->>'item_id';
      if item is null or not exists(select 1 from public.checklist_templates t,
        lateral jsonb_array_elements(t.data) cat,lateral jsonb_array_elements(cat->'items') it
        where t.store_id=p_store_id and it->>'id'=item and private.manee_checklist_due(it,p_date)) then raise exception 'Unknown checklist item' using errcode='22023'; end if;
      if jsonb_typeof(p_payload->'checked') is distinct from 'boolean' then raise exception 'Invalid checkbox' using errcode='22023'; end if;
      if (p_payload->>'checked')::boolean then
        select it into photo_item from public.checklist_templates t,lateral jsonb_array_elements(t.data) cat,
          lateral jsonb_array_elements(cat->'items') it where t.store_id=p_store_id and it->>'id'=item limit 1;
        photo_uuid:=null;photo_list:='{}';
        if p_payload ? 'photos' then
          if p_payload ? 'photo' or not coalesce((photo_item->>'photoRequired')::boolean,false) then raise exception '사진 첨부 항목을 확인해 주세요.' using errcode='22023';end if;
          photo_list:=private.manee_checklist_commit_photos(p_store_id,p_date,item,p_payload->'photos',photo_item->>'label');
          photo_uuid:=photo_list[1];
        elsif p_payload ? 'photo' then
          if not coalesce((photo_item->>'photoRequired')::boolean,false) then raise exception '이 항목은 사진을 받지 않아요.' using errcode='22023';end if;
          if jsonb_typeof(p_payload->'photo') is distinct from 'object'
            or not private.manee_safe_file(p_payload->'photo'->>'data',p_payload->'photo'->>'type',1048576)
            or (p_payload->'photo'->>'type') not in ('image/jpeg','image/png','image/webp') then
            raise exception '사진 형식 또는 용량을 확인해 주세요.' using errcode='22023';end if;
          insert into public.manee_checklist_photos(store_id,date,item_id,item_label,uploaded_by,image_type,image_base64)
           values(p_store_id,p_date,item,photo_item->>'label',auth.uid(),p_payload->'photo'->>'type',p_payload->'photo'->>'data') returning id into photo_uuid;
        end if;
        if photo_uuid is not null and cardinality(photo_list)=0 then photo_list=array[photo_uuid];end if;
        insert into public.checklist_checks(store_id,date,item_id,checked,checked_at,checked_by,photo_id,photo_ids) values(p_store_id,p_date,item,true,clock_timestamp(),actor,photo_uuid,photo_list)
          on conflict(store_id,date,item_id) do update set checked=true,checked_at=excluded.checked_at,checked_by=excluded.checked_by,photo_id=excluded.photo_id,photo_ids=excluded.photo_ids;
      else delete from public.checklist_checks where store_id=p_store_id and date=p_date and item_id=item; end if;
    else
      select count(distinct it->>'id'),count(distinct it->>'id') filter(where exists(select 1 from public.checklist_checks c
        where c.store_id=p_store_id and c.date=p_date and c.item_id=it->>'id' and c.checked))
        into total_count,done_count from public.checklist_templates t,lateral jsonb_array_elements(t.data) cat,
        lateral jsonb_array_elements(cat->'items') it where t.store_id=p_store_id and private.manee_checklist_due(it,p_date);
      if done_count<total_count and length(btrim(coalesce(p_payload->>'reason','')))=0 then raise exception '미완료 항목이 있어요. 마감 이유를 입력해 주세요.' using errcode='22023';end if;
      if length(coalesce(p_payload->>'reason',''))>1000 then raise exception 'Reason too long' using errcode='22023';end if;
      select coalesce(max(revision),0)+1 into rev from public.checklist_history where store_id=p_store_id and date=p_date;
      select coalesce(jsonb_object_agg(item_id,photo_id),'{}'::jsonb) into snapshot_photos from public.checklist_checks where store_id=p_store_id and date=p_date and checked and photo_id is not null;
      select coalesce(jsonb_object_agg(item_id,to_jsonb(photo_ids)),'{}'::jsonb) into snapshot_sets from public.checklist_checks where store_id=p_store_id and date=p_date and checked and cardinality(photo_ids)>0;
      insert into public.checklist_history(store_id,date,revision,done,total,closed_at,closed_by,reason,items,checks,photos,photo_sets)
       values(p_store_id,p_date,rev,done_count,total_count,clock_timestamp(),actor,coalesce(p_payload->>'reason',''),snapshot_items,snapshot_checks,snapshot_photos,snapshot_sets);
      insert into public.checklist_log(store_id,date,done,total,closed_at) values(p_store_id,p_date,done_count,total_count,clock_timestamp());
    end if;
  else raise exception 'Unknown action' using errcode='22023'; end if;
  return jsonb_build_object('ok',true,'checks',coalesce((select jsonb_object_agg(item_id,true) from public.checklist_checks where store_id=p_store_id and date=p_date and checked),'{}'::jsonb),
    'log',(select jsonb_build_object('done',done,'total',total,'closedAt',extract(epoch from closed_at)*1000) from public.checklist_log where store_id=p_store_id and date=p_date));
end;
$function$;

commit;
