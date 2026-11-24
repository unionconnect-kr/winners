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
