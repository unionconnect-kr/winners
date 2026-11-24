begin;
-- Evidence follows the same private, authenticated database attachment model
-- as existing MANEE receipts. No public bucket or image URL is introduced.
set local lock_timeout='5s';
set local statement_timeout='60s';
create table public.manee_checklist_photos(
 id uuid primary key default gen_random_uuid(),
 store_id uuid not null references public.stores(id) on delete cascade,
 date date not null,
 item_id text not null check(length(item_id) between 1 and 120),
 item_label text not null check(length(item_label) between 1 and 1000),
 uploaded_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default clock_timestamp(),
 image_type text not null check(image_type in ('image/jpeg','image/png','image/webp')),
 image_base64 text not null,
 reviewed_at timestamptz,
 reviewed_by uuid references auth.users(id) on delete set null,
 constraint checklist_photo_image_valid check(private.manee_safe_file(image_base64,image_type,1048576))
);
create index manee_checklist_photos_store_date on public.manee_checklist_photos(store_id,date,item_id);
alter table public.manee_checklist_photos enable row level security;
revoke all on public.manee_checklist_photos from public,anon,authenticated;
grant select(id,store_id,date,item_id,item_label,uploaded_by,created_at,image_type,reviewed_at,reviewed_by)
 on public.manee_checklist_photos to authenticated;
create policy checklist_photos_store_read on public.manee_checklist_photos for select to authenticated
 using(private.is_live_manee_session() and private.has_store_membership(store_id,null));
alter table public.checklist_checks add column photo_id uuid;
alter table public.checklist_history add column photos jsonb not null default '{}'::jsonb;

create function private.manee_checklist_photo_guard() returns trigger
language plpgsql security definer set search_path='' as $$
declare required boolean;
begin
 if auth.uid() is null then return new;end if;
 if not private.is_live_manee_session() or not private.has_store_membership(new.store_id,null) then
  raise exception 'Membership required' using errcode='42501'; end if;
 select coalesce((it->>'photoRequired')::boolean,false) into required
 from public.checklist_templates t,lateral jsonb_array_elements(t.data) cat,
 lateral jsonb_array_elements(cat->'items') it
 where t.store_id=new.store_id and it->>'id'=new.item_id limit 1;
 if new.checked and coalesce(required,false) and new.photo_id is null then
  raise exception '완료 사진을 첨부해 주세요.' using errcode='22023';end if;
 if new.photo_id is not null and not exists(select 1 from public.manee_checklist_photos p
  where p.id=new.photo_id and p.store_id=new.store_id and p.date=new.date and p.item_id=new.item_id) then
  raise exception '사진과 점검 항목이 일치하지 않아요.' using errcode='22023';end if;
 return new;
end $$;
revoke all on function private.manee_checklist_photo_guard() from public,anon,authenticated;
create trigger manee_checklist_photo_guard before insert or update on public.checklist_checks
 for each row execute function private.manee_checklist_photo_guard();

create function private.manee_checklist_template_photo_guard() returns trigger
language plpgsql security definer set search_path='' as $$
declare category jsonb; item jsonb;
begin
 if auth.uid() is not null and not private.can_manage_store(new.store_id) then raise exception 'Owner required' using errcode='42501';end if;
 for category in select value from jsonb_array_elements(new.data) loop
  for item in select value from jsonb_array_elements(category->'items') loop
   if item ? 'photoRequired' and jsonb_typeof(item->'photoRequired') is distinct from 'boolean' then
    raise exception '사진 첨부 설정을 확인해 주세요.' using errcode='22023';end if;
  end loop;
 end loop;
 return new;
end $$;
revoke all on function private.manee_checklist_template_photo_guard() from public,anon,authenticated;
create trigger manee_checklist_template_photo_guard before insert or update on public.checklist_templates
 for each row execute function private.manee_checklist_template_photo_guard();

create trigger manee_billing_write_gate before insert or update or delete on public.manee_checklist_photos
 for each row execute function private.manee_guard_billed_write();

create function private.manee_checklist_photo(p_store_id uuid,p_photo_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null or not private.is_live_manee_session() or not private.has_store_membership(p_store_id,null) then
  raise exception 'Membership required' using errcode='42501';end if;
 select to_jsonb(p) into result from public.manee_checklist_photos p where p.store_id=p_store_id and p.id=p_photo_id;
 if result is null then raise exception '사진을 찾지 못했어요.' using errcode='22023';end if;
 return result;
end $$;
revoke all on function private.manee_checklist_photo(uuid,uuid) from public,anon;
grant execute on function private.manee_checklist_photo(uuid,uuid) to authenticated;
create function public.manee_checklist_photo(p_store_id uuid,p_photo_id uuid) returns jsonb
language sql set search_path='' as $$select private.manee_checklist_photo(p_store_id,p_photo_id);$$;
revoke all on function public.manee_checklist_photo(uuid,uuid) from public,anon;
grant execute on function public.manee_checklist_photo(uuid,uuid) to authenticated;

CREATE OR REPLACE FUNCTION private.manee_checklist(p_action text, p_store_id uuid, p_date date, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  st public.stores%rowtype; manager boolean; business_date date; item text;
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
        photo_uuid:=null;
        if p_payload ? 'photo' then
          if not coalesce((photo_item->>'photoRequired')::boolean,false) then raise exception '이 항목은 사진을 받지 않아요.' using errcode='22023';end if;
          if jsonb_typeof(p_payload->'photo') is distinct from 'object'
            or not private.manee_safe_file(p_payload->'photo'->>'data',p_payload->'photo'->>'type',1048576)
            or (p_payload->'photo'->>'type') not in ('image/jpeg','image/png','image/webp') then
            raise exception '사진 형식 또는 용량을 확인해 주세요.' using errcode='22023';end if;
          insert into public.manee_checklist_photos(store_id,date,item_id,item_label,uploaded_by,image_type,image_base64)
           values(p_store_id,p_date,item,photo_item->>'label',auth.uid(),p_payload->'photo'->>'type',p_payload->'photo'->>'data') returning id into photo_uuid;
        end if;
        insert into public.checklist_checks(store_id,date,item_id,checked,checked_at,checked_by,photo_id) values(p_store_id,p_date,item,true,clock_timestamp(),actor,photo_uuid)
          on conflict(store_id,date,item_id) do update set checked=true,checked_at=excluded.checked_at,checked_by=excluded.checked_by,photo_id=excluded.photo_id;
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
      insert into public.checklist_history(store_id,date,revision,done,total,closed_at,closed_by,reason,items,checks,photos)
       values(p_store_id,p_date,rev,done_count,total_count,clock_timestamp(),actor,coalesce(p_payload->>'reason',''),snapshot_items,snapshot_checks,snapshot_photos);
      insert into public.checklist_log(store_id,date,done,total,closed_at) values(p_store_id,p_date,done_count,total_count,clock_timestamp());
    end if;
  else raise exception 'Unknown action' using errcode='22023'; end if;
  return jsonb_build_object('ok',true,'checks',coalesce((select jsonb_object_agg(item_id,true) from public.checklist_checks where store_id=p_store_id and date=p_date and checked),'{}'::jsonb),
    'log',(select jsonb_build_object('done',done,'total',total,'closedAt',extract(epoch from closed_at)*1000) from public.checklist_log where store_id=p_store_id and date=p_date));
end;
$function$;
commit;
