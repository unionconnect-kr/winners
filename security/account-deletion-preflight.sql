-- Operator-only inventory, not an erasure command or public RPC.
-- After verifying identity, edit the three LOCAL settings below in a private
-- SQL Editor session. Keep the report and input identifiers out of Git/issues.
-- Empty subject = schema-only mode, with no customer row counts.
-- Preserve the verified username and linked crew IDs before deleting identity;
-- supply those same values for a post-erasure inventory, since links may vanish.
begin transaction isolation level repeatable read read only;
set local statement_timeout='30s';
set local manee.deletion_subject='';
set local manee.deletion_username='';
set local manee.deletion_crew_ids='[]';
do $inventory$
declare
 subject uuid := nullif(current_setting('manee.deletion_subject'),'')::uuid;
 uname text := nullif(current_setting('manee.deletion_username'),'');
 profile_uname text;
 crew_ids uuid[];
 found_crews uuid[];
 item record;
 n bigint;
 refs jsonb := '[]';
 crew_refs jsonb := '[]';
 legacy_refs jsonb := '[]';
 storage_refs jsonb := '[]';
 constraints jsonb;
 user_exists boolean;
 session_count bigint;
 owner_review jsonb := '[]';
begin
 if jsonb_typeof(current_setting('manee.deletion_crew_ids')::jsonb)<>'array' then
  raise exception 'deletion_crew_ids must be a JSON array';
 end if;
 select coalesce(array_agg(distinct value::uuid),'{}'::uuid[]) into crew_ids
 from jsonb_array_elements_text(current_setting('manee.deletion_crew_ids')::jsonb);
 if subject is null and (uname is not null or cardinality(crew_ids)>0) then
  raise exception 'A verified subject is required with username or crew IDs';
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('table',format('%I.%I',ns.nspname,c.relname),
  'constraint',con.conname,'definition',pg_get_constraintdef(con.oid)) order by ns.nspname,c.relname,con.conname),'[]')
 into constraints from pg_constraint con join pg_class c on c.oid=con.conrelid
 join pg_namespace ns on ns.oid=c.relnamespace
 where con.contype='f' and ns.nspname in ('public','private')
 and con.confrelid in ('auth.users'::regclass,'public.profiles'::regclass,'public.crew'::regclass);
 if subject is not null then
  select exists(select 1 from auth.users where id=subject) into user_exists;
  select username into profile_uname from public.profiles where user_id=subject;
  if uname is not null and profile_uname is not null and uname<>profile_uname then
   raise exception 'Verified username does not match the selected profile';
  end if;
  uname:=coalesce(profile_uname,uname);
  select count(*) into session_count from auth.sessions where user_id=subject;
  -- FK discovery plus named UUID references without FKs: audit/history copies
  -- must not disappear from the report merely because Auth cannot cascade them.
  for item in select ns.nspname,c.relname,a.attname,c.oid
   from pg_attribute a join pg_class c on c.oid=a.attrelid
   join pg_namespace ns on ns.oid=c.relnamespace
   where ns.nspname in ('public','private') and c.relkind in ('r','p')
    and a.attnum>0 and not a.attisdropped and a.atttypid='uuid'::regtype
    and (a.attname ~ '(^|_)user_id$|^(reviewed_by|requested_by|completed_by|changed_by|approved_by|created_by|updated_by|owner_id)$'
     or exists(select 1 from pg_constraint fk where fk.contype='f' and fk.conrelid=c.oid
      and a.attnum=any(fk.conkey) and fk.confrelid in ('auth.users'::regclass,'public.profiles'::regclass)))
   order by ns.nspname,c.relname,a.attnum loop
   execute format('select count(*) from %I.%I where %I=$1',item.nspname,item.relname,item.attname) into n using subject;
   refs:=refs||jsonb_build_array(jsonb_build_object('table',format('%I.%I',item.nspname,item.relname),'column',item.attname,'rows',n));
   -- Only subject/target links identify that person's crew; reviewer/actor
   -- activity must not make somebody else's crew an erasure target.
   if item.attname in ('user_id','requester_user_id','target_user_id') and exists(
    select 1 from pg_attribute a where a.attrelid=item.oid and a.attname='crew_id'
     and a.atttypid='uuid'::regtype and a.attnum>0 and not a.attisdropped) then
    execute format('select array_agg(distinct crew_id) filter(where crew_id is not null) from %I.%I where %I=$1',item.nspname,item.relname,item.attname)
     into found_crews using subject;
    crew_ids:=crew_ids||coalesce(found_crews,'{}'::uuid[]);
   end if;
  end loop;
  select coalesce(array_agg(distinct x),'{}'::uuid[]) into crew_ids from unnest(crew_ids) x;
  for item in select table_schema,table_name,column_name from information_schema.columns
   where table_schema in ('public','private') and udt_name='uuid'
    and (column_name='crew_id' or (table_schema='public' and table_name='crew' and column_name='id'))
   order by table_schema,table_name,column_name loop
   execute format('select count(*) from %I.%I where %I=any($1)',item.table_schema,item.table_name,item.column_name) into n using crew_ids;
   crew_refs:=crew_refs||jsonb_build_array(jsonb_build_object('table',format('%I.%I',item.table_schema,item.table_name),'column',item.column_name,'rows',n));
  end loop;
  if uname is not null then
   for item in select table_schema,table_name,column_name from information_schema.columns
    where table_schema in ('public','private') and data_type='text'
     and column_name in ('username','owner_username') order by table_schema,table_name,column_name loop
    execute format('select count(*) from %I.%I where %I=$1',item.table_schema,item.table_name,item.column_name) into n using uname;
    legacy_refs:=legacy_refs||jsonb_build_array(jsonb_build_object('table',format('%I.%I',item.table_schema,item.table_name),'column',item.column_name,'rows',n));
   end loop;
  end if;
  -- Include both legacy owner UUIDs and current owner_id text. Never delete
  -- storage metadata with SQL; approved object removal uses the Storage API.
  for item in select table_schema,table_name,column_name from information_schema.columns
   where table_schema='storage' and table_name in ('objects','buckets','s3_multipart_uploads','s3_multipart_uploads_parts')
    and column_name in ('owner','owner_id') and udt_name in ('uuid','text') order by table_name,column_name loop
   execute format('select count(*) from %I.%I where %I::text=$1',item.table_schema,item.table_name,item.column_name) into n using subject::text;
   storage_refs:=storage_refs||jsonb_build_array(jsonb_build_object('table',format('%I.%I',item.table_schema,item.table_name),'column',item.column_name,'rows',n));
  end loop;
  select coalesce(jsonb_agg(jsonb_build_object('store_id',s.id,'archived',s.archived_at is not null,
   'other_active_owners',(select count(*) from public.store_memberships o where o.store_id=s.id and o.user_id<>subject and o.role='owner' and o.status='active'),
   'other_active_members',(select count(*) from public.store_memberships o where o.store_id=s.id and o.user_id<>subject and o.status='active')) order by s.id),'[]')
   into owner_review from public.stores s where exists(select 1 from public.store_memberships m
    where m.store_id=s.id and m.user_id=subject and m.role='owner');
 end if;
 perform set_config('manee.deletion_report',jsonb_build_object(
  'mode',case when subject is null then 'schema_only' else 'verified_subject_inventory' end,
  'auth_user_exists',user_exists,'sessions',session_count,'user_references',refs,
  'linked_crew_ids',to_jsonb(crew_ids),'crew_references',crew_refs,'username_references',legacy_refs,
  'storage_owner_references',storage_refs,'owned_store_review',owner_review,'foreign_keys',constraints,
  'limitations','Not erasure proof: free text, JSON snapshots, Storage content/versions, logs, exports, backups and external processors require a separate case review. Counts may overlap. No subscription cancellation or business-record deletion is performed.'
 )::text,true);
end $inventory$;
select current_setting('manee.deletion_report')::jsonb as deletion_preflight;
rollback;
