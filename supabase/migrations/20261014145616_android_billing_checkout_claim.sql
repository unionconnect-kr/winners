begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

-- A short, owner/product-scoped lease stops separate devices from opening
-- concurrent first checkouts. It never controls verification or restoration:
-- a completed Play purchase must remain recoverable after a lost response.
create table private.android_billing_checkout_claims (
 user_id uuid not null references auth.users(id) on delete cascade,
 store_id uuid not null references public.stores(id) on delete cascade,
 product_id text not null references private.android_billing_products(product_id),
 checkout_id uuid not null,
 claimed_at timestamptz not null,
 expires_at timestamptz not null,
 primary key(user_id,store_id),
 unique(user_id,product_id)
);
alter table private.android_billing_checkout_claims enable row level security;
revoke all on private.android_billing_checkout_claims from public,anon,authenticated,service_role;

create function private.manee_android_billing_checkout_claim(
 p_store_id uuid,p_product_id text,p_checkout_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare existing private.android_billing_checkout_claims; now_at timestamptz:=clock_timestamp();
begin
 perform private.manee_android_push_context(p_store_id);
 if p_checkout_id is null or p_product_id is null or not exists (
  select 1 from private.android_billing_allocations a
  join private.android_billing_products p on p.product_id=a.product_id and p.enabled
  where a.user_id=auth.uid() and a.store_id=p_store_id and a.product_id=p_product_id
 ) then raise exception 'Invalid checkout allocation' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(
  'billing-checkout:'||auth.uid()::text||':'||p_product_id,0));
 if exists(select 1 from private.android_billing_purchases b
  where b.user_id=auth.uid() and b.store_id=p_store_id and b.product_id=p_product_id
   and b.environment='Production' and b.superseded_by is null
   and b.state in ('SUBSCRIPTION_STATE_ACTIVE','SUBSCRIPTION_STATE_IN_GRACE_PERIOD','SUBSCRIPTION_STATE_CANCELED')
   and b.expires_at>now_at and b.checked_at>now_at-interval '15 minutes') then
  return jsonb_build_object('status','active');
 end if;
 select * into existing from private.android_billing_checkout_claims
  where user_id=auth.uid() and store_id=p_store_id for update;
 if found and existing.expires_at>now_at then
  if existing.checkout_id=p_checkout_id then return jsonb_build_object('status','claimed');end if;
  return jsonb_build_object('status','in_progress');
 end if;
 insert into private.android_billing_checkout_claims(
  user_id,store_id,product_id,checkout_id,claimed_at,expires_at)
 values(auth.uid(),p_store_id,p_product_id,p_checkout_id,now_at,now_at+interval '15 minutes')
 on conflict(user_id,store_id) do update
  set product_id=excluded.product_id,checkout_id=excluded.checkout_id,
      claimed_at=excluded.claimed_at,expires_at=excluded.expires_at;
 return jsonb_build_object('status','claimed');
end $$;
create function public.manee_android_billing_checkout_claim(
 p_store_id uuid,p_product_id text,p_checkout_id uuid) returns jsonb
language sql security invoker set search_path='' as $$
 select private.manee_android_billing_checkout_claim(p_store_id,p_product_id,p_checkout_id)
$$;

create function private.manee_android_billing_checkout_release(
 p_store_id uuid,p_checkout_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 perform private.manee_android_push_context(p_store_id);
 if p_checkout_id is null then raise exception 'Invalid checkout' using errcode='22023';end if;
 delete from private.android_billing_checkout_claims
  where user_id=auth.uid() and store_id=p_store_id and checkout_id=p_checkout_id;
 return found;
end $$;
create function public.manee_android_billing_checkout_release(
 p_store_id uuid,p_checkout_id uuid) returns boolean
language sql security invoker set search_path='' as $$
 select private.manee_android_billing_checkout_release(p_store_id,p_checkout_id)
$$;

revoke all on function private.manee_android_billing_checkout_claim(uuid,text,uuid),
 public.manee_android_billing_checkout_claim(uuid,text,uuid),
 private.manee_android_billing_checkout_release(uuid,uuid),
 public.manee_android_billing_checkout_release(uuid,uuid) from public,anon,service_role;
grant execute on function private.manee_android_billing_checkout_claim(uuid,text,uuid),
 public.manee_android_billing_checkout_claim(uuid,text,uuid),
 private.manee_android_billing_checkout_release(uuid,uuid),
 public.manee_android_billing_checkout_release(uuid,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
