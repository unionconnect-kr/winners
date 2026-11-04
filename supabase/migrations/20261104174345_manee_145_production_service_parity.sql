-- MANEE 1.45 production database promotion. No staging data or credentials are copied.

BEGIN;

SET LOCAL lock_timeout = '5s';

SET LOCAL statement_timeout = '120s';

SET LOCAL search_path = public, pg_catalog;

DO $preflight$ BEGIN
IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='assert_cost_access' AND pg_get_function_identity_arguments(p.oid)='p_store uuid, p_month text' AND md5(pg_get_functiondef(p.oid))='31ccd854313dca1cac63832f83fcf8f3') THEN RAISE EXCEPTION 'Function changed since preflight: private.assert_cost_access(p_store uuid, p_month text)'; END IF;
IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='can_delete_financials' AND pg_get_function_identity_arguments(p.oid)='target_store_id uuid' AND md5(pg_get_functiondef(p.oid))='9e7c79880dc4ba84190d9418328bd960') THEN RAISE EXCEPTION 'Function changed since preflight: private.can_delete_financials(target_store_id uuid)'; END IF;
IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='can_manage_store' AND pg_get_function_identity_arguments(p.oid)='target_store_id uuid' AND md5(pg_get_functiondef(p.oid))='15a371faacb45e19a13a9b7c639c7dba') THEN RAISE EXCEPTION 'Function changed since preflight: private.can_manage_store(target_store_id uuid)'; END IF;
IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='can_view_financials' AND pg_get_function_identity_arguments(p.oid)='target_store_id uuid' AND md5(pg_get_functiondef(p.oid))='ef0834f39b0d56b97bf5c5dd356ceda5') THEN RAISE EXCEPTION 'Function changed since preflight: private.can_view_financials(target_store_id uuid)'; END IF;
IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='can_write_financials' AND pg_get_function_identity_arguments(p.oid)='target_store_id uuid' AND md5(pg_get_functiondef(p.oid))='e31992d2edab493d5d457930c2651099') THEN RAISE EXCEPTION 'Function changed since preflight: private.can_write_financials(target_store_id uuid)'; END IF;
IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='claim_android_deliveries' AND pg_get_function_identity_arguments(p.oid)='p_dispatch_token text' AND md5(pg_get_functiondef(p.oid))='ddd5c7c5e3a4415d4e25ebe134b257f6') THEN RAISE EXCEPTION 'Function changed since preflight: private.claim_android_deliveries(p_dispatch_token text)'; END IF;
IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='claim_ios_deliveries' AND pg_get_function_identity_arguments(p.oid)='p_dispatch_token text' AND md5(pg_get_functiondef(p.oid))='9fd896eb3c760f756cf1c27bef4c7e4f') THEN RAISE EXCEPTION 'Function changed since preflight: private.claim_ios_deliveries(p_dispatch_token text)'; END IF;
IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='has_sales_access' AND pg_get_function_identity_arguments(p.oid)='target_store_id uuid' AND md5(pg_get_functiondef(p.oid))='68494c8f0f001270f60180abcabe0a1d') THEN RAISE EXCEPTION 'Function changed since preflight: private.has_sales_access(target_store_id uuid)'; END IF;
IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='manee_checklist' AND pg_get_function_identity_arguments(p.oid)='p_action text, p_store_id uuid, p_date date, p_payload jsonb' AND md5(pg_get_functiondef(p.oid))='268a5334aea398543af07a93ea3e037b') THEN RAISE EXCEPTION 'Function changed since preflight: private.manee_checklist(p_action text, p_store_id uuid, p_date date, p_payload jsonb)'; END IF;
IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='manee_checklist_due' AND pg_get_function_identity_arguments(p.oid)='p_item jsonb, p_date date') THEN RAISE EXCEPTION 'New function already exists: private.manee_checklist_due(p_item jsonb, p_date date)'; END IF;
IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='manee_close_month' AND pg_get_function_identity_arguments(p.oid)='p_store_id uuid, p_month_key text, p_request_id uuid, p_amendment_reason text' AND md5(pg_get_functiondef(p.oid))='cf70d55556b9e18b489b7aa93bc5e335') THEN RAISE EXCEPTION 'Function changed since preflight: private.manee_close_month(p_store_id uuid, p_month_key text, p_request_id uuid, p_amendment_reason text)'; END IF;
IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='manee_cost_review' AND pg_get_function_identity_arguments(p.oid)='p_store_id uuid, p_month_key text, p_action text, p_payload jsonb' AND md5(pg_get_functiondef(p.oid))='3c0f1bbf4217b67a35db97621cd11334') THEN RAISE EXCEPTION 'Function changed since preflight: private.manee_cost_review(p_store_id uuid, p_month_key text, p_action text, p_payload jsonb)'; END IF;
IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='manee_expense_author' AND pg_get_function_identity_arguments(p.oid)='') THEN RAISE EXCEPTION 'New function already exists: private.manee_expense_author()'; END IF;
IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='manee_financial_report' AND pg_get_function_identity_arguments(p.oid)='p_store_id uuid, p_month_key text' AND md5(pg_get_functiondef(p.oid))='e89f1977dc656ff3d7d9eef17a3bfdbc') THEN RAISE EXCEPTION 'Function changed since preflight: private.manee_financial_report(p_store_id uuid, p_month_key text)'; END IF;
IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='manee_ios_claim_scheduled_deliveries' AND pg_get_function_identity_arguments(p.oid)='' AND md5(pg_get_functiondef(p.oid))='cc78bfa7b1d68eae6fea52bdf7f71276') THEN RAISE EXCEPTION 'Function changed since preflight: private.manee_ios_claim_scheduled_deliveries()'; END IF;
IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='manee_manager_cap' AND pg_get_function_identity_arguments(p.oid)='p_store uuid, p_cap text') THEN RAISE EXCEPTION 'New function already exists: private.manee_manager_cap(p_store uuid, p_cap text)'; END IF;
IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='manee_manager_normalize' AND pg_get_function_identity_arguments(p.oid)='p jsonb') THEN RAISE EXCEPTION 'New function already exists: private.manee_manager_normalize(p jsonb)'; END IF;
IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='manee_manager_permissions' AND pg_get_function_identity_arguments(p.oid)='p_crew_id uuid, p_action text, p_permissions jsonb, p_revision bigint') THEN RAISE EXCEPTION 'New function already exists: private.manee_manager_permissions(p_crew_id uuid, p_action text, p_permissions jsonb, p_revision bigint)'; END IF;
IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='manee_manager_portal' AND pg_get_function_identity_arguments(p.oid)='p_store_id uuid, p_month_key text') THEN RAISE EXCEPTION 'New function already exists: private.manee_manager_portal(p_store_id uuid, p_month_key text)'; END IF;
IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='manee_manager_review' AND pg_get_function_identity_arguments(p.oid)='p_store_id uuid, p_month_key text, p_action text') THEN RAISE EXCEPTION 'New function already exists: private.manee_manager_review(p_store_id uuid, p_month_key text, p_action text)'; END IF;
IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='manee_manager_write' AND pg_get_function_identity_arguments(p.oid)='p_store_id uuid, p_month_key text, p_action text, p_crew_id uuid, p_payload jsonb, p_previous jsonb') THEN RAISE EXCEPTION 'New function already exists: private.manee_manager_write(p_store_id uuid, p_month_key text, p_action text, p_crew_id uuid, p_payload jsonb, p_previous jsonb)'; END IF;
IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='manee_notice_revision_guard' AND pg_get_function_identity_arguments(p.oid)='') THEN RAISE EXCEPTION 'New function already exists: private.manee_notice_revision_guard()'; END IF;
IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='manee_notice_visible' AND pg_get_function_identity_arguments(p.oid)='p_store uuid, p_audience text, p_archived boolean') THEN RAISE EXCEPTION 'New function already exists: private.manee_notice_visible(p_store uuid, p_audience text, p_archived boolean)'; END IF;
IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='manee_prepare_fixed_costs' AND pg_get_function_identity_arguments(p.oid)='p_store_id uuid, p_month_key text' AND md5(pg_get_functiondef(p.oid))='def37c763f7434b5bf4bffad9b32e50f') THEN RAISE EXCEPTION 'Function changed since preflight: private.manee_prepare_fixed_costs(p_store_id uuid, p_month_key text)'; END IF;
IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='manee_purge_expired_sms_challenges' AND pg_get_function_identity_arguments(p.oid)='p_limit integer') THEN RAISE EXCEPTION 'New function already exists: private.manee_purge_expired_sms_challenges(p_limit integer)'; END IF;
IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='manee_sales_read' AND pg_get_function_identity_arguments(p.oid)='p_store uuid, p_crew uuid') THEN RAISE EXCEPTION 'New function already exists: private.manee_sales_read(p_store uuid, p_crew uuid)'; END IF;
IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='manee_sales_write' AND pg_get_function_identity_arguments(p.oid)='p_store uuid, p_crew uuid, p_date date') THEN RAISE EXCEPTION 'New function already exists: private.manee_sales_write(p_store uuid, p_crew uuid, p_date date)'; END IF;
IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='manee_save_contract' AND pg_get_function_identity_arguments(p.oid)='p_store_id uuid, p_crew_id uuid, p_document jsonb, p_previous integer, p_attachment jsonb') THEN RAISE EXCEPTION 'New function already exists: private.manee_save_contract(p_store_id uuid, p_crew_id uuid, p_document jsonb, p_previous integer, p_attachment jsonb)'; END IF;
IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='manee_schedule_access' AND pg_get_function_identity_arguments(p.oid)='p_store uuid') THEN RAISE EXCEPTION 'New function already exists: private.manee_schedule_access(p_store uuid)'; END IF;
IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='manee_sector3_save' AND pg_get_function_identity_arguments(p.oid)='p_store_id uuid, p_date date, p_request_id uuid, p_sales jsonb, p_expenses jsonb, p_previous timestamp with time zone') THEN RAISE EXCEPTION 'New function already exists: private.manee_sector3_save(p_store_id uuid, p_date date, p_request_id uuid, p_sales jsonb, p_expenses jsonb, p_previous timestamp with time zone)'; END IF;
IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='manee_sms_ordinary_user' AND pg_get_function_identity_arguments(p.oid)='p_uid uuid') THEN RAISE EXCEPTION 'New function already exists: private.manee_sms_ordinary_user(p_uid uuid)'; END IF;
IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='manee_sms_service' AND pg_get_function_identity_arguments(p.oid)='p_action text, p_payload jsonb') THEN RAISE EXCEPTION 'New function already exists: private.manee_sms_service(p_action text, p_payload jsonb)'; END IF;
IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='manee_social_signup' AND pg_get_function_identity_arguments(p.oid)='p_user_id uuid, p_payload jsonb') THEN RAISE EXCEPTION 'New function already exists: private.manee_social_signup(p_user_id uuid, p_payload jsonb)'; END IF;
IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='manee_staff_expenses' AND pg_get_function_identity_arguments(p.oid)='p_store_id uuid, p_action text, p_payload jsonb') THEN RAISE EXCEPTION 'New function already exists: private.manee_staff_expenses(p_store_id uuid, p_action text, p_payload jsonb)'; END IF;
IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='manee_staff_portal' AND pg_get_function_identity_arguments(p.oid)='p_action text, p_payload jsonb' AND md5(pg_get_functiondef(p.oid))='0d665e1a5771c0b0060f4b52a557ee49') THEN RAISE EXCEPTION 'Function changed since preflight: private.manee_staff_portal(p_action text, p_payload jsonb)'; END IF;
IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='queue_android_business_event' AND pg_get_function_identity_arguments(p.oid)='' AND md5(pg_get_functiondef(p.oid))='9ea04a25c3d9bd8f939d9fd98ff01834') THEN RAISE EXCEPTION 'Function changed since preflight: private.queue_android_business_event()'; END IF;
IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='queue_ios_business_event' AND pg_get_function_identity_arguments(p.oid)='' AND md5(pg_get_functiondef(p.oid))='7d170bd02efa52d016380e618b4e547f') THEN RAISE EXCEPTION 'Function changed since preflight: private.queue_ios_business_event()'; END IF;
IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='seed_android_reminders' AND pg_get_function_identity_arguments(p.oid)='p_now timestamp with time zone' AND md5(pg_get_functiondef(p.oid))='86f4ec771efa4f75e08d27e8888281c9') THEN RAISE EXCEPTION 'Function changed since preflight: private.seed_android_reminders(p_now timestamp with time zone)'; END IF;
IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='seed_ios_reminders' AND pg_get_function_identity_arguments(p.oid)='p_now timestamp with time zone' AND md5(pg_get_functiondef(p.oid))='7a2a95218f9d1e5b79083226198af5d7') THEN RAISE EXCEPTION 'Function changed since preflight: private.seed_ios_reminders(p_now timestamp with time zone)'; END IF;
IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='set_crew_manager_flag' AND pg_get_function_identity_arguments(p.oid)='target_crew_id uuid, is_manager boolean' AND md5(pg_get_functiondef(p.oid))='c356ff95d39122303804efd15ae48a0a') THEN RAISE EXCEPTION 'Function changed since preflight: private.set_crew_manager_flag(target_crew_id uuid, is_manager boolean)'; END IF;
IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='manee_manager_permissions' AND pg_get_function_identity_arguments(p.oid)='p_crew_id uuid, p_action text, p_permissions jsonb, p_revision bigint') THEN RAISE EXCEPTION 'New function already exists: public.manee_manager_permissions(p_crew_id uuid, p_action text, p_permissions jsonb, p_revision bigint)'; END IF;
IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='manee_manager_portal' AND pg_get_function_identity_arguments(p.oid)='p_store_id uuid, p_month_key text') THEN RAISE EXCEPTION 'New function already exists: public.manee_manager_portal(p_store_id uuid, p_month_key text)'; END IF;
IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='manee_manager_review' AND pg_get_function_identity_arguments(p.oid)='p_store_id uuid, p_month_key text, p_action text') THEN RAISE EXCEPTION 'New function already exists: public.manee_manager_review(p_store_id uuid, p_month_key text, p_action text)'; END IF;
IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='manee_manager_write' AND pg_get_function_identity_arguments(p.oid)='p_store_id uuid, p_month_key text, p_action text, p_crew_id uuid, p_payload jsonb, p_previous jsonb') THEN RAISE EXCEPTION 'New function already exists: public.manee_manager_write(p_store_id uuid, p_month_key text, p_action text, p_crew_id uuid, p_payload jsonb, p_previous jsonb)'; END IF;
IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='manee_save_contract' AND pg_get_function_identity_arguments(p.oid)='p_store_id uuid, p_crew_id uuid, p_document jsonb, p_previous integer, p_attachment jsonb') THEN RAISE EXCEPTION 'New function already exists: public.manee_save_contract(p_store_id uuid, p_crew_id uuid, p_document jsonb, p_previous integer, p_attachment jsonb)'; END IF;
IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='manee_sector3_review' AND pg_get_function_identity_arguments(p.oid)='p_store_id uuid, p_month_key text, p_action text') THEN RAISE EXCEPTION 'New function already exists: public.manee_sector3_review(p_store_id uuid, p_month_key text, p_action text)'; END IF;
IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='manee_sector3_save' AND pg_get_function_identity_arguments(p.oid)='p_store_id uuid, p_date date, p_request_id uuid, p_sales jsonb, p_expenses jsonb, p_previous timestamp with time zone') THEN RAISE EXCEPTION 'New function already exists: public.manee_sector3_save(p_store_id uuid, p_date date, p_request_id uuid, p_sales jsonb, p_expenses jsonb, p_previous timestamp with time zone)'; END IF;
IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='manee_sector3_vendor' AND pg_get_function_identity_arguments(p.oid)='p_store_id uuid, p_id uuid, p_action text, p_name text, p_category text, p_count bigint, p_total bigint') THEN RAISE EXCEPTION 'New function already exists: public.manee_sector3_vendor(p_store_id uuid, p_id uuid, p_action text, p_name text, p_category text, p_count bigint, p_total bigint)'; END IF;
IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='manee_sector4_notice' AND pg_get_function_identity_arguments(p.oid)='p_store_id uuid, p_id uuid, p_payload jsonb, p_version integer, p_request_id uuid') THEN RAISE EXCEPTION 'New function already exists: public.manee_sector4_notice(p_store_id uuid, p_id uuid, p_payload jsonb, p_version integer, p_request_id uuid)'; END IF;
IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='manee_sector4_reservation' AND pg_get_function_identity_arguments(p.oid)='p_store_id uuid, p_id bigint, p_payload jsonb, p_version integer, p_request_id uuid') THEN RAISE EXCEPTION 'New function already exists: public.manee_sector4_reservation(p_store_id uuid, p_id bigint, p_payload jsonb, p_version integer, p_request_id uuid)'; END IF;
IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='manee_sms_service' AND pg_get_function_identity_arguments(p.oid)='p_action text, p_payload jsonb') THEN RAISE EXCEPTION 'New function already exists: public.manee_sms_service(p_action text, p_payload jsonb)'; END IF;
IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='manee_social_signup' AND pg_get_function_identity_arguments(p.oid)='p_user_id uuid, p_payload jsonb') THEN RAISE EXCEPTION 'New function already exists: public.manee_social_signup(p_user_id uuid, p_payload jsonb)'; END IF;
IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='manee_staff_expenses' AND pg_get_function_identity_arguments(p.oid)='p_store_id uuid, p_action text, p_payload jsonb') THEN RAISE EXCEPTION 'New function already exists: public.manee_staff_expenses(p_store_id uuid, p_action text, p_payload jsonb)'; END IF;
IF to_regclass('private.manee_expense_receipts') IS NOT NULL THEN RAISE EXCEPTION 'Table changed since preflight: manee_expense_receipts'; END IF;
IF to_regclass('private.manee_manager_permissions') IS NOT NULL THEN RAISE EXCEPTION 'Table changed since preflight: manee_manager_permissions'; END IF;
IF to_regclass('private.manee_sms_bindings') IS NOT NULL THEN RAISE EXCEPTION 'Table changed since preflight: manee_sms_bindings'; END IF;
IF to_regclass('private.manee_sms_challenges') IS NOT NULL THEN RAISE EXCEPTION 'Table changed since preflight: manee_sms_challenges'; END IF;
IF to_regclass('private.social_signup_consents') IS NOT NULL THEN RAISE EXCEPTION 'Table changed since preflight: social_signup_consents'; END IF;
IF to_regclass('public.checklist_history') IS NOT NULL THEN RAISE EXCEPTION 'Table changed since preflight: checklist_history'; END IF;
IF to_regclass('public.manee_contract_documents') IS NOT NULL THEN RAISE EXCEPTION 'Table changed since preflight: manee_contract_documents'; END IF;
IF to_regclass('public.sector3_requests') IS NOT NULL THEN RAISE EXCEPTION 'Table changed since preflight: sector3_requests'; END IF;
IF to_regclass('public.sector3_reviews') IS NOT NULL THEN RAISE EXCEPTION 'Table changed since preflight: sector3_reviews'; END IF;
END $preflight$;

CREATE TABLE "private"."manee_expense_receipts"(
"expense_id" uuid NOT NULL,
"name" text NOT NULL,
"mime" text NOT NULL,
"data" text NOT NULL
);

ALTER TABLE "private"."manee_expense_receipts" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "private"."manee_expense_receipts" FROM PUBLIC, anon, authenticated, service_role;

ALTER TABLE "private"."manee_expense_receipts" ADD CONSTRAINT "manee_expense_receipts_data_check" CHECK (length(data) <= 2800000);

ALTER TABLE "private"."manee_expense_receipts" ADD CONSTRAINT "manee_expense_receipts_expense_id_fkey" FOREIGN KEY (expense_id) REFERENCES expense_entries(id) ON DELETE CASCADE;

ALTER TABLE "private"."manee_expense_receipts" ADD CONSTRAINT "manee_expense_receipts_mime_check" CHECK (mime = ANY (ARRAY['image/jpeg'::text, 'image/png'::text]));

ALTER TABLE "private"."manee_expense_receipts" ADD CONSTRAINT "manee_expense_receipts_pkey" PRIMARY KEY (expense_id);

CREATE TABLE "private"."manee_manager_permissions"(
"crew_id" uuid NOT NULL,
"store_id" uuid NOT NULL,
"enabled" boolean DEFAULT false NOT NULL,
"permissions" jsonb DEFAULT '{}'::jsonb NOT NULL,
"revision" bigint DEFAULT 1 NOT NULL,
"migrated" boolean DEFAULT false NOT NULL,
"updated_by" uuid,
"updated_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL
);

ALTER TABLE "private"."manee_manager_permissions" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "private"."manee_manager_permissions" FROM PUBLIC, anon, authenticated, service_role;

ALTER TABLE "private"."manee_manager_permissions" ADD CONSTRAINT "manee_manager_permissions_crew_id_fkey" FOREIGN KEY (crew_id) REFERENCES crew(id) ON DELETE CASCADE;

ALTER TABLE "private"."manee_manager_permissions" ADD CONSTRAINT "manee_manager_permissions_pkey" PRIMARY KEY (crew_id);

ALTER TABLE "private"."manee_manager_permissions" ADD CONSTRAINT "manee_manager_permissions_store_id_fkey" FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE;

CREATE INDEX manee_manager_permissions_store ON private.manee_manager_permissions USING btree (store_id);

CREATE TABLE "private"."manee_sms_bindings"(
"user_id" uuid NOT NULL,
"phone_e164" text NOT NULL,
"verified_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "private"."manee_sms_bindings" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "private"."manee_sms_bindings" FROM PUBLIC, anon, authenticated, service_role;

ALTER TABLE "private"."manee_sms_bindings" ADD CONSTRAINT "manee_sms_bindings_phone_e164_check" CHECK (phone_e164 ~ '^\+8210[0-9]{8}$'::text);

ALTER TABLE "private"."manee_sms_bindings" ADD CONSTRAINT "manee_sms_bindings_pkey" PRIMARY KEY (user_id);

ALTER TABLE "private"."manee_sms_bindings" ADD CONSTRAINT "manee_sms_bindings_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE TABLE "private"."manee_sms_challenges"(
"id" uuid NOT NULL,
"purpose" text NOT NULL,
"username" text NOT NULL,
"phone_e164" text NOT NULL,
"phone_hash" text NOT NULL,
"target_user_id" uuid,
"session_id" uuid,
"code_hash" text,
"proof_hash" text,
"status" text DEFAULT 'sending'::text NOT NULL,
"failed_attempts" integer DEFAULT 0 NOT NULL,
"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
"expires_at" timestamp with time zone DEFAULT (clock_timestamp() + '00:03:00'::interval) NOT NULL,
"proof_expires_at" timestamp with time zone,
"operation_id" uuid,
"finished_at" timestamp with time zone
);

ALTER TABLE "private"."manee_sms_challenges" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "private"."manee_sms_challenges" FROM PUBLIC, anon, authenticated, service_role;

ALTER TABLE "private"."manee_sms_challenges" ADD CONSTRAINT "manee_sms_challenges_phone_e164_check" CHECK (phone_e164 ~ '^\+8210[0-9]{8}$'::text);

ALTER TABLE "private"."manee_sms_challenges" ADD CONSTRAINT "manee_sms_challenges_pkey" PRIMARY KEY (id);

ALTER TABLE "private"."manee_sms_challenges" ADD CONSTRAINT "manee_sms_challenges_purpose_check" CHECK (purpose = ANY (ARRAY['signup_owner'::text, 'signup_staff'::text, 'reset'::text, 'bind'::text]));

ALTER TABLE "private"."manee_sms_challenges" ADD CONSTRAINT "manee_sms_challenges_status_check" CHECK (status = ANY (ARRAY['sending'::text, 'sent'::text, 'verified'::text, 'consuming'::text, 'completed'::text, 'failed'::text, 'expired'::text]));

ALTER TABLE "private"."manee_sms_challenges" ADD CONSTRAINT "manee_sms_challenges_target_user_id_fkey" FOREIGN KEY (target_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX manee_sms_challenges_created ON private.manee_sms_challenges USING btree (created_at);

CREATE INDEX manee_sms_challenges_phone_created ON private.manee_sms_challenges USING btree (phone_hash, created_at DESC);

CREATE TABLE "private"."social_signup_consents"(
"user_id" uuid NOT NULL,
"provider" text NOT NULL,
"terms_version" text NOT NULL,
"privacy_version" text NOT NULL,
"age_14_plus_confirmed" boolean NOT NULL,
"accepted_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "private"."social_signup_consents" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "private"."social_signup_consents" FROM PUBLIC, anon, authenticated, service_role;

GRANT INSERT ON TABLE "private"."social_signup_consents" TO "service_role";

GRANT SELECT ON TABLE "private"."social_signup_consents" TO "service_role";

ALTER TABLE "private"."social_signup_consents" ADD CONSTRAINT "social_signup_consents_age_14_plus_confirmed_check" CHECK (age_14_plus_confirmed);

ALTER TABLE "private"."social_signup_consents" ADD CONSTRAINT "social_signup_consents_pkey" PRIMARY KEY (user_id);

ALTER TABLE "private"."social_signup_consents" ADD CONSTRAINT "social_signup_consents_provider_check" CHECK (provider = ANY (ARRAY['kakao'::text, 'naver'::text, 'apple'::text]));

ALTER TABLE "private"."social_signup_consents" ADD CONSTRAINT "social_signup_consents_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."announcement_reads" ADD COLUMN "revision" integer;

ALTER TABLE "public"."announcements" ADD COLUMN "important" boolean DEFAULT false NOT NULL;

ALTER TABLE "public"."announcements" ADD COLUMN "audience" text DEFAULT 'all'::text NOT NULL;

ALTER TABLE "public"."announcements" ADD COLUMN "archived" boolean DEFAULT false NOT NULL;

ALTER TABLE "public"."announcements" ADD COLUMN "revision" integer DEFAULT 1 NOT NULL;

ALTER TABLE "public"."announcements" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;

ALTER TABLE "public"."announcements" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;

ALTER TABLE "public"."announcements" ADD COLUMN "request_id" uuid;

ALTER TABLE "public"."announcements" ADD CONSTRAINT "announcements_audience_check" CHECK (audience = ANY (ARRAY['all'::text, '홀'::text, '주방'::text]));

CREATE UNIQUE INDEX announcements_request_unique ON public.announcements USING btree (store_id, request_id) WHERE (request_id IS NOT NULL);

ALTER TABLE "public"."checklist_checks" ADD COLUMN "checked_at" timestamp with time zone DEFAULT now();

ALTER TABLE "public"."checklist_checks" ADD COLUMN "checked_by" text;

CREATE TABLE "public"."checklist_history"(
"store_id" uuid NOT NULL,
"date" date NOT NULL,
"revision" integer NOT NULL,
"done" integer NOT NULL,
"total" integer NOT NULL,
"closed_at" timestamp with time zone NOT NULL,
"closed_by" text,
"reason" text DEFAULT ''::text NOT NULL,
"items" jsonb,
"checks" jsonb
);

ALTER TABLE "public"."checklist_history" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."checklist_history" FROM PUBLIC, anon, authenticated, service_role;

GRANT INSERT ON TABLE "public"."checklist_history" TO "authenticated";

GRANT SELECT ON TABLE "public"."checklist_history" TO "authenticated";

GRANT UPDATE ON TABLE "public"."checklist_history" TO "authenticated";

GRANT DELETE ON TABLE "public"."checklist_history" TO "authenticated";

GRANT INSERT ON TABLE "public"."checklist_history" TO "service_role";

GRANT SELECT ON TABLE "public"."checklist_history" TO "service_role";

GRANT UPDATE ON TABLE "public"."checklist_history" TO "service_role";

GRANT DELETE ON TABLE "public"."checklist_history" TO "service_role";

ALTER TABLE "public"."checklist_history" ADD CONSTRAINT "checklist_history_pkey" PRIMARY KEY (store_id, date, revision);

ALTER TABLE "public"."checklist_history" ADD CONSTRAINT "checklist_history_store_id_fkey" FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE;

ALTER TABLE "public"."expense_entries" ADD COLUMN "vendor_id" uuid;

ALTER TABLE "public"."expense_entries" ADD COLUMN "payment_method" text DEFAULT 'unknown'::text NOT NULL;

ALTER TABLE "public"."expense_entries" ADD COLUMN "payment_status" text DEFAULT 'unknown'::text NOT NULL;

ALTER TABLE "public"."expense_entries" ADD COLUMN "created_by_user_id" uuid;

ALTER TABLE "public"."expense_entries" ADD COLUMN "created_by_name" text;

ALTER TABLE "public"."expense_entries" ADD COLUMN "staff_request_id" uuid;

ALTER TABLE "public"."expense_entries" ADD COLUMN "staff_revision" integer DEFAULT 1 NOT NULL;

ALTER TABLE "public"."expense_entries" ADD COLUMN "owner_confirmed_at" timestamp with time zone;

ALTER TABLE "public"."expense_entries" ADD COLUMN "owner_confirmed_by" uuid;

ALTER TABLE "public"."expense_entries" ADD CONSTRAINT "expense_entries_payment_method_check" CHECK (payment_method = ANY (ARRAY['cash'::text, 'card'::text, 'transfer'::text, 'month_end'::text, 'unknown'::text]));

ALTER TABLE "public"."expense_entries" ADD CONSTRAINT "expense_entries_payment_status_check" CHECK (payment_status = ANY (ARRAY['paid'::text, 'unpaid'::text, 'unknown'::text]));

ALTER TABLE "public"."expense_entries" ADD CONSTRAINT "expense_entries_vendor_id_fkey" FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX expense_staff_request_unique ON public.expense_entries USING btree (created_by_user_id, staff_request_id) WHERE (staff_request_id IS NOT NULL);

CREATE INDEX expense_entries_vendor_id_idx ON public.expense_entries USING btree (vendor_id);

CREATE TABLE "public"."manee_contract_documents"(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"store_id" uuid NOT NULL,
"crew_id" uuid NOT NULL,
"version" integer NOT NULL,
"document" jsonb NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"created_by" uuid NOT NULL,
"attachment_name" text,
"attachment_type" text,
"attachment_base64" text
);

ALTER TABLE "public"."manee_contract_documents" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."manee_contract_documents" FROM PUBLIC, anon, authenticated, service_role;

GRANT INSERT ON TABLE "public"."manee_contract_documents" TO "service_role";

GRANT SELECT ON TABLE "public"."manee_contract_documents" TO "service_role";

GRANT UPDATE ON TABLE "public"."manee_contract_documents" TO "service_role";

GRANT DELETE ON TABLE "public"."manee_contract_documents" TO "service_role";

GRANT SELECT ON TABLE "public"."manee_contract_documents" TO "authenticated";

ALTER TABLE "public"."manee_contract_documents" ADD CONSTRAINT "manee_contract_documents_attachment_base64_check" CHECK (length(attachment_base64) <= 7000000);

ALTER TABLE "public"."manee_contract_documents" ADD CONSTRAINT "manee_contract_documents_attachment_type_check" CHECK ((attachment_type = ANY (ARRAY['application/pdf'::text, 'image/jpeg'::text, 'image/png'::text])) OR attachment_type IS NULL);

ALTER TABLE "public"."manee_contract_documents" ADD CONSTRAINT "manee_contract_documents_crew_id_fkey" FOREIGN KEY (crew_id) REFERENCES crew(id);

ALTER TABLE "public"."manee_contract_documents" ADD CONSTRAINT "manee_contract_documents_crew_id_version_key" UNIQUE (crew_id, version);

ALTER TABLE "public"."manee_contract_documents" ADD CONSTRAINT "manee_contract_documents_document_check" CHECK (jsonb_typeof(document) = 'object'::text);

ALTER TABLE "public"."manee_contract_documents" ADD CONSTRAINT "manee_contract_documents_document_check1" CHECK (length(document::text) <= 50000);

ALTER TABLE "public"."manee_contract_documents" ADD CONSTRAINT "manee_contract_documents_pkey" PRIMARY KEY (id);

ALTER TABLE "public"."manee_contract_documents" ADD CONSTRAINT "manee_contract_documents_store_id_fkey" FOREIGN KEY (store_id) REFERENCES stores(id);

ALTER TABLE "public"."reservations" ADD COLUMN "status" text DEFAULT 'confirmed'::text NOT NULL;

ALTER TABLE "public"."reservations" ADD COLUMN "cancel_reason" text DEFAULT ''::text NOT NULL;

ALTER TABLE "public"."reservations" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;

ALTER TABLE "public"."reservations" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;

ALTER TABLE "public"."reservations" ADD COLUMN "request_id" uuid;

ALTER TABLE "public"."reservations" ADD CONSTRAINT "reservations_status_check" CHECK (status = ANY (ARRAY['confirmed'::text, 'visited'::text, 'cancelled'::text, 'noshow'::text]));

CREATE UNIQUE INDEX reservations_request_unique ON public.reservations USING btree (store_id, request_id) WHERE (request_id IS NOT NULL);

CREATE TABLE "public"."sector3_requests"(
"store_id" uuid NOT NULL,
"request_id" uuid NOT NULL,
"payload_hash" text NOT NULL,
"result" jsonb NOT NULL,
"created_by_user_id" uuid DEFAULT auth.uid()
);

ALTER TABLE "public"."sector3_requests" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."sector3_requests" FROM PUBLIC, anon, authenticated, service_role;

GRANT INSERT ON TABLE "public"."sector3_requests" TO "authenticated";

GRANT SELECT ON TABLE "public"."sector3_requests" TO "authenticated";

GRANT UPDATE ON TABLE "public"."sector3_requests" TO "authenticated";

GRANT DELETE ON TABLE "public"."sector3_requests" TO "authenticated";

GRANT INSERT ON TABLE "public"."sector3_requests" TO "service_role";

GRANT SELECT ON TABLE "public"."sector3_requests" TO "service_role";

GRANT UPDATE ON TABLE "public"."sector3_requests" TO "service_role";

GRANT DELETE ON TABLE "public"."sector3_requests" TO "service_role";

ALTER TABLE "public"."sector3_requests" ADD CONSTRAINT "sector3_requests_pkey" PRIMARY KEY (store_id, request_id);

ALTER TABLE "public"."sector3_requests" ADD CONSTRAINT "sector3_requests_store_id_fkey" FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE;

CREATE TABLE "public"."sector3_reviews"(
"store_id" uuid NOT NULL,
"month_key" text NOT NULL,
"expense_hash" text,
"fixed_hash" text
);

ALTER TABLE "public"."sector3_reviews" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."sector3_reviews" FROM PUBLIC, anon, authenticated, service_role;

GRANT INSERT ON TABLE "public"."sector3_reviews" TO "authenticated";

GRANT SELECT ON TABLE "public"."sector3_reviews" TO "authenticated";

GRANT UPDATE ON TABLE "public"."sector3_reviews" TO "authenticated";

GRANT DELETE ON TABLE "public"."sector3_reviews" TO "authenticated";

GRANT INSERT ON TABLE "public"."sector3_reviews" TO "service_role";

GRANT SELECT ON TABLE "public"."sector3_reviews" TO "service_role";

GRANT UPDATE ON TABLE "public"."sector3_reviews" TO "service_role";

GRANT DELETE ON TABLE "public"."sector3_reviews" TO "service_role";

ALTER TABLE "public"."sector3_reviews" ADD CONSTRAINT "sector3_reviews_month_key_check" CHECK (month_key ~ '^\d{4}-(0[1-9]|1[0-2])$'::text);

ALTER TABLE "public"."sector3_reviews" ADD CONSTRAINT "sector3_reviews_pkey" PRIMARY KEY (store_id, month_key);

ALTER TABLE "public"."sector3_reviews" ADD CONSTRAINT "sector3_reviews_store_id_fkey" FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE;

ALTER TABLE "public"."vendors" ADD COLUMN "archived_at" timestamp with time zone;

CREATE OR REPLACE FUNCTION private.can_manage_store(target_store_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select private.is_live_manee_session() and (
  private.has_platform_role(array['super_admin','admin']::text[])
  or private.has_store_membership(target_store_id,array['owner']::text[]));
$function$;

CREATE OR REPLACE FUNCTION private.manee_manager_cap(p_store uuid, p_cap text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select private.is_live_manee_session() and exists(
  select 1 from private.manee_manager_permissions p
  join public.crew c on c.id=p.crew_id and c.store_id=p.store_id
  where p.store_id=p_store and p.crew_id=private.current_crew_id(p_store) and p.enabled
   and private.has_store_membership(p_store,array['staff','manager']::text[])
   and case p_cap when 'viewSales' then p.permissions->>'view'='sales'
    when 'ratios' then p.permissions->>'view' in('ratios','sales')
    when 'enabled' then true
    else coalesce((p.permissions->>p_cap)::boolean,false) end);
$function$;

REVOKE ALL ON FUNCTION "private"."manee_manager_cap"(p_store uuid, p_cap text) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION "private"."manee_manager_cap"(p_store uuid, p_cap text) TO "authenticated";

CREATE OR REPLACE FUNCTION private.assert_cost_access(p_store uuid, p_month text)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$begin
 if auth.uid() is null or not private.is_live_manee_session() or not (private.can_manage_store(p_store) or private.manee_manager_cap(p_store,'reportView')) then raise exception 'Cost access denied' using errcode='42501';end if;
 if p_month is null or p_month !~ '^\d{4}-(0[1-9]|1[0-2])$' then raise exception 'Invalid month' using errcode='22023';end if;
 if not exists(select 1 from public.stores where id=p_store and archived_at is null) then raise exception 'Store unavailable';end if;
end $function$;

CREATE OR REPLACE FUNCTION private.can_delete_financials(target_store_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select private.can_manage_store(target_store_id);
$function$;

CREATE OR REPLACE FUNCTION private.has_sales_access(target_store_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select private.is_live_manee_session() and (
  private.has_store_membership(target_store_id,array['owner']::text[])
  or (private.has_store_membership(target_store_id,array['staff']::text[])
   and exists(select 1 from public.crew c where c.id=private.current_crew_id(target_store_id) and c.store_id=target_store_id and c.sales_access
    and not c.is_manager and not exists(select 1 from private.manee_manager_permissions p where p.crew_id=c.id))));
$function$;

CREATE OR REPLACE FUNCTION private.can_view_financials(target_store_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select private.is_live_manee_session() and (
  private.has_platform_role(array['super_admin','admin','support','read_only']::text[])
  or private.has_sales_access(target_store_id) or private.manee_manager_cap(target_store_id,'reportView')
  or exists(select 1 from public.stores s where s.id=target_store_id and s.archived_at is null and s.franchise_id is not null
    and private.has_franchise_membership(s.franchise_id,array['admin','operator','viewer']::text[])));
$function$;

CREATE OR REPLACE FUNCTION private.can_write_financials(target_store_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select private.can_manage_store(target_store_id) or private.has_sales_access(target_store_id);
$function$;

CREATE OR REPLACE FUNCTION private.claim_android_deliveries(p_dispatch_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare result jsonb;
begin
 if coalesce(auth.role(),'')<>'service_role' or p_dispatch_token is null or length(p_dispatch_token)<>64
  or not exists(select 1 from vault.decrypted_secrets where name='manee_android_dispatch' and decrypted_secret=p_dispatch_token)
 then raise exception 'Dispatch access denied' using errcode='42501';end if;
 update private.android_push_deliveries d set status='skipped',finished_at=now()
  where status='pending' and (expires_at<=now() or not exists
   (select 1 from private.manee_android_push_targets(d.store_id) t where t.token=d.token)
   or (kind='monthly_costs' and exists(select 1 from public.monthly_cost_reviews v
    where v.store_id=d.store_id and v.month_key=d.source_id and (v.completed_at is not null or v.remind_after>(now() at time zone 'Asia/Seoul')::date)))
   or (kind in ('reservation_upcoming','reservation_due') and not exists(select 1 from public.reservations r
    where r.status='confirmed' and r.store_id=d.store_id and r.id::text=d.source_id
    and d.kind||':'||r.id::text||':'||r.date::text||':'||r.time=d.event_key)));
 update private.android_push_deliveries set status='failed',finished_at=now()
  where status='pending' and attempts>=4 and (lease_until is null or lease_until<=now());
 with candidates as (select id from private.android_push_deliveries where status='pending'
  and attempts<4 and available_at<=now() and (lease_until is null or lease_until<=now())
  order by available_at,id for update skip locked limit 10),
 claimed as (update private.android_push_deliveries d set attempts=attempts+1,lease_id=gen_random_uuid(),lease_until=now()+interval '2 minutes'
  from candidates c where d.id=c.id returning d.id,d.lease_id,d.token,d.store_id,d.kind,d.expires_at,
   case when d.kind='monthly_costs' then d.source_id
    when d.kind='report_closed' then (select c.month_key from public.monthly_report_closings c where c.id::text=d.source_id and c.store_id=d.store_id) end as month_key,
   case when d.kind in ('attendance_in','attendance_out') then
    (select a.date::text from public.attendance a where a.id::text=d.source_id and a.store_id=d.store_id) end as event_date)
 select coalesce(jsonb_agg(to_jsonb(claimed)),'[]'::jsonb) into result from claimed;
 return result;
end $function$;

CREATE OR REPLACE FUNCTION private.claim_ios_deliveries(p_dispatch_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare result jsonb;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' or p_dispatch_token is null or length(p_dispatch_token)<>64
  or not exists(select 1 from vault.decrypted_secrets where name='manee_ios_dispatch' and decrypted_secret=p_dispatch_token)
 then raise exception 'Dispatch access denied' using errcode='42501';end if;
 update private.ios_push_deliveries d set status='skipped',finished_at=now()
  where status='pending' and (expires_at<=now() or not exists
   (select 1 from private.manee_ios_push_targets(d.store_id) t where t.token=d.token)
   or (kind='monthly_costs' and exists(select 1 from public.monthly_cost_reviews v
    where v.store_id=d.store_id and v.month_key=d.source_id and (v.completed_at is not null or v.remind_after>(now() at time zone 'Asia/Seoul')::date)))
   or (kind in ('reservation_upcoming','reservation_due') and not exists(select 1 from public.reservations r
    where r.status='confirmed' and r.store_id=d.store_id and r.id::text=d.source_id
    and d.kind||':'||r.id::text||':'||r.date::text||':'||r.time=d.event_key)));
 update private.ios_push_deliveries set status='failed',finished_at=now()
  where status='pending' and attempts>=4 and (lease_until is null or lease_until<=now());
 with candidates as (select id from private.ios_push_deliveries where status='pending'
  and attempts<4 and available_at<=now() and (lease_until is null or lease_until<=now())
  order by available_at,id for update skip locked limit 10),
 claimed as (update private.ios_push_deliveries d set attempts=attempts+1,lease_id=gen_random_uuid(),lease_until=now()+interval '2 minutes'
  from candidates c where d.id=c.id returning d.id,d.lease_id,d.token,d.store_id,d.kind,d.expires_at,
   case when d.kind='monthly_costs' then d.source_id
    when d.kind='report_closed' then (select c.month_key from public.monthly_report_closings c where c.id::text=d.source_id and c.store_id=d.store_id) end as month_key,
   case when d.kind in ('attendance_in','attendance_out') then
    (select a.date::text from public.attendance a where a.id::text=d.source_id and a.store_id=d.store_id) end as event_date)
 select coalesce(jsonb_agg(to_jsonb(claimed)),'[]'::jsonb) into result from claimed;
 return result;
end $function$;

CREATE OR REPLACE FUNCTION private.manee_checklist_due(p_item jsonb, p_date date)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
 select case coalesce(p_item->'schedule'->>'kind','daily')
 when 'weekly' then extract(dow from p_date)::int=coalesce((p_item->'schedule'->>'day')::int,0)
 when 'monthly' then extract(day from p_date)::int=least(coalesce((p_item->'schedule'->>'day')::int,1),extract(day from (date_trunc('month',p_date)+interval '1 month - 1 day'))::int)
 else true end
$function$;

REVOKE ALL ON FUNCTION "private"."manee_checklist_due"(p_item jsonb, p_date date) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION "private"."manee_checklist_due"(p_item jsonb, p_date date) TO "authenticated";

CREATE OR REPLACE FUNCTION private.manee_checklist(p_action text, p_store_id uuid, p_date date, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  st public.stores%rowtype; manager boolean; business_date date; item text;
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
        insert into public.checklist_checks(store_id,date,item_id,checked,checked_at,checked_by) values(p_store_id,p_date,item,true,clock_timestamp(),actor)
          on conflict(store_id,date,item_id) do update set checked=true,checked_at=excluded.checked_at,checked_by=excluded.checked_by;
      else delete from public.checklist_checks where store_id=p_store_id and date=p_date and item_id=item; end if;
    else
      select count(distinct it->>'id'),count(distinct it->>'id') filter(where exists(select 1 from public.checklist_checks c
        where c.store_id=p_store_id and c.date=p_date and c.item_id=it->>'id' and c.checked))
        into total_count,done_count from public.checklist_templates t,lateral jsonb_array_elements(t.data) cat,
        lateral jsonb_array_elements(cat->'items') it where t.store_id=p_store_id and private.manee_checklist_due(it,p_date);
      if done_count<total_count and length(btrim(coalesce(p_payload->>'reason','')))=0 then raise exception '미완료 항목이 있어요. 마감 이유를 입력해 주세요.' using errcode='22023';end if;
      if length(coalesce(p_payload->>'reason',''))>1000 then raise exception 'Reason too long' using errcode='22023';end if;
      select coalesce(max(revision),0)+1 into rev from public.checklist_history where store_id=p_store_id and date=p_date;
      insert into public.checklist_history(store_id,date,revision,done,total,closed_at,closed_by,reason,items,checks)
       values(p_store_id,p_date,rev,done_count,total_count,clock_timestamp(),actor,coalesce(p_payload->>'reason',''),snapshot_items,snapshot_checks);
      insert into public.checklist_log(store_id,date,done,total,closed_at) values(p_store_id,p_date,done_count,total_count,clock_timestamp());
    end if;
  else raise exception 'Unknown action' using errcode='22023'; end if;
  return jsonb_build_object('ok',true,'checks',coalesce((select jsonb_object_agg(item_id,true) from public.checklist_checks where store_id=p_store_id and date=p_date and checked),'{}'::jsonb),
    'log',(select jsonb_build_object('done',done,'total',total,'closedAt',extract(epoch from closed_at)*1000) from public.checklist_log where store_id=p_store_id and date=p_date));
end;
$function$;

CREATE OR REPLACE FUNCTION private.manee_manager_review(p_store_id uuid, p_month_key text, p_action text DEFAULT 'get'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare eh text;fh text;r public.sector3_reviews;
begin
 if auth.uid() is null or not private.is_live_manee_session() or not (private.can_manage_store(p_store_id) or private.manee_manager_cap(p_store_id,case when p_action='get' then 'reportView' else 'reportEdit' end)) then raise exception '리포트 관리 권한이 없어요.' using errcode='42501';end if;
 if p_month_key is null or p_month_key !~ '^20[0-9]{2}-(0[1-9]|1[0-2])$' or p_action is null or p_action not in('get','expenses','fixed','reopen') then raise exception '리포트 확인 요청이 올바르지 않아요.' using errcode='22023';end if;
 select md5(coalesce(jsonb_agg(to_jsonb(e) order by e.id)::text,'[]')) into eh from public.expense_entries e where e.store_id=p_store_id and to_char(e.date,'YYYY-MM')=p_month_key;
 select md5(coalesce(jsonb_agg(to_jsonb(f) order by f.id)::text,'[]')) into fh from public.fixed_expenses f where f.store_id=p_store_id and f.month_key=p_month_key;
 if p_action<>'get' then
  if not private.manee_store_write_entitled(p_store_id) then raise exception '매장 구독 상태를 확인해 주세요.' using errcode='P4402';end if;
  insert into public.sector3_reviews(store_id,month_key) values(p_store_id,p_month_key) on conflict do nothing;
  if p_action='expenses' then update public.sector3_reviews set expense_hash=eh where store_id=p_store_id and month_key=p_month_key;
  elsif p_action='fixed' then update public.sector3_reviews set fixed_hash=fh where store_id=p_store_id and month_key=p_month_key;
  else update public.sector3_reviews set expense_hash=null,fixed_hash=null where store_id=p_store_id and month_key=p_month_key;end if;
 end if;
 select * into r from public.sector3_reviews where store_id=p_store_id and month_key=p_month_key;
 return jsonb_build_object('expenses',coalesce(r.expense_hash=eh,false),'fixed',coalesce(r.fixed_hash=fh,false));
end $function$;

REVOKE ALL ON FUNCTION "private"."manee_manager_review"(p_store_id uuid, p_month_key text, p_action text) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION "private"."manee_manager_review"(p_store_id uuid, p_month_key text, p_action text) TO "authenticated";

CREATE OR REPLACE FUNCTION private.manee_close_month(p_store_id uuid, p_month_key text, p_request_id uuid, p_amendment_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r jsonb; existing public.monthly_report_closings%rowtype; first_day date;last_day date; today date:=(now() at time zone 'Asia/Seoul')::date;cal public.store_business_calendar%rowtype;missing integer;next_revision integer;
begin
 if auth.uid() is null or not private.is_live_manee_session() or not (private.can_manage_store(p_store_id) or private.manee_manager_cap(p_store_id,'reportEdit')) then raise exception 'Closing access denied' using errcode='42501';end if;
 if p_month_key !~ '^\d{4}-(0[1-9]|1[0-2])$' or p_request_id is null then raise exception 'Invalid close request' using errcode='22023';end if;
 if not private.can_manage_store(p_store_id) and (private.manee_manager_review(p_store_id,p_month_key,'get')->>'expenses' <> 'true' or private.manee_manager_review(p_store_id,p_month_key,'get')->>'fixed' <> 'true') then raise exception '지출과 고정비를 확인한 뒤 마감해 주세요.' using errcode='22023';end if;
 if not private.manee_store_write_entitled(p_store_id) then raise exception '매장 구독 상태를 확인해 주세요.' using errcode='P4402';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_store_id::text||':'||p_month_key,0));
 select * into existing from public.monthly_report_closings where store_id=p_store_id and request_id=p_request_id;
 if found then
  if existing.month_key<>p_month_key then raise exception 'Request month mismatch' using errcode='22023';end if;
  return to_jsonb(existing)-'closed_by'-'request_id';
 end if;
 first_day:=to_date(p_month_key||'-01','YYYY-MM-DD');last_day:=(first_day+interval '1 month - 1 day')::date;
 if today<last_day then raise exception 'Month has not ended' using errcode='22023';end if;
 r:=(private.manee_report_preview(p_store_id,p_month_key))->'snapshot';
 if (r->>'invalid_sales_count')::integer>0 or r->>'profit' is null or (r->'payroll_status'->>'estimated_count')::integer>0 then raise exception 'Resolve sales and confirm actual net payroll before closing' using errcode='22023';end if;
 select * into cal from public.store_business_calendar where store_id=p_store_id;
 select count(*) into missing from generate_series(first_day::timestamp,last_day::timestamp,interval '1 day') d
 where not exists(select 1 from public.sales_reports sr where sr.store_id=p_store_id and sr.date=d::date)
 and (d::date=any(coalesce(cal.open_dates,'{}'::date[])) or not(d::date=any(coalesce(cal.closed_dates,'{}'::date[])) or extract(dow from d)::integer=any(coalesce(cal.closed_weekdays,'{}'::integer[]))));
 if missing>0 then raise exception 'Missing open-day sales reports: %',missing using errcode='22023';end if;
 select coalesce(max(revision),0)+1 into next_revision from public.monthly_report_closings where store_id=p_store_id and month_key=p_month_key;
 if next_revision>1 and length(trim(coalesce(p_amendment_reason,'')))<5 then raise exception 'An amendment reason is required' using errcode='22023';end if;
 if length(coalesce(p_amendment_reason,''))>1000 then raise exception 'Amendment reason too long' using errcode='22023';end if;
 insert into public.monthly_report_closings(store_id,month_key,revision,request_id,snapshot,amendment_reason,closed_by)
 values(p_store_id,p_month_key,next_revision,p_request_id,r||jsonb_build_object('missing_sales_days',0),nullif(trim(p_amendment_reason),''),auth.uid()) returning * into existing;
 return to_jsonb(existing)-'closed_by'-'request_id';
end $function$;

CREATE OR REPLACE FUNCTION private.manee_cost_review(p_store_id uuid, p_month_key text, p_action text DEFAULT 'read'::text, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare first_day date;last_day date;today date:=(now() at time zone 'Asia/Seoul')::date;
 e_id uuid;f_id uuid;key text;v_date date;v_amount integer;v_name text;v_memo text;v_cat text;v_mode text;request uuid;previous jsonb;checks jsonb;templates jsonb;
begin
 perform private.assert_cost_access(p_store_id,p_month_key);
 first_day:=to_date(p_month_key||'-01','YYYY-MM-DD');last_day:=(first_day+interval '1 month - 1 day')::date;
 if p_action not in ('read','link','skip','add','defer','complete','stop_template') or p_action is null then raise exception 'Invalid cost action';end if;
 perform pg_advisory_xact_lock(hashtextextended('cost:'||p_store_id::text||p_month_key,0));
 if p_action<>'read' then
  if not (private.can_manage_store(p_store_id) or private.manee_manager_cap(p_store_id,'reportEdit')) then raise exception '리포트 수정 권한이 없어요.' using errcode='42501';end if;
  if not private.manee_store_write_entitled(p_store_id) then raise exception '매장 구독 상태를 확인해 주세요.' using errcode='P4402';end if;
  insert into public.monthly_cost_reviews(store_id,month_key) values(p_store_id,p_month_key) on conflict do nothing;
 end if;
 key:=nullif(p_payload->>'key','');
 if key is not null and key not in ('electricity','water','gas') and not exists(select 1 from public.recurring_cost_templates t where t.id::text=key and t.store_id=p_store_id and t.active and t.mode='variable' and t.start_month<=p_month_key) then raise exception 'Invalid cost item';end if;
 if p_action in ('link','skip') and key is null then raise exception 'Cost item required';end if;
 if p_action='add' then
  request:=(p_payload->>'request_id')::uuid;if request is null then raise exception 'Request ID required';end if;
  select payload into previous from private.monthly_cost_requests where store_id=p_store_id and request_id=request;
  if found then
   if previous<>p_payload||jsonb_build_object('month_key',p_month_key) then raise exception 'Request payload mismatch';end if;
   return private.manee_cost_review(p_store_id,p_month_key,'read','{}');
  end if;
  v_date:=(p_payload->>'date')::date;v_amount:=(p_payload->>'amount')::integer;v_name:=trim(p_payload->>'name');v_memo:=coalesce(p_payload->>'memo','');v_cat:=nullif(p_payload->>'category','');v_mode:=coalesce(p_payload->>'recurrence','none');
  if v_date is null or v_date<first_day or v_date>last_day or v_date>today or v_amount is null or v_amount=0 or v_name is null or length(v_name) not between 1 and 120 or length(v_memo)>1000 then raise exception 'Invalid cost input';end if;
  if v_mode not in ('none','fixed','variable') or (v_cat is not null and v_cat not in ('food','beverage','supplies','insurance','payroll_tax','utilities','fees','tax','other')) then raise exception 'Invalid cost category';end if;
  insert into public.expense_entries(store_id,date,description,amount,category,memo) values(p_store_id,v_date,v_name,v_amount,v_cat,v_memo) returning id into e_id;
  if v_mode<>'none' and not (v_mode='variable' and coalesce(key in ('electricity','water','gas'),false)) then
   if exists(select 1 from public.recurring_cost_templates where store_id=p_store_id and active and name=v_name) then raise exception 'Recurring item already registered';end if;
   insert into public.recurring_cost_templates(store_id,name,category,mode,amount,start_month)
   values(p_store_id,v_name,v_cat,v_mode,case when v_mode='fixed' then v_amount end,to_char(first_day+interval '1 month','YYYY-MM'));
  end if;
  insert into private.monthly_cost_requests values(p_store_id,request,p_payload||jsonb_build_object('month_key',p_month_key));
 elsif p_action='link' then
  e_id:=nullif(p_payload->>'expense_id','')::uuid;f_id:=nullif(p_payload->>'fixed_id','')::uuid;
  if (e_id is null)=(f_id is null) then raise exception 'Choose one existing entry';end if;
  if e_id is not null and not exists(select 1 from public.expense_entries where id=e_id and store_id=p_store_id and date between first_day and last_day) then raise exception 'Expense scope mismatch';end if;
  if f_id is not null and not exists(select 1 from public.fixed_expenses where id=f_id and store_id=p_store_id and month_key=p_month_key) then raise exception 'Fixed scope mismatch';end if;
 end if;
 if p_action in ('add','link','skip') then
  if key is not null then
   insert into public.monthly_cost_checks(store_id,month_key,item_key,status,expense_id,fixed_id)
   values(p_store_id,p_month_key,key,case when p_action='skip' then 'not_applicable' else 'linked' end,e_id,f_id)
   on conflict(store_id,month_key,item_key) do update set status=excluded.status,expense_id=excluded.expense_id,fixed_id=excluded.fixed_id,updated_at=now();
  end if;
  update public.monthly_cost_reviews set completed_at=null,completed_by=null,remind_after=null where store_id=p_store_id and month_key=p_month_key;
 elsif p_action='defer' then
  v_date:=(p_payload->>'remind_after')::date;
  if v_date is null or v_date<=today or v_date>today+7 then raise exception 'Choose a reminder within seven days';end if;
  update public.monthly_cost_reviews set completed_at=null,completed_by=null,remind_after=v_date where store_id=p_store_id and month_key=p_month_key;
 elsif p_action='stop_template' then
  update public.recurring_cost_templates set active=false where id=(p_payload->>'template_id')::uuid and store_id=p_store_id;
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('key',c.item_key,'status',case when c.status='not_applicable' then c.status when exists(select 1 from public.expense_entries e where e.id=c.expense_id and e.store_id=p_store_id and e.date between first_day and last_day) or exists(select 1 from public.fixed_expenses f where f.id=c.fixed_id and f.store_id=p_store_id and f.month_key=p_month_key) then 'linked' else 'pending' end,'expense_id',c.expense_id,'fixed_id',c.fixed_id)),'[]') into checks from public.monthly_cost_checks c where c.store_id=p_store_id and c.month_key=p_month_key;
 select coalesce(jsonb_agg(to_jsonb(t) order by t.name),'[]') into templates from public.recurring_cost_templates t where t.store_id=p_store_id and t.active;
 if p_action='complete' then
  if exists(select 1 from (select unnest(array['electricity','water','gas']) key union all select t.id::text from public.recurring_cost_templates t where t.store_id=p_store_id and t.active and t.mode='variable' and t.start_month<=p_month_key) required
    where not exists(select 1 from jsonb_array_elements(checks) c where c->>'key'=required.key and c->>'status' in ('linked','not_applicable'))) then raise exception 'Review remaining costs';end if;
  update public.monthly_cost_reviews set completed_at=now(),completed_by=auth.uid(),remind_after=null where store_id=p_store_id and month_key=p_month_key;
 end if;
 return jsonb_build_object('checks',checks,'templates',templates,'review',coalesce((select to_jsonb(r)-'completed_by' from public.monthly_cost_reviews r where r.store_id=p_store_id and r.month_key=p_month_key),'{}'));
end $function$;

CREATE OR REPLACE FUNCTION private.manee_expense_author()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if TG_OP='INSERT' then
  new.created_by_user_id:=auth.uid();
  select coalesce(p.display_name,p.username) into new.created_by_name from public.profiles p where p.user_id=auth.uid();
  new.owner_confirmed_at:=null;new.owner_confirmed_by:=null;new.staff_revision:=1;
 else
  new.created_by_user_id:=old.created_by_user_id;new.created_by_name:=old.created_by_name;new.staff_request_id:=old.staff_request_id;
  new.staff_revision:=old.staff_revision+1;
  if (new.owner_confirmed_at is distinct from old.owner_confirmed_at or new.owner_confirmed_by is distinct from old.owner_confirmed_by) and not private.has_store_membership(old.store_id,array['owner']::text[]) then raise exception '사장님만 지출을 확인할 수 있어요.' using errcode='42501';end if;
 end if;
 return new;
end$function$;

REVOKE ALL ON FUNCTION "private"."manee_expense_author"() FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.manee_financial_report(p_store_id uuid, p_month_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s public.stores%rowtype; cal public.store_business_calendar%rowtype; first_day date; last_day date; today date:=(now() at time zone 'Asia/Seoul')::date;
 sales jsonb; expenses jsonb; fixed jsonb; payroll jsonb; missing integer; operating integer; invalid integer; expense_total bigint;fixed_total bigint;gross bigint;v_discount bigint;v_refund bigint;net bigint;labor bigint;profit bigint;
begin
 if auth.uid() is null or not private.is_live_manee_session() or not private.can_view_financials(p_store_id) then raise exception 'Financial access denied' using errcode='42501';end if;
 if p_month_key !~ '^\d{4}-(0[1-9]|1[0-2])$' then raise exception 'Invalid report month' using errcode='22023';end if;
 first_day:=to_date(p_month_key||'-01','YYYY-MM-DD');last_day:=(first_day+interval '1 month - 1 day')::date;
 select * into s from public.stores where id=p_store_id and archived_at is null;if not found then raise exception 'Store unavailable' using errcode='22023';end if;
 select * into cal from public.store_business_calendar where store_id=p_store_id;
 select coalesce(sum(total_sales),0),coalesce(sum(discount),0),coalesce(sum(refund),0),count(*) filter(where total_sales<0 or discount<0 or refund<0),
 coalesce(jsonb_agg(jsonb_build_object('date',date,'gross',total_sales,'discount',discount,'refund',refund,'net',total_sales-discount-refund,'card',card_sales,'cash',cash_sales,'emoney',emoney_sales,'delivery_baemin',delivery_baemin,'delivery_coupang',delivery_coupang,'delivery_yogiyo',delivery_yogiyo) order by date),'[]'::jsonb)
 into gross,v_discount,v_refund,invalid,sales from public.sales_reports where store_id=p_store_id and date between first_day and last_day;
 net:=gross-v_discount-v_refund;
 select coalesce(sum(amount),0),coalesce(jsonb_agg(jsonb_build_object('date',date,'description',private.financial_label(p_store_id,description),'category',category,'amount',amount) order by date,id),'[]'::jsonb) into expense_total,expenses from public.expense_entries where store_id=p_store_id and date between first_day and last_day;
 select coalesce(sum(amount),0),coalesce(jsonb_agg(jsonb_build_object('name',private.financial_label(p_store_id,name),'amount',amount) order by name,id),'[]'::jsonb) into fixed_total,fixed from public.fixed_expenses where store_id=p_store_id and month_key=p_month_key;
 payroll:=private.net_payroll_totals(p_store_id,p_month_key,today);labor:=(payroll->>'net_pay')::bigint;
 select count(*) into missing from generate_series(first_day::timestamp,least(last_day,today-1)::timestamp,interval '1 day') d
 where not exists(select 1 from public.sales_reports sr where sr.store_id=p_store_id and sr.date=d::date)
 and (d::date=any(coalesce(cal.open_dates,'{}'::date[])) or not(d::date=any(coalesce(cal.closed_dates,'{}'::date[])) or extract(dow from d)::integer=any(coalesce(cal.closed_weekdays,'{}'::integer[]))));
 select count(distinct date) into operating from public.sales_reports where store_id=p_store_id and date between first_day and last_day;
 if invalid=0 and labor is not null then profit:=net-expense_total-fixed_total-labor;end if;
 return jsonb_build_object('store_id',s.id,'store_name',s.name,'month_key',p_month_key,'gross_sales',gross,'discount',v_discount,'refund',v_refund,'net_sales',net,'net_payroll',labor,'expenses_total',expense_total,'fixed_total',fixed_total,'profit',profit,
 'labor_ratio',case when gross>0 and invalid=0 then labor::numeric/gross*100 else null end,
 'food_unclassified_count',(select count(*) from public.expense_entries where store_id=p_store_id and date between first_day and last_day and category is null),
 'food_ratio',case when gross>0 and invalid=0 then (select coalesce(sum(amount),0)::numeric/gross*100 from public.expense_entries where store_id=p_store_id and date between first_day and last_day and category in('food','beverage')) else null end,
 'expense_ratio',case when gross>0 and invalid=0 then expense_total::numeric/gross*100 else null end,'profit_ratio',case when gross>0 and invalid=0 then profit::numeric/gross*100 else null end,
 'operating_days',operating,'missing_sales_days',missing,'invalid_sales_count',invalid,'payroll_status',payroll,'sales',sales,'expenses',expenses,'fixed',fixed,'basis','net-wage-v1','calendar_configured',cal.store_id is not null,'generated_at',clock_timestamp());
end $function$;

CREATE OR REPLACE FUNCTION private.seed_ios_reminders(p_now timestamp with time zone DEFAULT now())
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r record; local_now timestamp:=p_now at time zone 'Asia/Seoul'; today date:=local_now::date;
 month text:=to_char(local_now,'YYYY-MM');last_day date:=(date_trunc('month',local_now)+interval '1 month - 1 day')::date;
begin
 for r in select id,store_id,date,time from public.reservations
  where status='confirmed' and date between today-1 and today+1 and time ~ '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$'
 loop
  if r.date+r.time::time>local_now+interval '1 minute' and r.date+r.time::time<=local_now+interval '30 minutes' then
   perform private.enqueue_ios_event(r.store_id,'reservation_upcoming',r.id::text,
    'reservation_upcoming:'||r.id::text||':'||r.date::text||':'||r.time, (r.date+r.time::time) at time zone 'Asia/Seoul');
  end if;
  if r.date+r.time::time<=local_now and r.date+r.time::time>local_now-interval '5 minutes' then
   perform private.enqueue_ios_event(r.store_id,'reservation_due',r.id::text,
    'reservation_due:'||r.id::text||':'||r.date::text||':'||r.time, ((r.date+r.time::time) at time zone 'Asia/Seoul')+interval '10 minutes');
  end if;
 end loop;
 if local_now::time<'10:00'::time or local_now::time>='21:00'::time then return;end if;
 for r in select distinct s.id,due.month_key from public.stores s
  cross join lateral (select month month_key where today in(last_day-7,last_day-3,last_day)
   union select v.month_key from public.monthly_cost_reviews v where v.store_id=s.id and v.remind_after=today) due
  left join public.monthly_cost_reviews v on v.store_id=s.id and v.month_key=due.month_key
  where s.archived_at is null and v.completed_at is null
   and ((due.month_key=month and v.remind_after is null and today in(last_day-7,last_day-3,last_day)) or v.remind_after=today)
   and exists(select 1 from public.sales_reports sr where sr.store_id=s.id
    and sr.date>=to_date(due.month_key||'-01','YYYY-MM-DD')
    and sr.date<to_date(due.month_key||'-01','YYYY-MM-DD')+interval '1 month' and sr.date<=today)
 loop
  perform private.enqueue_ios_event(r.id,'monthly_costs',r.month_key,
   'monthly_costs:'||r.id::text||':'||r.month_key||':'||today::text,(today+time '21:00') at time zone 'Asia/Seoul');
 end loop;
end $function$;

CREATE OR REPLACE FUNCTION private.manee_ios_claim_scheduled_deliveries()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare result jsonb;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Service access denied' using errcode='42501';end if;
 perform private.seed_ios_reminders();
 delete from private.ios_push_deliveries where created_at<now()-interval '14 days';
 update private.ios_push_deliveries d set status='skipped',finished_at=now()
  where status='pending' and (expires_at<=now() or not exists
   (select 1 from private.manee_ios_push_targets(d.store_id) t where t.token=d.token)
   or (kind='monthly_costs' and exists(select 1 from public.monthly_cost_reviews v
    where v.store_id=d.store_id and v.month_key=d.source_id and (v.completed_at is not null or v.remind_after>(now() at time zone 'Asia/Seoul')::date)))
   or (kind in ('reservation_upcoming','reservation_due') and not exists(select 1 from public.reservations r
    where r.status='confirmed' and r.store_id=d.store_id and r.id::text=d.source_id
    and d.kind||':'||r.id::text||':'||r.date::text||':'||r.time=d.event_key)));
 update private.ios_push_deliveries set status='failed',finished_at=now()
  where status='pending' and attempts>=4 and (lease_until is null or lease_until<=now());
 with candidates as (select id from private.ios_push_deliveries where status='pending'
  and attempts<4 and available_at<=now() and (lease_until is null or lease_until<=now())
  order by available_at,id for update skip locked limit 50),
 claimed as (update private.ios_push_deliveries d set attempts=attempts+1,lease_id=gen_random_uuid(),lease_until=now()+interval '2 minutes'
  from candidates c where d.id=c.id returning d.id,d.lease_id,d.token,d.store_id,d.kind,d.expires_at,
   case when d.kind='monthly_costs' then d.source_id
    when d.kind='report_closed' then (select c.month_key from public.monthly_report_closings c where c.id::text=d.source_id and c.store_id=d.store_id) end as month_key,
   case when d.kind in ('attendance_in','attendance_out') then
    (select a.date::text from public.attendance a where a.id::text=d.source_id and a.store_id=d.store_id) end as event_date)
 select coalesce(jsonb_agg(to_jsonb(claimed)),'[]'::jsonb) into result from claimed;
 return result;
end $function$;

CREATE OR REPLACE FUNCTION private.manee_manager_normalize(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare r jsonb; k text; v text;
begin
 if p is null or jsonb_typeof(p)<>'object' then raise exception '권한 항목을 확인해 주세요.' using errcode='22023';end if;
 v:=coalesce(p->>'view','none');
 if v not in('none','ratios','sales') then raise exception '열람 범위를 확인해 주세요.' using errcode='22023';end if;
 r:=jsonb_build_object('view',v);
 foreach k in array array['salesWrite','schedule','wage','payroll','reportView','reportEdit','export'] loop
  if p ? k and jsonb_typeof(p->k)<>'boolean' then raise exception '권한 값은 선택 또는 해제여야 합니다.' using errcode='22023';end if;
  r:=r||jsonb_build_object(k,coalesce((p->>k)::boolean,false));
 end loop;
 if v<>'sales' then r:=r||'{"wage":false,"payroll":false,"reportView":false,"reportEdit":false,"export":false}'::jsonb;
 elsif (r->>'reportEdit')::boolean or (r->>'export')::boolean then r:=r||'{"reportView":true}'::jsonb;end if;
 return r;
end $function$;

REVOKE ALL ON FUNCTION "private"."manee_manager_normalize"(p jsonb) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.manee_manager_permissions(p_crew_id uuid, p_action text DEFAULT 'get'::text, p_permissions jsonb DEFAULT NULL::jsonb, p_revision bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c public.crew; p private.manee_manager_permissions; v jsonb;
begin
 if auth.uid() is null or not private.is_live_manee_session() then raise exception '다시 로그인해 주세요.' using errcode='42501';end if;
 select * into c from public.crew where id=p_crew_id for update;
 if c.id is null or not private.has_store_membership(c.store_id,array['owner']::text[]) then raise exception '사장님만 권한을 변경할 수 있어요.' using errcode='42501';end if;
 if p_action not in('get','save','revoke') or p_action is null then raise exception '권한 요청을 확인해 주세요.' using errcode='22023';end if;
 select * into p from private.manee_manager_permissions where crew_id=c.id for update;
 if p_action<>'get' then
  if p_revision is distinct from coalesce(p.revision,0) then raise exception '다른 기기에서 권한이 변경됐어요. 다시 불러와 주세요.' using errcode='40001';end if;
  if p_action='save' and c.resign_date is not null and c.resign_date<=(now() at time zone 'Asia/Seoul')::date then raise exception '재직 중인 직원에게만 권한을 부여할 수 있어요.' using errcode='22023';end if;
  v:=case when p_action='revoke' then private.manee_manager_normalize('{"view":"none"}') else private.manee_manager_normalize(p_permissions) end;
  insert into private.manee_manager_permissions(crew_id,store_id,enabled,permissions,revision,migrated,updated_by)
   values(c.id,c.store_id,p_action='save',v,coalesce(p.revision,0)+1,false,auth.uid())
   on conflict(crew_id) do update set enabled=excluded.enabled,permissions=excluded.permissions,revision=excluded.revision,migrated=false,updated_by=excluded.updated_by,updated_at=clock_timestamp()
   returning * into p;
  update public.crew set is_manager=p.enabled,sales_access=false where id=c.id;
  update public.store_memberships set role=case when p.enabled then 'manager' else 'staff' end where crew_id=c.id and store_id=c.store_id and status='active' and role in('staff','manager');
 end if;
 return jsonb_build_object('enabled',coalesce(p.enabled,false),'revision',coalesce(p.revision,0),'legacy',coalesce(p.migrated,false),'permissions',coalesce(p.permissions,private.manee_manager_normalize('{"view":"ratios","salesWrite":true}')));
end $function$;

REVOKE ALL ON FUNCTION "private"."manee_manager_permissions"(p_crew_id uuid, p_action text, p_permissions jsonb, p_revision bigint) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION "private"."manee_manager_permissions"(p_crew_id uuid, p_action text, p_permissions jsonb, p_revision bigint) TO "authenticated";

CREATE OR REPLACE FUNCTION private.manee_manager_portal(p_store_id uuid, p_month_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare p private.manee_manager_permissions; c_id uuid; result jsonb; gross numeric;food numeric;invalid integer;pay jsonb;first_day date;last_day date;
begin
 if auth.uid() is null or not private.is_live_manee_session() or not private.has_store_membership(p_store_id,array['staff','manager']::text[]) then raise exception '직원 연결을 확인해 주세요.' using errcode='42501';end if;
 if p_month_key is null or p_month_key !~ '^20[0-9]{2}-(0[1-9]|1[0-2])$' then raise exception '조회 월을 확인해 주세요.' using errcode='22023';end if;
 c_id:=private.current_crew_id(p_store_id);select * into p from private.manee_manager_permissions where crew_id=c_id and store_id=p_store_id;
 if p.crew_id is null then
  return jsonb_build_object('configured',false,'enabled',false,'permissions',private.manee_manager_normalize('{"view":"none"}'),'month_key',p_month_key);
 end if;
 result:=jsonb_build_object('configured',true,'enabled',p.enabled,'permissions',p.permissions,'revision',p.revision,'month_key',p_month_key,'ratios',null);
 if not p.enabled then return result;end if;
 first_day:=(p_month_key||'-01')::date;last_day:=(first_day+interval '1 month')::date;
 if private.manee_manager_cap(p_store_id,'ratios') then
  select coalesce(sum(total_sales),0),count(*) filter(where total_sales<0 or discount<0 or refund<0) into gross,invalid from public.sales_reports where store_id=p_store_id and date>=first_day and date<last_day;
  select coalesce(sum(amount),0) into food from public.expense_entries where store_id=p_store_id and date>=first_day and date<last_day and category in('food','beverage');
  pay:=private.net_payroll_totals(p_store_id,p_month_key,(now() at time zone 'Asia/Seoul')::date);
  result:=result||jsonb_build_object('ratios',jsonb_build_object('food',case when gross>0 and invalid=0 then food/gross*100 end,'labor',case when gross>0 and invalid=0 then (pay->>'net_pay')::numeric/gross*100 end),'payroll_estimated',(pay->>'estimated_count')::integer>0);
  if private.manee_manager_cap(p_store_id,'viewSales') then result:=result||jsonb_build_object('sales_total',case when invalid=0 then gross end);end if;
 end if;
 if private.manee_manager_cap(p_store_id,'wage') or private.manee_manager_cap(p_store_id,'payroll') then
  result:=result||jsonb_build_object('crew',(select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'position',c.position,'wage',c.wage,'wage_type',c.wage_type,'hire_date',c.hire_date,'resign_date',c.resign_date,'is_manager',c.is_manager,'employment_setup_required',c.employment_setup_required) order by c.name),'[]'::jsonb) from public.crew c where c.store_id=p_store_id));
 end if;
 if private.manee_manager_cap(p_store_id,'payroll') then
  result:=result||jsonb_build_object('payroll',(select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from public.monthly_net_payroll r where store_id=p_store_id and month_key=p_month_key),'adjustments',(select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at),'[]'::jsonb) from public.crew_pay_adjustments r where store_id=p_store_id and month_key=p_month_key));
 end if;
 if private.manee_manager_cap(p_store_id,'reportView') then result:=result||jsonb_build_object('report',private.manee_report_preview(p_store_id,p_month_key),'review',private.manee_manager_review(p_store_id,p_month_key,'get'),'last_closing',(select jsonb_build_object('revision',r.revision,'closed_at',r.closed_at) from public.monthly_report_closings r where r.store_id=p_store_id and r.month_key=p_month_key order by r.revision desc limit 1));end if;
 return result;
end $function$;

REVOKE ALL ON FUNCTION "private"."manee_manager_portal"(p_store_id uuid, p_month_key text) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION "private"."manee_manager_portal"(p_store_id uuid, p_month_key text) TO "authenticated";

CREATE OR REPLACE FUNCTION private.manee_manager_write(p_store_id uuid, p_month_key text, p_action text, p_crew_id uuid, p_payload jsonb, p_previous jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c public.crew; r public.monthly_net_payroll; a public.crew_pay_adjustments; amount bigint;d date;rid uuid;
begin
 if auth.uid() is null or not private.is_live_manee_session() or not private.manee_manager_cap(p_store_id,case when p_action='wage' then 'wage' else 'payroll' end) then raise exception '허용된 관리 권한이 없어요.' using errcode='42501';end if;
 if p_action not in('wage','payroll','adjustment') or p_action is null or p_month_key is null or p_month_key !~ '^20[0-9]{2}-(0[1-9]|1[0-2])$' or p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception '저장 내용을 확인해 주세요.' using errcode='22023';end if;
 if not private.manee_store_write_entitled(p_store_id) then raise exception '매장 구독 상태를 확인해 주세요.' using errcode='P4402';end if;
 select * into c from public.crew where id=p_crew_id and store_id=p_store_id for update;
 if c.id is null then raise exception '이 매장의 직원을 선택해 주세요.' using errcode='42501';end if;
 if p_action='wage' then
  if jsonb_build_object('wage',c.wage,'wage_type',c.wage_type) is distinct from p_previous then raise exception '급여 조건이 변경됐어요. 다시 불러와 주세요.' using errcode='40001';end if;
  if coalesce(p_payload->>'wage','') !~ '^[0-9]+$' or coalesce(p_payload->>'wage_type','') not in('hourly','monthly') then raise exception '급여 금액과 방식을 확인해 주세요.' using errcode='22023';end if;
  amount:=(p_payload->>'wage')::bigint;if amount<1 or amount>2147483647 then raise exception '급여 금액 범위를 확인해 주세요.' using errcode='22023';end if;
  update public.crew set wage=amount::integer,wage_type=p_payload->>'wage_type',employment_setup_required=false where id=c.id;
 elsif p_action='payroll' then
  select * into r from public.monthly_net_payroll where store_id=p_store_id and crew_id=c.id and month_key=p_month_key for update;
  if coalesce(p_previous->>'updated_at','') is distinct from coalesce(to_jsonb(r)->>'updated_at','') then raise exception '급여가 변경됐어요. 다시 불러와 주세요.' using errcode='40001';end if;
  if coalesce(p_payload->>'net_pay','') !~ '^[0-9]+$' then raise exception '실제 세후급여를 확인해 주세요.' using errcode='22023';end if;
  amount:=(p_payload->>'net_pay')::bigint;d:=nullif(p_payload->>'paid_on','')::date;
  if amount<0 or amount>2147483647 or d>(now() at time zone 'Asia/Seoul')::date then raise exception '급여 금액·지급일을 확인해 주세요.' using errcode='22023';end if;
  insert into public.monthly_net_payroll(store_id,crew_id,month_key,net_pay,paid_on) values(p_store_id,c.id,p_month_key,amount::integer,d)
   on conflict(store_id,crew_id,month_key) do update set net_pay=excluded.net_pay,paid_on=excluded.paid_on;
 else
  rid:=(p_payload->>'id')::uuid;d:=(p_payload->>'date')::date;
  if rid is null or d is null or to_char(d,'YYYY-MM')<>p_month_key or d>(now() at time zone 'Asia/Seoul')::date or coalesce(p_payload->>'amount','') !~ '^-?[0-9]+$' or coalesce(p_payload->>'type','') not in('가불','기타') or length(trim(coalesce(p_payload->>'note',''))) not between 1 and 1000 then raise exception '조정 금액·날짜·사유를 확인해 주세요.' using errcode='22023';end if;
  amount:=(p_payload->>'amount')::bigint;if amount=0 or abs(amount)>2147483647 or (p_payload->>'type'='가불' and amount>=0) then raise exception '조정 방향과 금액을 확인해 주세요.' using errcode='22023';end if;
  select * into a from public.crew_pay_adjustments where id=rid;
  if a.id is not null then
   if a.store_id<>p_store_id or a.crew_id<>c.id or a.month_key<>p_month_key or a.amount<>amount or a.type<>p_payload->>'type' or a.note<>trim(p_payload->>'note') or a.adjustment_date<>d then raise exception '동일 요청의 내용이 변경됐어요.' using errcode='40001';end if;
  else insert into public.crew_pay_adjustments(id,store_id,crew_id,month_key,type,amount,note,adjustment_date) values(rid,p_store_id,c.id,p_month_key,p_payload->>'type',amount::integer,trim(p_payload->>'note'),d);end if;
 end if;
 return jsonb_build_object('ok',true);
end $function$;

REVOKE ALL ON FUNCTION "private"."manee_manager_write"(p_store_id uuid, p_month_key text, p_action text, p_crew_id uuid, p_payload jsonb, p_previous jsonb) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION "private"."manee_manager_write"(p_store_id uuid, p_month_key text, p_action text, p_crew_id uuid, p_payload jsonb, p_previous jsonb) TO "authenticated";

CREATE OR REPLACE FUNCTION private.manee_notice_revision_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare rev int;
begin
 if tg_table_name='announcements' then
  if tg_op='UPDATE' then
   new.version:=old.version+1;new.updated_at:=clock_timestamp();
   new.revision:=old.revision+case when (new.title,new.body,new.audience) is distinct from (old.title,old.body,old.audience) then 1 else 0 end;
  else new.version:=1;new.revision:=1;end if;
 else
  select revision into rev from public.announcements where id=new.announcement_id;
  if rev is null then raise exception '공지에 접근할 수 없어요.' using errcode='42501';end if;
  if new.revision is not null and new.revision<>rev then raise exception '공지가 변경됐어요. 다시 읽고 확인해 주세요.' using errcode='40001';end if;
  new.revision:=rev;
 end if;
 return new;
end $function$;

REVOKE ALL ON FUNCTION "private"."manee_notice_revision_guard"() FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION "private"."manee_notice_revision_guard"() TO "authenticated";

CREATE OR REPLACE FUNCTION private.manee_notice_visible(p_store uuid, p_audience text, p_archived boolean)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select case when private.can_manage_store(p_store) or (private.can_view_store(p_store) and not private.has_store_membership(p_store,null)) then true
 when not p_archived and private.has_store_membership(p_store,null) then
  p_audience='all' or exists(select 1 from private.get_store_crew_directory(p_store) c where c.crew_id=private.current_crew_id(p_store) and c.store_id=p_store and c.crew_position=p_audience)
 else false end
$function$;

REVOKE ALL ON FUNCTION "private"."manee_notice_visible"(p_store uuid, p_audience text, p_archived boolean) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION "private"."manee_notice_visible"(p_store uuid, p_audience text, p_archived boolean) TO "authenticated";

CREATE OR REPLACE FUNCTION private.manee_prepare_fixed_costs(p_store_id uuid, p_month_key text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare previous_month text;
begin
 perform private.assert_cost_access(p_store_id,p_month_key);
 if not (private.can_manage_store(p_store_id) or private.manee_manager_cap(p_store_id,'reportEdit')) then raise exception '리포트 수정 권한이 없어요.' using errcode='42501';end if;
 if not private.manee_store_write_entitled(p_store_id) then return;end if;
 if p_month_key>to_char(now() at time zone 'Asia/Seoul','YYYY-MM') then return;end if;
 perform pg_advisory_xact_lock(hashtextextended('fixed:'||p_store_id::text||p_month_key,0));
 previous_month:=to_char(to_date(p_month_key||'-01','YYYY-MM-DD')-interval '1 month','YYYY-MM');
 if not exists(select 1 from public.fixed_expenses where store_id=p_store_id and month_key=p_month_key) then
  insert into public.fixed_expenses(store_id,month_key,name,amount)
  select p_store_id,p_month_key,name,amount from public.fixed_expenses where store_id=p_store_id and month_key=previous_month and cost_template_id is null;
 end if;
 insert into public.fixed_expenses(store_id,month_key,name,amount,cost_template_id)
 select p_store_id,p_month_key,t.name,t.amount,t.id from public.recurring_cost_templates t
 where t.store_id=p_store_id and t.active and t.mode='fixed' and t.start_month<=p_month_key
 on conflict(store_id,month_key,cost_template_id) where cost_template_id is not null do nothing;
end $function$;

CREATE OR REPLACE FUNCTION private.manee_purge_expired_sms_challenges(p_limit integer DEFAULT 500)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE removed integer;
BEGIN
 IF auth.uid() IS NOT NULL THEN RAISE EXCEPTION 'Maintenance requires no customer session' USING ERRCODE='42501'; END IF;
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'Invalid retention batch size' USING ERRCODE='22023'; END IF;
 WITH due AS (
  SELECT id FROM private.manee_sms_challenges
  WHERE created_at<now()-interval '168 hours' AND expires_at<now()
   AND (proof_expires_at IS NULL OR proof_expires_at<now())
   AND status<>'consuming'
  ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT p_limit
 ), erased AS (
  DELETE FROM private.manee_sms_challenges c USING due WHERE c.id=due.id RETURNING c.id
 ) SELECT count(*)::integer INTO removed FROM erased;
 RETURN removed;
END $function$;

REVOKE ALL ON FUNCTION "private"."manee_purge_expired_sms_challenges"(p_limit integer) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.manee_sales_read(p_store uuid, p_crew uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select private.can_view_financials(p_store) or private.manee_manager_cap(p_store,'viewSales')
  or (private.manee_manager_cap(p_store,'salesWrite') and p_crew=private.current_crew_id(p_store));
$function$;

REVOKE ALL ON FUNCTION "private"."manee_sales_read"(p_store uuid, p_crew uuid) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION "private"."manee_sales_read"(p_store uuid, p_crew uuid) TO "authenticated";

CREATE OR REPLACE FUNCTION private.manee_sales_write(p_store uuid, p_crew uuid, p_date date)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select private.can_write_financials(p_store) or (private.manee_manager_cap(p_store,'salesWrite')
  and p_crew=private.current_crew_id(p_store) and p_date<=(now() at time zone 'Asia/Seoul')::date
  and not exists(select 1 from public.monthly_report_closings r where r.store_id=p_store and r.month_key=to_char(p_date,'YYYY-MM')));
$function$;

REVOKE ALL ON FUNCTION "private"."manee_sales_write"(p_store uuid, p_crew uuid, p_date date) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION "private"."manee_sales_write"(p_store uuid, p_crew uuid, p_date date) TO "authenticated";

CREATE OR REPLACE FUNCTION private.manee_save_contract(p_store_id uuid, p_crew_id uuid, p_document jsonb, p_previous integer DEFAULT 0, p_attachment jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c public.crew;v integer;r public.manee_contract_documents;k text;d jsonb;
begin
 if auth.uid() is null or not private.is_live_manee_session() or not private.has_store_membership(p_store_id,array['owner']::text[]) then raise exception '사장님만 계약서를 작성할 수 있어요.' using errcode='42501';end if;
 if not private.manee_store_write_entitled(p_store_id) then raise exception '구독 상태를 확인해 주세요.' using errcode='P4402';end if;
 select * into c from public.crew where id=p_crew_id and store_id=p_store_id for update;if not found then raise exception '직원을 확인해 주세요.';end if;
 if coalesce(jsonb_typeof(p_document),'null')<>'object' or length(p_document::text)>50000 then raise exception '계약 내용이 올바르지 않아요.';end if;
 foreach k in array array['employer','representative','employerAddress','employerPhone','employee','employeeAddress','employeePhone','start','workplace','duties','wageType','wage','wageCalculation','payPeriod','payDay','payment','holiday','annualLeave','allowances','bonus','overtime','delivery'] loop
 if length(trim(coalesce(p_document->>k,'')))=0 then raise exception '필수 항목을 입력해 주세요: %',k;end if;end loop;
 if coalesce(p_document->>'type','') not in('indefinite','fixed','parttime') or p_document->>'wageType' not in('hourly','monthly') or (p_document->>'wage')::numeric<=0 then raise exception '계약 종류와 급여 금액을 확인해 주세요.';end if;
 if p_document->>'type'='fixed' and ((p_document->>'end')::date is null or (p_document->>'end')::date<(p_document->>'start')::date) then raise exception '계약기간을 확인해 주세요.';end if;
 if coalesce(jsonb_typeof(p_document->'schedule'),'null')<>'array' or jsonb_array_length(p_document->'schedule')=0 then raise exception '근로일별 근로시간을 입력해 주세요.';end if;
 for d in select value from jsonb_array_elements(p_document->'schedule') loop
 if coalesce(d->>'day','') not in('월','화','수','목','금','토','일') or coalesce(d->>'start','')!~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or coalesce(d->>'end','')!~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or length(trim(coalesce(d->>'break','')))=0 then raise exception '근로일별 출근·퇴근·휴게시간을 확인해 주세요.';end if;
 if coalesce((d->>'nextDay')::boolean,false)=false and d->>'end'<=d->>'start' then raise exception '퇴근시간 또는 다음 날 퇴근을 확인해 주세요.';end if;end loop;
 if (select count(*)<>count(distinct value->>'day') from jsonb_array_elements(p_document->'schedule')) then raise exception '근로일이 중복됐어요.';end if;
 select coalesce(max(version),0) into v from public.manee_contract_documents where crew_id=c.id;
 if v<>p_previous then raise exception '다른 기기에서 수정됐어요. 다시 불러와 주세요.' using errcode='40001';end if;
 if p_attachment is not null and (coalesce(p_attachment->>'type','') not in('application/pdf','image/jpeg','image/png') or length(p_attachment->>'data')>7000000 or coalesce(p_attachment->>'name','')='' or coalesce(p_attachment->>'data','')='' or (p_attachment->>'data')!~ '^[A-Za-z0-9+/]*={0,2}$') then raise exception 'PDF·JPG·PNG 5MB 이하 파일을 선택해 주세요.';end if;
 if p_attachment is not null and octet_length(decode(p_attachment->>'data','base64'))>5242880 then raise exception '첨부파일은 5MB 이하로 선택해 주세요.';end if;
 if p_attachment is null and v>0 then select jsonb_build_object('name',attachment_name,'type',attachment_type,'data',attachment_base64) into p_attachment from public.manee_contract_documents where crew_id=c.id and version=v and attachment_base64 is not null;end if;
 insert into public.manee_contract_documents(store_id,crew_id,version,document,created_by,attachment_name,attachment_type,attachment_base64) values(p_store_id,c.id,v+1,p_document,auth.uid(),left(p_attachment->>'name',200),p_attachment->>'type',p_attachment->>'data') returning * into r;
 return to_jsonb(r)-'attachment_base64'-'created_by';
end$function$;

REVOKE ALL ON FUNCTION "private"."manee_save_contract"(p_store_id uuid, p_crew_id uuid, p_document jsonb, p_previous integer, p_attachment jsonb) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION "private"."manee_save_contract"(p_store_id uuid, p_crew_id uuid, p_document jsonb, p_previous integer, p_attachment jsonb) TO "authenticated";

CREATE OR REPLACE FUNCTION private.manee_schedule_access(p_store uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select private.can_manage_store(p_store) or private.manee_manager_cap(p_store,'schedule');
$function$;

REVOKE ALL ON FUNCTION "private"."manee_schedule_access"(p_store uuid) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION "private"."manee_schedule_access"(p_store uuid) TO "authenticated";

CREATE OR REPLACE FUNCTION private.manee_sector3_save(p_store_id uuid, p_date date, p_request_id uuid, p_sales jsonb DEFAULT NULL::jsonb, p_expenses jsonb DEFAULT '[]'::jsonb, p_previous timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare h text;c public.sector3_requests;s public.sales_reports;old public.sales_reports;e jsonb;v public.vendors;r jsonb;
begin
 if not (private.can_manage_store(p_store_id) or private.manee_manager_cap(p_store_id,'salesWrite')) or not private.is_live_manee_session() then raise exception 'Not allowed' using errcode='42501';end if;
 if p_date is null or p_request_id is null or p_date>(now() at time zone 'Asia/Seoul')::date or jsonb_typeof(p_expenses)<>'array' or jsonb_array_length(p_expenses)>100 then raise exception 'Invalid request';end if;
 if not private.manee_store_write_entitled(p_store_id) then raise exception '매장 구독 상태를 확인해 주세요.' using errcode='P4402';end if;
 if not private.can_manage_store(p_store_id) and exists(select 1 from public.monthly_report_closings where store_id=p_store_id and month_key=to_char(p_date,'YYYY-MM')) then raise exception '마감된 월은 사장님께 정정을 요청해 주세요.' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_store_id::text||p_date::text,0));
 h:=md5(jsonb_build_array(p_sales,p_expenses,p_date,p_previous)::text);
 select * into c from public.sector3_requests where store_id=p_store_id and request_id=p_request_id;
 if c.request_id is not null then if not private.can_manage_store(p_store_id) and c.created_by_user_id is distinct from auth.uid() then raise exception '다른 계정의 저장 요청이에요.' using errcode='42501';end if;if c.payload_hash<>h then raise exception '저장 요청이 변경됐어요.';end if;return c.result;end if;
 if p_sales is not null then
 select * into old from public.sales_reports where store_id=p_store_id and date=p_date for update;
 if old.id is not null and not private.can_manage_store(p_store_id) and old.crew_id is distinct from private.current_crew_id(p_store_id) then raise exception '다른 직원의 매출은 수정할 수 없어요.' using errcode='42501';end if;
 if old.submitted_at is distinct from p_previous then raise exception '다른 기기에서 변경됐어요. 다시 불러와 주세요.';end if;
 s:=jsonb_populate_record(null::public.sales_reports,p_sales);
 if s.store_id is distinct from p_store_id or s.date is distinct from p_date then raise exception 'Invalid scope';end if;
 if s.total_sales is null or s.discount is null or s.refund is null or s.cash_sales is null or s.card_sales is null or s.emoney_sales is null or s.net_sales is null or least(s.total_sales,s.discount,s.refund,s.cash_sales,s.card_sales,s.emoney_sales,s.till,s.delivery_baemin,s.delivery_coupang,s.delivery_yogiyo)<0 or s.total_sales::bigint<>s.card_sales::bigint+s.cash_sales::bigint+s.emoney_sales::bigint+s.discount::bigint or s.net_sales::bigint<>s.total_sales::bigint-s.discount::bigint-s.refund::bigint then raise exception 'Invalid sales';end if;
 if not private.can_manage_store(p_store_id) then s.crew_id:=private.current_crew_id(p_store_id);end if;
 if s.crew_id is not null and not private.crew_belongs_to_store(s.crew_id,p_store_id) then raise exception '매출 작성자 매장을 확인해 주세요.' using errcode='42501';end if;
 select coalesce(display_name,username,'') into s.manager_name from public.profiles where user_id=auth.uid();s.submitted_at:=clock_timestamp();
 insert into public.sales_reports(store_id,date,manager_name,crew_id,total_sales,discount,refund,refund_reason,net_sales,cash_sales,expense,cash_expense_items,actual_cash,card_sales,emoney_sales,card_expense,card_expense_items,bank_transfer,bank_transfer_items,till,delivery_baemin,delivery_coupang,delivery_yogiyo,note,settlement_photos,receipt_photos,note_photos,submitted_at) values(p_store_id,p_date,s.manager_name,s.crew_id,s.total_sales,s.discount,s.refund,s.refund_reason,s.net_sales,s.cash_sales,s.expense,s.cash_expense_items,s.actual_cash,s.card_sales,s.emoney_sales,s.card_expense,s.card_expense_items,s.bank_transfer,s.bank_transfer_items,s.till,s.delivery_baemin,s.delivery_coupang,s.delivery_yogiyo,s.note,s.settlement_photos,s.receipt_photos,s.note_photos,s.submitted_at) on conflict(store_id,date) do update set manager_name=excluded.manager_name,crew_id=excluded.crew_id,total_sales=excluded.total_sales,discount=excluded.discount,refund=excluded.refund,refund_reason=excluded.refund_reason,net_sales=excluded.net_sales,cash_sales=excluded.cash_sales,expense=excluded.expense,cash_expense_items=excluded.cash_expense_items,actual_cash=excluded.actual_cash,card_sales=excluded.card_sales,emoney_sales=excluded.emoney_sales,card_expense=excluded.card_expense,card_expense_items=excluded.card_expense_items,bank_transfer=excluded.bank_transfer,bank_transfer_items=excluded.bank_transfer_items,till=excluded.till,delivery_baemin=excluded.delivery_baemin,delivery_coupang=excluded.delivery_coupang,delivery_yogiyo=excluded.delivery_yogiyo,note=excluded.note,settlement_photos=excluded.settlement_photos,receipt_photos=excluded.receipt_photos,note_photos=excluded.note_photos,submitted_at=excluded.submitted_at returning * into s;
 end if;
 for e in select value from jsonb_array_elements(p_expenses) loop
 if coalesce(e->>'amount','') !~ '^-?[0-9]+$' or (e->>'amount')::bigint=0 or abs((e->>'amount')::bigint)>2147483647 or length(coalesce(e->>'memo',''))>1000 or coalesce(e->>'payment_method','') not in ('cash','card','transfer','month_end','unknown') or coalesce(e->>'payment_status','') not in ('paid','unpaid','unknown') then raise exception 'Invalid expense';end if;
 select * into v from public.vendors where id=(e->>'vendor_id')::uuid and store_id=p_store_id and archived_at is null;
 if v.id is null then raise exception '거래처를 다시 선택해 주세요.';end if;
 if nullif(e->>'category','') is not null and e->>'category' not in ('food','beverage','supplies','insurance','payroll_tax','utilities','fees','tax','other') then raise exception 'Invalid category';end if;
 insert into public.expense_entries(store_id,date,vendor_id,description,amount,category,memo,payment_method,payment_status) values(p_store_id,p_date,v.id,v.name,(e->>'amount')::integer,nullif(e->>'category',''),coalesce(e->>'memo',''),e->>'payment_method',e->>'payment_status');
 end loop;
 r:=jsonb_build_object('sales',case when p_sales is null then null else to_jsonb(s) end);
 insert into public.sector3_requests(store_id,request_id,payload_hash,result,created_by_user_id) values(p_store_id,p_request_id,h,r,auth.uid());return r;
end $function$;

REVOKE ALL ON FUNCTION "private"."manee_sector3_save"(p_store_id uuid, p_date date, p_request_id uuid, p_sales jsonb, p_expenses jsonb, p_previous timestamp with time zone) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION "private"."manee_sector3_save"(p_store_id uuid, p_date date, p_request_id uuid, p_sales jsonb, p_expenses jsonb, p_previous timestamp with time zone) TO "authenticated";

CREATE OR REPLACE FUNCTION private.manee_sms_ordinary_user(p_uid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select exists(select 1 from auth.users u join public.profiles p on p.user_id=u.id
 where u.id=p_uid and p.status='active' and (u.banned_until is null or u.banned_until<now())
 and u.email ~ '^u-[0-9a-f]{32}@auth\.manee\.local$'
 and coalesce(u.encrypted_password,'')<>''
 and not exists(select 1 from auth.identities i where i.user_id=u.id and i.provider<>'email')
 and not exists(select 1 from public.platform_admins pa where pa.user_id=u.id and pa.status='active'));
$function$;

REVOKE ALL ON FUNCTION "private"."manee_sms_ordinary_user"(p_uid uuid) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.manee_sms_service(p_action text, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 c private.manee_sms_challenges%rowtype;
 uid uuid; sid uuid; op uuid; cid uuid; uname text; ph text; phash text; v_purpose text;
 send_allowed boolean:=false;
 bad jsonb:=jsonb_build_object('ok',false,'error','verification_invalid');
begin
 if p_action='credentials' then
   uid:=(p_payload->>'user_id')::uuid; sid:=(p_payload->>'session_id')::uuid;
   if not private.manee_sms_ordinary_user(uid) or not exists(select 1 from auth.sessions s where s.id=sid and s.user_id=uid and (s.not_after is null or s.not_after>now())) then return bad; end if;
   return (select jsonb_build_object('ok',true,'username',p.username,'email',u.email) from public.profiles p join auth.users u on u.id=p.user_id where p.user_id=uid);
 elsif p_action='request' then
   cid:=(p_payload->>'id')::uuid; v_purpose:=p_payload->>'purpose'; uname:=p_payload->>'username';
   ph:=p_payload->>'phone'; phash:=p_payload->>'phone_hash';
   if v_purpose not in ('signup_owner','signup_staff','reset','bind') or uname !~ '^[a-z0-9가-힣._-]{4,30}$' or ph !~ '^\+8210[0-9]{8}$' or phash !~ '^[0-9a-f]{64}$' or (p_payload->>'code_hash') !~ '^[0-9a-f]{64}$' then return bad; end if;
   -- Serialize requests for a destination. Do not use a client-supplied IP as the only abuse limit.
   perform pg_advisory_xact_lock(hashtextextended('manee-sms:'||phash,0));
   if exists(select 1 from private.manee_sms_challenges where phone_hash=phash and created_at>clock_timestamp()-interval '60 seconds') then
     return jsonb_build_object('ok',false,'error','rate_limited','retry_after',60); end if;
   if not public.consume_auth_rate_limit('sms_phone_hour',phash,3600,5)
      or not public.consume_auth_rate_limit('sms_phone_day',phash,86400,10)
      or not public.consume_auth_rate_limit('sms_username_hour',p_payload->>'username_hash',3600,5)
      or not public.consume_auth_rate_limit('sms_ip_hour',p_payload->>'ip_hash',3600,10)
      or not public.consume_auth_rate_limit('sms_staging_day','all',86400,100) then
     return jsonb_build_object('ok',false,'error','rate_limited','retry_after',3600); end if;
   if v_purpose in ('signup_owner','signup_staff') then
     send_allowed:=not public.is_manee_username_reserved(uname);
   elsif v_purpose='reset' then
     select b.user_id into uid from private.manee_sms_bindings b join public.profiles p on p.user_id=b.user_id
       where b.phone_e164=ph and p.username=uname and private.manee_sms_ordinary_user(b.user_id);
     send_allowed:=uid is not null;
   else
     uid:=(p_payload->>'user_id')::uuid; sid:=(p_payload->>'session_id')::uuid;
     send_allowed:=private.manee_sms_ordinary_user(uid)
       and exists(select 1 from public.profiles p where p.user_id=uid and p.username=uname)
       and exists(select 1 from auth.sessions s where s.id=sid and s.user_id=uid and (s.not_after is null or s.not_after>now()));
     if not send_allowed then return bad; end if;
   end if;
   -- Keep only a short-lived, bounded verification history. Verified bindings are stored separately.
   delete from private.manee_sms_challenges where created_at<clock_timestamp()-interval '7 days';
   update private.manee_sms_challenges set status='expired',code_hash=null,proof_hash=null
     where phone_hash=phash and username=uname and purpose=v_purpose and status in ('sending','sent','verified');
   insert into private.manee_sms_challenges(id,purpose,username,phone_e164,phone_hash,target_user_id,session_id,code_hash,status)
     values(cid,v_purpose,uname,ph,phash,uid,sid,case when send_allowed then p_payload->>'code_hash' else null end,case when send_allowed then 'sending' else 'failed' end);
   return jsonb_build_object('ok',true,'send_allowed',send_allowed);
 elsif p_action in ('sent','failed') then
   update private.manee_sms_challenges set status=case when p_action='sent' then 'sent' else 'failed' end,
     expires_at=clock_timestamp()+interval '3 minutes',code_hash=case when p_action='sent' then code_hash else null end
     where id=(p_payload->>'id')::uuid and status='sending';
   return jsonb_build_object('ok',found);
 end if;
 select * into c from private.manee_sms_challenges where id=(p_payload->>'id')::uuid for update;
 if not found then return bad; end if;
 if p_action in ('verify','claim') then
   if c.username<>coalesce(p_payload->>'username','') or c.purpose<>coalesce(p_payload->>'purpose','') then return bad; end if;
   if c.purpose='bind' and (c.target_user_id is distinct from (p_payload->>'user_id')::uuid or c.session_id is distinct from (p_payload->>'session_id')::uuid
     or not exists(select 1 from auth.sessions s where s.id=c.session_id and s.user_id=c.target_user_id and (s.not_after is null or s.not_after>now()))) then return bad; end if;
 end if;
 if p_action='verify' then
   if c.status<>'sent' or c.expires_at<=clock_timestamp() or c.failed_attempts>=5 then return bad; end if;
   if c.code_hash is distinct from (p_payload->>'code_hash') then
     update private.manee_sms_challenges set failed_attempts=failed_attempts+1,
       status=case when failed_attempts+1>=5 then 'expired' else status end,
       code_hash=case when failed_attempts+1>=5 then null else code_hash end where id=c.id;
     return bad;
   end if;
   if (p_payload->>'proof_hash') is null or (p_payload->>'proof_hash') !~ '^[0-9a-f]{64}$' then return bad; end if;
   update private.manee_sms_challenges set status='verified',code_hash=null,proof_hash=p_payload->>'proof_hash',proof_expires_at=clock_timestamp()+interval '10 minutes' where id=c.id;
   return jsonb_build_object('ok',true);
 elsif p_action='claim' then
   if c.status<>'verified' or c.proof_expires_at<=clock_timestamp() or c.proof_hash is distinct from (p_payload->>'proof_hash') then return bad; end if;
   if c.purpose in ('reset','bind') and not private.manee_sms_ordinary_user(c.target_user_id) then return bad; end if;
   if c.purpose='reset' and not exists(select 1 from private.manee_sms_bindings b where b.user_id=c.target_user_id and b.phone_e164=c.phone_e164) then return bad; end if;
   if c.purpose='reset' then delete from auth.sessions where user_id=c.target_user_id; end if;
   op:=gen_random_uuid();
   update private.manee_sms_challenges set status='consuming',proof_hash=null,operation_id=op where id=c.id;
   return jsonb_build_object('ok',true,'operation_id',op,'user_id',c.target_user_id,'phone',c.phone_e164);
 elsif p_action='complete' then
   if c.operation_id is distinct from (p_payload->>'operation_id')::uuid or c.status<>'consuming' then return bad; end if;
   uid:=(p_payload->>'user_id')::uuid;
   if not private.manee_sms_ordinary_user(uid) or not exists(select 1 from public.profiles p where p.user_id=uid and p.username=c.username) then return bad; end if;
   if c.purpose in ('reset','bind') and uid is distinct from c.target_user_id then return bad; end if;
   if c.purpose<>'reset' then
     insert into private.manee_sms_bindings(user_id,phone_e164,verified_at) values(uid,c.phone_e164,clock_timestamp())
       on conflict(user_id) do update set phone_e164=excluded.phone_e164,verified_at=excluded.verified_at;
     -- Public contact fields are not an authority for password recovery.
     update public.profiles set phone_e164=c.phone_e164,phone_verified_at=clock_timestamp() where user_id=uid;
   else
     -- auth.refresh_tokens cascades from auth.sessions; existing RLS checks live sessions.
     delete from auth.sessions where user_id=uid;
   end if;
   update private.manee_sms_challenges set status='completed',target_user_id=uid,finished_at=clock_timestamp() where id=c.id;
   return jsonb_build_object('ok',true);
 end if;
 return bad;
end;
$function$;

REVOKE ALL ON FUNCTION "private"."manee_sms_service"(p_action text, p_payload jsonb) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION "private"."manee_sms_service"(p_action text, p_payload jsonb) TO "service_role";

CREATE OR REPLACE FUNCTION private.manee_social_signup(p_user_id uuid, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  profile public.profiles%rowtype;
  social_provider text := p_payload->>'provider';
  account_role text := p_payload->>'role';
  display_name text := btrim(coalesce(p_payload->>'displayName',''));
  store_name text := btrim(coalesce(p_payload->>'storeName',''));
  username text := 's_' || substr(replace(p_user_id::text,'-',''),1,28);
  store_id uuid;
begin
  if current_setting('role',true) is distinct from 'service_role' then raise exception 'Service access required' using errcode='42501'; end if;
  if p_user_id is null or social_provider is null or social_provider not in ('kakao','naver','apple') or
     not exists (select 1 from auth.users u where u.id=p_user_id and
       (u.banned_until is null or u.banned_until<=now())) or
     not exists (select 1 from auth.identities i where i.user_id=p_user_id and i.provider=case when social_provider='naver' then 'custom:naver' else social_provider end)
  then raise exception 'Verified social identity required' using errcode='42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('manee-social:'||p_user_id::text,0));
  select * into profile from public.profiles p where p.user_id=p_user_id;
  if found then
    if profile.status<>'active' then raise exception 'Account unavailable' using errcode='42501'; end if;
    return jsonb_build_object('ok',true,'alreadyRegistered',true,'userId',p_user_id);
  end if;
  if account_role is null or account_role not in ('owner','staff') or
     length(display_name) not between 1 and 50 or display_name ~ '[<>[:cntrl:]]' or
     p_payload->>'termsVersion' is distinct from '2026-10-26' or
     p_payload->>'privacyVersion' is distinct from '2026-10-26' or
     p_payload->>'ageConfirmed' is distinct from 'true'
  then raise exception 'Required signup information missing' using errcode='22023'; end if;
  if account_role='owner' then
    if length(store_name) not between 1 and 80 or store_name ~ '[<>[:cntrl:]]'
    then raise exception 'Invalid store name' using errcode='22023'; end if;
    store_id := public.bootstrap_owner_account(p_user_id,username,display_name,store_name,
      nullif(btrim(coalesce(p_payload->>'franchiseCode','')),''));
  else
    perform public.bootstrap_staff_account(p_user_id,username,display_name);
  end if;
  insert into private.social_signup_consents(user_id,provider,terms_version,privacy_version,age_14_plus_confirmed)
  values(p_user_id,social_provider,'2026-10-26','2026-10-26',true);
  return jsonb_build_object('ok',true,'alreadyRegistered',false,'userId',p_user_id,'storeId',store_id);
end;
$function$;

REVOKE ALL ON FUNCTION "private"."manee_social_signup"(p_user_id uuid, p_payload jsonb) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION "private"."manee_social_signup"(p_user_id uuid, p_payload jsonb) TO "service_role";

CREATE OR REPLACE FUNCTION private.manee_staff_expenses(p_store_id uuid, p_action text, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare uid uuid:=auth.uid();own boolean;e public.expense_entries;v public.vendors;d date;amt bigint;rid uuid;att jsonb;rev integer;result jsonb;start_day date;end_day date;
begin
 if uid is null or not private.is_live_manee_session() or not private.has_store_membership(p_store_id,null) then raise exception '매장 연결을 확인해 주세요.' using errcode='42501';end if;
 own:=private.has_store_membership(p_store_id,array['owner']::text[]);
 if p_action='list' then
  if coalesce(p_payload->>'month','') !~ '^20[0-9]{2}-(0[1-9]|1[0-2])$' then raise exception '조회 월을 확인해 주세요.';end if;
  start_day:=((p_payload->>'month')||'-01')::date;end_day:=(start_day+interval '1 month')::date;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.date desc,x.created_at desc),'[]'::jsonb) into result from (select t.*,exists(select 1 from private.manee_expense_receipts a where a.expense_id=t.id) as has_receipt from public.expense_entries t where t.store_id=p_store_id and t.date>=start_day and t.date<end_day and (own or t.created_by_user_id=uid)) x;
  return jsonb_build_object('entries',result,'vendors',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'default_category',default_category) order by name),'[]'::jsonb) from public.vendors where store_id=p_store_id and archived_at is null));
 end if;
 if p_action in('edit','delete','confirm','receipt') then
  select * into e from public.expense_entries where id=(p_payload->>'id')::uuid and store_id=p_store_id for update;
  if not found or (not own and e.created_by_user_id is distinct from uid) then raise exception '지출을 확인할 권한이 없어요.' using errcode='42501';end if;
  if p_action='receipt' then select jsonb_build_object('name',name,'type',mime,'data',data) into result from private.manee_expense_receipts where expense_id=e.id;return result;end if;
  if p_action='confirm' then
   if not own then raise exception '사장님만 확인할 수 있어요.' using errcode='42501';end if;
   if e.owner_confirmed_at is not null then return to_jsonb(e);end if;
   update public.expense_entries set owner_confirmed_at=now(),owner_confirmed_by=uid where id=e.id returning * into e;return to_jsonb(e);
  end if;
  if not own and e.owner_confirmed_at is not null then raise exception '사장님 확인 후에는 직원이 수정·삭제할 수 없어요.' using errcode='42501';end if;
  if e.staff_revision is distinct from (p_payload->>'revision')::integer then raise exception '다른 기기에서 변경됐어요. 다시 불러와 주세요.' using errcode='40001';end if;
  if p_action='delete' then
   if not private.manee_store_write_entitled(p_store_id) then raise exception '매장 구독 상태를 확인해 주세요.' using errcode='P4402';end if;
   delete from public.expense_entries where id=e.id and store_id=p_store_id;
   return jsonb_build_object('id',e.id,'deleted',true);
  end if;
 elsif p_action='create' then
  rid:=(p_payload->>'request_id')::uuid;if rid is null then raise exception '저장 요청을 확인해 주세요.';end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text||rid::text,0));
  select * into e from public.expense_entries where created_by_user_id=uid and staff_request_id=rid;
  if found then
   if e.store_id<>p_store_id then raise exception '요청 매장이 달라요.';end if;
   if e.date is distinct from (p_payload->>'date')::date or e.amount is distinct from (p_payload->>'amount')::bigint or e.vendor_id is distinct from (p_payload->>'vendor_id')::uuid or e.category is distinct from p_payload->>'category' or e.memo is distinct from coalesce(p_payload->>'memo','') or e.payment_method is distinct from p_payload->>'payment_method' or e.payment_status is distinct from p_payload->>'payment_status' then raise exception '이 요청은 이미 저장됐어요. 목록을 새로 불러온 뒤 해당 내역을 수정해 주세요.' using errcode='40001';end if;
   if p_payload->'receipt' is not null and p_payload->'receipt'<>'null'::jsonb and not exists(select 1 from private.manee_expense_receipts a where a.expense_id=e.id and a.data=p_payload->'receipt'->>'data' and a.mime=p_payload->'receipt'->>'type') then raise exception '이미 저장된 요청의 영수증은 내역 수정에서 변경해 주세요.' using errcode='40001';end if;
   return to_jsonb(e);
  end if;
 else raise exception '지원하지 않는 요청입니다.';end if;
 if not private.manee_store_write_entitled(p_store_id) then raise exception '매장 구독 상태를 확인해 주세요.' using errcode='P4402';end if;
 d:=(p_payload->>'date')::date;amt:=(p_payload->>'amount')::bigint;
 if d is null or d>(now() at time zone 'Asia/Seoul')::date or amt is null or amt<=0 or abs(amt)>2147483647 or length(coalesce(p_payload->>'memo',''))>1000 then raise exception '날짜·금액·비고를 확인해 주세요.';end if;
 select * into v from public.vendors where id=(p_payload->>'vendor_id')::uuid and store_id=p_store_id and archived_at is null;
 if not found then raise exception '현재 매장의 거래처를 선택해 주세요.';end if;
 if coalesce(p_payload->>'category','') not in('food','beverage','supplies','insurance','payroll_tax','utilities','fees','tax','other') or coalesce(p_payload->>'payment_method','') not in('cash','card','transfer','month_end') or coalesce(p_payload->>'payment_status','') not in('paid','unpaid') then raise exception '분류·결제수단·결제상태를 확인해 주세요.';end if;
 att:=p_payload->'receipt';
 if att is not null and att<>'null'::jsonb then
  if coalesce(att->>'type','') not in('image/jpeg','image/png') or coalesce(att->>'name','')='' or length(att->>'name')>200 or coalesce(att->>'data','')='' or length(att->>'data')>2800000 or (att->>'data') !~ '^[A-Za-z0-9+/]+={0,2}$' then raise exception 'JPG·PNG 2MB 이하 영수증을 선택해 주세요.';end if;
  if octet_length(decode(att->>'data','base64'))>2097152 then raise exception '영수증은 2MB 이하로 선택해 주세요.';end if;
  if (att->>'type'='image/png' and left(att->>'data',11)<>'iVBORw0KGgo') or (att->>'type'='image/jpeg' and left(att->>'data',4)<>'/9j/') then raise exception '사진 파일 형식을 확인해 주세요.';end if;
 end if;
 if p_action='create' then
  insert into public.expense_entries(store_id,date,description,amount,category,memo,vendor_id,payment_method,payment_status,staff_request_id) values(p_store_id,d,v.name,amt,p_payload->>'category',coalesce(p_payload->>'memo',''),v.id,p_payload->>'payment_method',p_payload->>'payment_status',rid) returning * into e;
 else
  update public.expense_entries set date=d,description=v.name,amount=amt,category=p_payload->>'category',memo=coalesce(p_payload->>'memo',''),vendor_id=v.id,payment_method=p_payload->>'payment_method',payment_status=p_payload->>'payment_status' where id=e.id returning * into e;
 end if;
 if att is not null and att<>'null'::jsonb then insert into private.manee_expense_receipts values(e.id,att->>'name',att->>'type',att->>'data') on conflict(expense_id) do update set name=excluded.name,mime=excluded.mime,data=excluded.data;end if;
 return to_jsonb(e);
end$function$;

REVOKE ALL ON FUNCTION "private"."manee_staff_expenses"(p_store_id uuid, p_action text, p_payload jsonb) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION "private"."manee_staff_expenses"(p_store_id uuid, p_action text, p_payload jsonb) TO "authenticated";

CREATE OR REPLACE FUNCTION private.manee_staff_portal(p_action text, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  result jsonb;
  personal private.staff_registration_profiles%rowtype;
  requester uuid;
  reqs jsonb;
begin
  if auth.uid() is null or not private.is_live_manee_session() then
    raise exception 'Authentication required' using errcode='42501';
  end if;
  result:=private.manee_staff_portal_before_self_profile(p_action,p_payload);
  if coalesce((result->>'ok')::boolean,false) is not true then return result; end if;

  if p_action='session' then
    select * into personal from private.staff_registration_profiles where user_id=auth.uid();
    if found then result:=result||jsonb_build_object('personal_profile',
      jsonb_build_object('phone',personal.phone)); end if;
  elsif p_action='owner_list' then
    select coalesce(jsonb_agg(e.value || case when p.user_id is null then '{}'::jsonb else
      jsonb_build_object('personal_profile',jsonb_build_object('phone',p.phone)) end order by e.ordinality),'[]'::jsonb)
      into reqs
      from jsonb_array_elements(coalesce(result->'requests','[]'::jsonb)) with ordinality e(value,ordinality)
      left join private.staff_registration_profiles p on p.user_id=(e.value->>'requester_user_id')::uuid;
    result:=result||jsonb_build_object('requests',reqs);
    -- Only enrich rows already authorized by the existing owner_list branch.
    -- Use immutable ids; employee names are not unique identifiers.
    result:=jsonb_set(result,'{links}',coalesce((
      select jsonb_agg(e.value||jsonb_build_object('crew_id',sm.crew_id) order by e.ordinality)
      from jsonb_array_elements(coalesce(result->'links','[]'::jsonb)) with ordinality e(value,ordinality)
      join public.store_memberships sm on sm.id=(e.value->>'id')::uuid
        and sm.store_id=(p_payload->>'store_id')::uuid
    ),'[]'::jsonb));
    result:=jsonb_set(result,'{attendance_edits}',coalesce((
      select jsonb_agg(e.value||jsonb_build_object('crew_id',r.crew_id,'attendance_id',a.id,
        'original_check_in',a.check_in,'original_check_out',a.check_out) order by e.ordinality)
      from jsonb_array_elements(coalesce(result->'attendance_edits','[]'::jsonb)) with ordinality e(value,ordinality)
      join public.attendance_edit_requests r on r.id=(e.value->>'id')::uuid
        and r.store_id=(p_payload->>'store_id')::uuid
      join public.attendance a on a.id=r.attendance_id and a.store_id=r.store_id and a.crew_id=r.crew_id
    ),'[]'::jsonb));
  elsif p_action='approve_new' and coalesce((result->>'created_new')::boolean,false) then
    select requester_user_id into requester from private.staff_link_requests where id=(p_payload->>'request_id')::uuid;
    perform pg_advisory_xact_lock(hashtextextended('self_profile:'||requester::text,0));
    select * into personal from private.staff_registration_profiles where user_id=requester;
    if found then
      update public.crew set phone=personal.phone,
        self_service_profile=true,employment_setup_required=true
        where id=(result->>'crew_id')::uuid;
      result:=result||jsonb_build_object('employment_setup_required',true);
      insert into private.profile_adoption(crew_id,user_id,field)
        select (result->>'crew_id')::uuid,requester,f from unnest(array['name','phone']) f on conflict do nothing;
    end if;
    perform private.sync_self_profile_to_crew(requester,(result->>'crew_id')::uuid,'join','init',true);
  end if;
  return result;
end;
$function$;

CREATE OR REPLACE FUNCTION private.queue_android_business_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare event_kind text; row_data jsonb; sid uuid; source text; today date:=(now() at time zone 'Asia/Seoul')::date;
begin
 row_data:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
 sid:=(row_data->>'store_id')::uuid;source:=row_data->>'id';
 if tg_table_name='attendance' then
  if new.date not between today-1 and today then return null;end if;
  if tg_op='INSERT' then
   if new.check_in is not null and new.check_out is null then event_kind:='attendance_in';end if;
  elsif new.check_out is not null and old.check_out is null then event_kind:='attendance_out';
  elsif new.check_in is not null and old.check_in is null then event_kind:='attendance_in';end if;
 elsif tg_table_name='reservations' then
  if tg_op='DELETE' or (tg_op='UPDATE' and new.status<>'confirmed') then
   update private.android_push_deliveries set status='skipped',finished_at=now()
    where store_id=sid and source_id=source and kind in ('reservation_created','reservation_upcoming','reservation_due') and status='pending';
   if tg_op='DELETE' or new.status='cancelled' and old.status<>'cancelled' then event_kind:='reservation_cancelled';end if;
  elsif tg_op='INSERT' then event_kind:='reservation_created';end if;
  if (row_data->>'date')::date<today then return null;end if;
 elsif tg_table_name='monthly_report_closings' then event_kind:='report_closed';
 end if;
 if event_kind is not null then
  perform private.enqueue_android_event(sid,event_kind,source,event_kind||':'||source,now()+interval '2 hours');
  if tg_table_name='reservations' then perform private.wake_android_delivery();end if;
 end if;
 return null;
end $function$;

CREATE OR REPLACE FUNCTION private.queue_ios_business_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare event_kind text; row_data jsonb; sid uuid; source text; today date:=(now() at time zone 'Asia/Seoul')::date;
begin
 row_data:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
 sid:=(row_data->>'store_id')::uuid;source:=row_data->>'id';
 if tg_table_name='attendance' then
  if new.date not between today-1 and today then return null;end if;
  if tg_op='INSERT' then
   if new.check_in is not null and new.check_out is null then event_kind:='attendance_in';end if;
  elsif new.check_out is not null and old.check_out is null then event_kind:='attendance_out';
  elsif new.check_in is not null and old.check_in is null then event_kind:='attendance_in';end if;
 elsif tg_table_name='reservations' then
  if tg_op='DELETE' or (tg_op='UPDATE' and new.status<>'confirmed') then
   update private.ios_push_deliveries set status='skipped',finished_at=now()
    where store_id=sid and source_id=source and kind in ('reservation_created','reservation_upcoming','reservation_due') and status='pending';
   if tg_op='DELETE' or new.status='cancelled' and old.status<>'cancelled' then event_kind:='reservation_cancelled';end if;
  elsif tg_op='INSERT' then event_kind:='reservation_created';end if;
  if (row_data->>'date')::date<today then return null;end if;
 elsif tg_table_name='monthly_report_closings' then event_kind:='report_closed';
 end if;
 if event_kind is not null then
  perform private.enqueue_ios_event(sid,event_kind,source,event_kind||':'||source,now()+interval '2 hours');
  if tg_table_name='reservations' then perform private.wake_ios_delivery();end if;
 end if;
 return null;
end $function$;

CREATE OR REPLACE FUNCTION private.seed_android_reminders(p_now timestamp with time zone DEFAULT now())
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r record; local_now timestamp:=p_now at time zone 'Asia/Seoul'; today date:=local_now::date;
 month text:=to_char(local_now,'YYYY-MM');last_day date:=(date_trunc('month',local_now)+interval '1 month - 1 day')::date;
begin
 for r in select id,store_id,date,time from public.reservations
  where status='confirmed' and date between today-1 and today+1 and time ~ '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$'
 loop
  if r.date+r.time::time>local_now+interval '1 minute' and r.date+r.time::time<=local_now+interval '30 minutes' then
   perform private.enqueue_android_event(r.store_id,'reservation_upcoming',r.id::text,
    'reservation_upcoming:'||r.id::text||':'||r.date::text||':'||r.time, (r.date+r.time::time) at time zone 'Asia/Seoul');
  end if;
  if r.date+r.time::time<=local_now and r.date+r.time::time>local_now-interval '5 minutes' then
   perform private.enqueue_android_event(r.store_id,'reservation_due',r.id::text,
    'reservation_due:'||r.id::text||':'||r.date::text||':'||r.time, ((r.date+r.time::time) at time zone 'Asia/Seoul')+interval '10 minutes');
  end if;
 end loop;
 if local_now::time<'10:00'::time or local_now::time>='21:00'::time then return;end if;
 for r in select distinct s.id,due.month_key from public.stores s
  cross join lateral (select month month_key where today in(last_day-7,last_day-3,last_day)
   union select v.month_key from public.monthly_cost_reviews v where v.store_id=s.id and v.remind_after=today) due
  left join public.monthly_cost_reviews v on v.store_id=s.id and v.month_key=due.month_key
  where s.archived_at is null and v.completed_at is null
   and ((due.month_key=month and v.remind_after is null and today in(last_day-7,last_day-3,last_day)) or v.remind_after=today)
   and exists(select 1 from public.sales_reports sr where sr.store_id=s.id
    and sr.date>=to_date(due.month_key||'-01','YYYY-MM-DD')
    and sr.date<to_date(due.month_key||'-01','YYYY-MM-DD')+interval '1 month' and sr.date<=today)
 loop
  perform private.enqueue_android_event(r.id,'monthly_costs',r.month_key,
   'monthly_costs:'||r.id::text||':'||r.month_key||':'||today::text,(today+time '21:00') at time zone 'Asia/Seoul');
 end loop;
end $function$;

CREATE OR REPLACE FUNCTION private.set_crew_manager_flag(target_crew_id uuid, is_manager boolean)
 RETURNS crew
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c public.crew; p private.manee_manager_permissions;
begin
 if auth.uid() is null or not private.is_live_manee_session() then raise exception '다시 로그인해 주세요.' using errcode='42501';end if;
 select * into c from public.crew where id=target_crew_id for update;
 if c.id is null or not private.has_store_membership(c.store_id,array['owner']::text[]) then raise exception '사장님만 권한을 변경할 수 있어요.' using errcode='42501';end if;
 select * into p from private.manee_manager_permissions where crew_id=c.id;
 perform private.manee_manager_permissions(c.id,case when is_manager then 'save' else 'revoke' end,
   case when is_manager then coalesce(p.permissions,private.manee_manager_normalize('{"view":"ratios","salesWrite":true}')) else null end,coalesce(p.revision,0));
 select * into c from public.crew where id=target_crew_id;return c;
end $function$;

CREATE OR REPLACE FUNCTION public.manee_manager_permissions(p_crew_id uuid, p_action text DEFAULT 'get'::text, p_permissions jsonb DEFAULT NULL::jsonb, p_revision bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$select private.manee_manager_permissions(p_crew_id,p_action,p_permissions,p_revision)$function$;

REVOKE ALL ON FUNCTION "public"."manee_manager_permissions"(p_crew_id uuid, p_action text, p_permissions jsonb, p_revision bigint) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION "public"."manee_manager_permissions"(p_crew_id uuid, p_action text, p_permissions jsonb, p_revision bigint) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."manee_manager_permissions"(p_crew_id uuid, p_action text, p_permissions jsonb, p_revision bigint) TO "service_role";

CREATE OR REPLACE FUNCTION public.manee_manager_portal(p_store_id uuid, p_month_key text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$select private.manee_manager_portal(p_store_id,p_month_key)$function$;

REVOKE ALL ON FUNCTION "public"."manee_manager_portal"(p_store_id uuid, p_month_key text) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION "public"."manee_manager_portal"(p_store_id uuid, p_month_key text) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."manee_manager_portal"(p_store_id uuid, p_month_key text) TO "service_role";

CREATE OR REPLACE FUNCTION public.manee_manager_review(p_store_id uuid, p_month_key text, p_action text DEFAULT 'get'::text)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$select private.manee_manager_review(p_store_id,p_month_key,p_action)$function$;

REVOKE ALL ON FUNCTION "public"."manee_manager_review"(p_store_id uuid, p_month_key text, p_action text) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION "public"."manee_manager_review"(p_store_id uuid, p_month_key text, p_action text) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."manee_manager_review"(p_store_id uuid, p_month_key text, p_action text) TO "service_role";

CREATE OR REPLACE FUNCTION public.manee_manager_write(p_store_id uuid, p_month_key text, p_action text, p_crew_id uuid, p_payload jsonb, p_previous jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$select private.manee_manager_write(p_store_id,p_month_key,p_action,p_crew_id,p_payload,p_previous)$function$;

REVOKE ALL ON FUNCTION "public"."manee_manager_write"(p_store_id uuid, p_month_key text, p_action text, p_crew_id uuid, p_payload jsonb, p_previous jsonb) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION "public"."manee_manager_write"(p_store_id uuid, p_month_key text, p_action text, p_crew_id uuid, p_payload jsonb, p_previous jsonb) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."manee_manager_write"(p_store_id uuid, p_month_key text, p_action text, p_crew_id uuid, p_payload jsonb, p_previous jsonb) TO "service_role";

CREATE OR REPLACE FUNCTION public.manee_save_contract(p_store_id uuid, p_crew_id uuid, p_document jsonb, p_previous integer DEFAULT 0, p_attachment jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$select private.manee_save_contract(p_store_id,p_crew_id,p_document,p_previous,p_attachment);$function$;

REVOKE ALL ON FUNCTION "public"."manee_save_contract"(p_store_id uuid, p_crew_id uuid, p_document jsonb, p_previous integer, p_attachment jsonb) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION "public"."manee_save_contract"(p_store_id uuid, p_crew_id uuid, p_document jsonb, p_previous integer, p_attachment jsonb) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."manee_save_contract"(p_store_id uuid, p_crew_id uuid, p_document jsonb, p_previous integer, p_attachment jsonb) TO "service_role";

CREATE OR REPLACE FUNCTION public.manee_sector3_review(p_store_id uuid, p_month_key text, p_action text DEFAULT 'get'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare eh text;fh text;r public.sector3_reviews;
begin
 if not private.can_manage_store(p_store_id) or not private.is_live_manee_session() then raise exception 'Not allowed' using errcode='42501';end if;
 if p_month_key !~ '^\d{4}-(0[1-9]|1[0-2])$' or p_action not in ('get','expenses','fixed','reopen') then raise exception 'Invalid request';end if;
 select md5(coalesce(jsonb_agg(to_jsonb(e) order by e.id)::text,'[]')) into eh from public.expense_entries e where e.store_id=p_store_id and to_char(date,'YYYY-MM')=p_month_key;
 select md5(coalesce(jsonb_agg(to_jsonb(f) order by f.id)::text,'[]')) into fh from public.fixed_expenses f where f.store_id=p_store_id and f.month_key=p_month_key;
 if p_action<>'get' then
 insert into public.sector3_reviews(store_id,month_key) values(p_store_id,p_month_key) on conflict do nothing;
 if p_action='expenses' then update public.sector3_reviews set expense_hash=eh where store_id=p_store_id and month_key=p_month_key;
 elsif p_action='fixed' then update public.sector3_reviews set fixed_hash=fh where store_id=p_store_id and month_key=p_month_key;
 else update public.sector3_reviews set expense_hash=null,fixed_hash=null where store_id=p_store_id and month_key=p_month_key;end if;end if;
 select * into r from public.sector3_reviews where store_id=p_store_id and month_key=p_month_key;
 return jsonb_build_object('expenses',coalesce(r.expense_hash=eh,false),'fixed',coalesce(r.fixed_hash=fh,false));
end $function$;

REVOKE ALL ON FUNCTION "public"."manee_sector3_review"(p_store_id uuid, p_month_key text, p_action text) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION "public"."manee_sector3_review"(p_store_id uuid, p_month_key text, p_action text) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."manee_sector3_review"(p_store_id uuid, p_month_key text, p_action text) TO "service_role";

CREATE OR REPLACE FUNCTION public.manee_sector3_save(p_store_id uuid, p_date date, p_request_id uuid, p_sales jsonb DEFAULT NULL::jsonb, p_expenses jsonb DEFAULT '[]'::jsonb, p_previous timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$select private.manee_sector3_save(p_store_id,p_date,p_request_id,p_sales,p_expenses,p_previous)$function$;

REVOKE ALL ON FUNCTION "public"."manee_sector3_save"(p_store_id uuid, p_date date, p_request_id uuid, p_sales jsonb, p_expenses jsonb, p_previous timestamp with time zone) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION "public"."manee_sector3_save"(p_store_id uuid, p_date date, p_request_id uuid, p_sales jsonb, p_expenses jsonb, p_previous timestamp with time zone) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."manee_sector3_save"(p_store_id uuid, p_date date, p_request_id uuid, p_sales jsonb, p_expenses jsonb, p_previous timestamp with time zone) TO "service_role";

CREATE OR REPLACE FUNCTION public.manee_sector3_vendor(p_store_id uuid, p_id uuid, p_action text DEFAULT 'inspect'::text, p_name text DEFAULT NULL::text, p_category text DEFAULT NULL::text, p_count bigint DEFAULT NULL::bigint, p_total bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v public.vendors;n bigint;a bigint;
begin
 if not private.can_manage_store(p_store_id) or not private.is_live_manee_session() then raise exception 'Not allowed' using errcode='42501';end if;
 if p_action not in ('save','inspect','archive','restore') then raise exception 'Invalid request';end if;
 if p_action='save' then
 if length(trim(coalesce(p_name,''))) not between 1 and 120 or p_category is not null and p_category not in ('per_entry','food','beverage','supplies','insurance','payroll_tax','utilities','fees','tax','other') then raise exception 'Invalid vendor';end if;
 if exists(select 1 from public.vendors where store_id=p_store_id and lower(trim(name))=lower(trim(p_name)) and id is distinct from p_id) then raise exception '같은 이름의 거래처가 있어요. 삭제 목록도 확인해 주세요.';end if;
 if p_id is null then insert into public.vendors(store_id,name,default_category) values(p_store_id,trim(p_name),p_category) returning * into v;
 else update public.vendors set name=trim(p_name),default_category=p_category where id=p_id and store_id=p_store_id returning * into v;end if;
 else select * into v from public.vendors where id=p_id and store_id=p_store_id for update;end if;
 if v.id is null then raise exception 'Vendor not found';end if;
 select count(*),coalesce(sum(amount),0) into n,a from public.expense_entries where store_id=p_store_id and (vendor_id=v.id or vendor_id is null and description=v.name);
 if p_action='archive' then
 if p_count is distinct from n or p_total is distinct from a then raise exception '지출이 변경됐어요. 다시 확인해 주세요.';end if;
 update public.vendors set archived_at=now() where id=v.id returning * into v;
 elsif p_action='restore' then update public.vendors set archived_at=null where id=v.id returning * into v;end if;
 return jsonb_build_object('vendor',to_jsonb(v),'count',n,'total',a);
end $function$;

REVOKE ALL ON FUNCTION "public"."manee_sector3_vendor"(p_store_id uuid, p_id uuid, p_action text, p_name text, p_category text, p_count bigint, p_total bigint) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION "public"."manee_sector3_vendor"(p_store_id uuid, p_id uuid, p_action text, p_name text, p_category text, p_count bigint, p_total bigint) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."manee_sector3_vendor"(p_store_id uuid, p_id uuid, p_action text, p_name text, p_category text, p_count bigint, p_total bigint) TO "service_role";

CREATE OR REPLACE FUNCTION public.manee_sector4_notice(p_store_id uuid, p_id uuid, p_payload jsonb, p_version integer DEFAULT NULL::integer, p_request_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare r public.announcements%rowtype;
begin
 if auth.uid() is null or not private.is_live_manee_session() or not private.can_manage_store(p_store_id) then raise exception 'Manager required' using errcode='42501';end if;
 if p_id is null and p_request_id is not null then perform pg_advisory_xact_lock(hashtextextended(p_store_id::text||p_request_id::text,4));end if;
 if p_id is null and p_request_id is not null then select * into r from public.announcements where store_id=p_store_id and request_id=p_request_id; if found then return to_jsonb(r);end if;end if;
 if coalesce(length(btrim(p_payload->>'title')),0) not between 1 and 200 or coalesce(length(btrim(p_payload->>'body')),0) not between 1 and 10000 or coalesce(p_payload->>'audience','all') not in ('all','홀','주방') then raise exception '공지 제목·내용·대상을 확인해 주세요.' using errcode='22023';end if;
 if p_id is null then
  insert into public.announcements(store_id,title,body,important,audience,request_id) values(p_store_id,btrim(p_payload->>'title'),btrim(p_payload->>'body'),coalesce((p_payload->>'important')::boolean,false),coalesce(p_payload->>'audience','all'),p_request_id) returning * into r;
 else
  update public.announcements set title=btrim(p_payload->>'title'),body=btrim(p_payload->>'body'),important=coalesce((p_payload->>'important')::boolean,false),audience=coalesce(p_payload->>'audience','all'),archived=coalesce((p_payload->>'archived')::boolean,false) where store_id=p_store_id and id=p_id and version=p_version returning * into r;
  if not found then raise exception '다른 기기에서 변경됐어요. 창을 닫고 새로 불러와 주세요.' using errcode='40001';end if;
 end if;
 return to_jsonb(r);
end $function$;

REVOKE ALL ON FUNCTION "public"."manee_sector4_notice"(p_store_id uuid, p_id uuid, p_payload jsonb, p_version integer, p_request_id uuid) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION "public"."manee_sector4_notice"(p_store_id uuid, p_id uuid, p_payload jsonb, p_version integer, p_request_id uuid) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."manee_sector4_notice"(p_store_id uuid, p_id uuid, p_payload jsonb, p_version integer, p_request_id uuid) TO "service_role";

CREATE OR REPLACE FUNCTION public.manee_sector4_reservation(p_store_id uuid, p_id bigint, p_payload jsonb, p_version integer DEFAULT NULL::integer, p_request_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare r public.reservations%rowtype; oldr public.reservations%rowtype; n text; d date; t text; people int; st text;
begin
 if auth.uid() is null or not private.is_live_manee_session() or not private.has_store_membership(p_store_id,null) then raise exception 'Membership required' using errcode='42501';end if;
 if p_id is null and p_request_id is not null then perform pg_advisory_xact_lock(hashtextextended(p_store_id::text||p_request_id::text,4));end if;
 if p_id is null and p_request_id is not null then select * into r from public.reservations where store_id=p_store_id and request_id=p_request_id; if found then return to_jsonb(r);end if;end if;
 if p_id is not null then
  select * into oldr from public.reservations where store_id=p_store_id and id=p_id for update;
  if not found then raise exception '예약이 없거나 접근할 수 없어요.' using errcode='42501';end if;
  if p_version is distinct from oldr.version then raise exception '다른 기기에서 변경됐어요. 창을 닫고 새로 불러와 주세요.' using errcode='40001';end if;
 end if;
 n:=btrim(p_payload->>'customer_name');d:=(p_payload->>'date')::date;t:=p_payload->>'time';people:=(p_payload->>'party_size')::int;st:=coalesce(p_payload->>'status','confirmed');
 if coalesce(length(n),0) not between 1 and 100 or d is null or t is null or t !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or people is null or people not between 1 and 999 or st not in ('confirmed','visited','cancelled','noshow') or length(coalesce(p_payload->>'phone',''))>40 or length(coalesce(p_payload->>'memo',''))>2000 then raise exception '예약 이름·날짜·시간·인원을 확인해 주세요.' using errcode='22023';end if;
 if (p_id is null or d is distinct from oldr.date) and d<(now() at time zone 'Asia/Seoul')::date then raise exception '새 예약은 오늘 이후로 등록해 주세요.' using errcode='22023';end if;
 if st='cancelled' and coalesce(length(btrim(p_payload->>'cancel_reason')),0) not between 1 and 1000 then raise exception '취소 이유를 입력해 주세요.' using errcode='22023';end if;
 if p_id is null then
  insert into public.reservations(store_id,date,time,customer_name,phone,party_size,memo,status,cancel_reason,request_id)
  values(p_store_id,d,t,n,coalesce(p_payload->>'phone',''),people,coalesce(p_payload->>'memo',''),st,coalesce(p_payload->>'cancel_reason',''),p_request_id) returning * into r;
 else
  update public.reservations set date=d,time=t,customer_name=n,phone=coalesce(p_payload->>'phone',''),party_size=people,memo=coalesce(p_payload->>'memo',''),status=st,cancel_reason=case when st='cancelled' then btrim(p_payload->>'cancel_reason') else '' end,version=version+1,updated_at=clock_timestamp() where store_id=p_store_id and id=p_id returning * into r;
 end if;
 return to_jsonb(r);
end $function$;

REVOKE ALL ON FUNCTION "public"."manee_sector4_reservation"(p_store_id uuid, p_id bigint, p_payload jsonb, p_version integer, p_request_id uuid) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION "public"."manee_sector4_reservation"(p_store_id uuid, p_id bigint, p_payload jsonb, p_version integer, p_request_id uuid) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."manee_sector4_reservation"(p_store_id uuid, p_id bigint, p_payload jsonb, p_version integer, p_request_id uuid) TO "service_role";

CREATE OR REPLACE FUNCTION public.manee_sms_service(p_action text, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$ select private.manee_sms_service(p_action,p_payload); $function$;

REVOKE ALL ON FUNCTION "public"."manee_sms_service"(p_action text, p_payload jsonb) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION "public"."manee_sms_service"(p_action text, p_payload jsonb) TO "service_role";

CREATE OR REPLACE FUNCTION public.manee_social_signup(p_user_id uuid, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$ select private.manee_social_signup(p_user_id,p_payload); $function$;

REVOKE ALL ON FUNCTION "public"."manee_social_signup"(p_user_id uuid, p_payload jsonb) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION "public"."manee_social_signup"(p_user_id uuid, p_payload jsonb) TO "service_role";

CREATE OR REPLACE FUNCTION public.manee_staff_expenses(p_store_id uuid, p_action text, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
 RETURN private.manee_staff_expenses(p_store_id,p_action,p_payload);
EXCEPTION WHEN SQLSTATE '40001' THEN
 RAISE SQLSTATE 'PT409' USING MESSAGE=SQLERRM;
END;
$function$;

REVOKE ALL ON FUNCTION "public"."manee_staff_expenses"(p_store_id uuid, p_action text, p_payload jsonb) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION "public"."manee_staff_expenses"(p_store_id uuid, p_action text, p_payload jsonb) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."manee_staff_expenses"(p_store_id uuid, p_action text, p_payload jsonb) TO "service_role";

INSERT INTO private.manee_manager_permissions(crew_id,store_id,enabled,permissions,migrated)
SELECT c.id,c.store_id,true,private.manee_manager_normalize(jsonb_build_object(
 'view',case when c.sales_access or s.manager_dashboard_enabled then 'sales' else 'none' end,
 'salesWrite',true,'schedule',true,'wage',true,'payroll',true,'reportView',true,'reportEdit',true,'export',true)),true
FROM public.crew c JOIN public.stores s ON s.id=c.store_id
WHERE c.is_manager OR EXISTS(SELECT 1 FROM public.store_memberships m WHERE m.crew_id=c.id AND m.store_id=c.store_id AND m.status='active' AND m.role='manager')
ON CONFLICT(crew_id) DO NOTHING;
INSERT INTO public.checklist_history(store_id,date,revision,done,total,closed_at)
SELECT store_id,date,1,done,total,coalesce(closed_at,now()) FROM public.checklist_log ON CONFLICT DO NOTHING;
UPDATE public.announcement_reads SET revision=1 WHERE revision IS NULL;

CREATE POLICY manee_security_live_session ON "public"."announcement_reads" AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT private.is_live_manee_session())) WITH CHECK ((SELECT private.is_live_manee_session()));

CREATE TRIGGER sector4_notice_read_revision BEFORE INSERT OR UPDATE ON announcement_reads FOR EACH ROW EXECUTE FUNCTION private.manee_notice_revision_guard();

CREATE POLICY "announcement_audience_guard" ON "public"."announcements" AS RESTRICTIVE FOR SELECT TO "authenticated" USING (private.manee_notice_visible(store_id, audience, archived));

CREATE POLICY manee_security_live_session ON "public"."announcements" AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT private.is_live_manee_session())) WITH CHECK ((SELECT private.is_live_manee_session()));

CREATE TRIGGER sector4_notice_revision BEFORE INSERT OR UPDATE ON announcements FOR EACH ROW EXECUTE FUNCTION private.manee_notice_revision_guard();

CREATE POLICY manee_security_live_session ON "public"."app_settings" AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT private.is_live_manee_session())) WITH CHECK ((SELECT private.is_live_manee_session()));

CREATE POLICY "manee_delegated_attendance_read" ON "public"."attendance" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((private.manee_manager_cap(store_id, 'payroll'::text) OR private.manee_manager_cap(store_id, 'schedule'::text)));

CREATE POLICY manee_security_live_session ON "public"."attendance" AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT private.is_live_manee_session())) WITH CHECK ((SELECT private.is_live_manee_session()));

CREATE POLICY manee_security_live_session ON "public"."attendance_edit_requests" AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT private.is_live_manee_session())) WITH CHECK ((SELECT private.is_live_manee_session()));

CREATE POLICY manee_security_live_session ON "public"."auth_rate_limits" AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT private.is_live_manee_session())) WITH CHECK ((SELECT private.is_live_manee_session()));

CREATE POLICY manee_security_live_session ON "public"."checklist_checks" AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT private.is_live_manee_session())) WITH CHECK ((SELECT private.is_live_manee_session()));

CREATE POLICY "checklist_history_read" ON "public"."checklist_history" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((private.can_view_store(store_id) AND ( SELECT private.is_live_manee_session() AS is_live_manee_session)));

CREATE POLICY manee_security_live_session ON "public"."checklist_history" AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT private.is_live_manee_session())) WITH CHECK ((SELECT private.is_live_manee_session()));

CREATE POLICY manee_security_live_session ON "public"."checklist_log" AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT private.is_live_manee_session())) WITH CHECK ((SELECT private.is_live_manee_session()));

CREATE POLICY manee_security_live_session ON "public"."checklist_templates" AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT private.is_live_manee_session())) WITH CHECK ((SELECT private.is_live_manee_session()));

CREATE POLICY manee_security_live_session ON "public"."crew" AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT private.is_live_manee_session())) WITH CHECK ((SELECT private.is_live_manee_session()));

CREATE POLICY "manee_delegated_adjustments_read" ON "public"."crew_pay_adjustments" AS PERMISSIVE FOR SELECT TO "authenticated" USING (private.manee_manager_cap(store_id, 'payroll'::text));

CREATE POLICY manee_security_live_session ON "public"."crew_pay_adjustments" AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT private.is_live_manee_session())) WITH CHECK ((SELECT private.is_live_manee_session()));

ALTER POLICY "expense_entries_insert_v2" ON "public"."expense_entries" TO "authenticated" WITH CHECK ((private.can_write_financials(store_id) OR (private.manee_manager_cap(store_id, 'salesWrite'::text) AND (created_by_user_id = auth.uid()))));

ALTER POLICY "expense_entries_select_v2" ON "public"."expense_entries" TO "authenticated" USING ((private.can_view_financials(store_id) OR (private.manee_manager_cap(store_id, 'salesWrite'::text) AND (created_by_user_id = auth.uid()))));

CREATE POLICY manee_security_live_session ON "public"."expense_entries" AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT private.is_live_manee_session())) WITH CHECK ((SELECT private.is_live_manee_session()));

CREATE TRIGGER manee_expense_author BEFORE INSERT OR UPDATE ON expense_entries FOR EACH ROW EXECUTE FUNCTION private.manee_expense_author();

CREATE POLICY manee_security_live_session ON "public"."fixed_expenses" AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT private.is_live_manee_session())) WITH CHECK ((SELECT private.is_live_manee_session()));

ALTER POLICY "manager_write" ON "public"."fixed_schedules" TO "authenticated" USING (private.manee_schedule_access(store_id)) WITH CHECK ((private.manee_schedule_access(store_id) AND private.crew_belongs_to_store(crew_id, store_id)));

CREATE POLICY "manee_fixed_schedule_boundary" ON "public"."fixed_schedules" AS RESTRICTIVE FOR SELECT TO "authenticated" USING ((private.manee_schedule_access(store_id) OR (crew_id = private.current_crew_id(store_id))));

CREATE POLICY manee_security_live_session ON "public"."fixed_schedules" AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT private.is_live_manee_session())) WITH CHECK ((SELECT private.is_live_manee_session()));

CREATE POLICY manee_security_live_session ON "public"."franchise_financial_targets" AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT private.is_live_manee_session())) WITH CHECK ((SELECT private.is_live_manee_session()));

CREATE POLICY manee_security_live_session ON "public"."franchise_memberships" AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT private.is_live_manee_session())) WITH CHECK ((SELECT private.is_live_manee_session()));

CREATE POLICY "contract_owner_or_employee_read" ON "public"."manee_contract_documents" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((private.is_live_manee_session() AND (private.has_store_membership(store_id, ARRAY['owner'::text]) OR (crew_id = private.current_crew_id(store_id)))));

CREATE POLICY manee_security_live_session ON "public"."manee_contract_documents" AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT private.is_live_manee_session())) WITH CHECK ((SELECT private.is_live_manee_session()));

CREATE TRIGGER manee_validate_attachments BEFORE INSERT OR UPDATE ON manee_contract_documents FOR EACH ROW EXECUTE FUNCTION private.manee_validate_attachments();

CREATE POLICY manee_security_live_session ON "public"."monthly_cost_checks" AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT private.is_live_manee_session())) WITH CHECK ((SELECT private.is_live_manee_session()));

CREATE POLICY manee_security_live_session ON "public"."monthly_cost_reviews" AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT private.is_live_manee_session())) WITH CHECK ((SELECT private.is_live_manee_session()));

CREATE POLICY "manee_delegated_payroll_read" ON "public"."monthly_net_payroll" AS PERMISSIVE FOR SELECT TO "authenticated" USING (private.manee_manager_cap(store_id, 'payroll'::text));

CREATE POLICY manee_security_live_session ON "public"."monthly_net_payroll" AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT private.is_live_manee_session())) WITH CHECK ((SELECT private.is_live_manee_session()));

ALTER POLICY "closing_financial_read" ON "public"."monthly_report_closings" TO "authenticated" USING (private.can_view_financials(store_id));

CREATE POLICY manee_security_live_session ON "public"."monthly_report_closings" AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT private.is_live_manee_session())) WITH CHECK ((SELECT private.is_live_manee_session()));

CREATE POLICY manee_security_live_session ON "public"."owner_report_home_notices" AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT private.is_live_manee_session())) WITH CHECK ((SELECT private.is_live_manee_session()));

CREATE POLICY manee_security_live_session ON "public"."owner_requests" AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT private.is_live_manee_session())) WITH CHECK ((SELECT private.is_live_manee_session()));

CREATE POLICY manee_security_live_session ON "public"."payroll_change_log" AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT private.is_live_manee_session())) WITH CHECK ((SELECT private.is_live_manee_session()));

CREATE POLICY manee_security_live_session ON "public"."platform_admins" AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT private.is_live_manee_session())) WITH CHECK ((SELECT private.is_live_manee_session()));

CREATE POLICY manee_security_live_session ON "public"."recurring_cost_templates" AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT private.is_live_manee_session())) WITH CHECK ((SELECT private.is_live_manee_session()));

DROP TRIGGER "android_reservation_event" ON "public"."reservations";

CREATE TRIGGER android_reservation_event AFTER INSERT OR DELETE OR UPDATE ON reservations FOR EACH ROW EXECUTE FUNCTION private.queue_android_business_event();

DROP TRIGGER "ios_reservation_event" ON "public"."reservations";

CREATE TRIGGER ios_reservation_event AFTER INSERT OR DELETE OR UPDATE ON reservations FOR EACH ROW EXECUTE FUNCTION private.queue_ios_business_event();

CREATE POLICY manee_security_live_session ON "public"."sales_report_photos" AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT private.is_live_manee_session())) WITH CHECK ((SELECT private.is_live_manee_session()));

ALTER POLICY "sales_reports_insert_v2" ON "public"."sales_reports" TO "authenticated" WITH CHECK (private.manee_sales_write(store_id, crew_id, date));

ALTER POLICY "sales_reports_select_v2" ON "public"."sales_reports" TO "authenticated" USING (private.manee_sales_read(store_id, crew_id));

ALTER POLICY "sales_reports_update_v2" ON "public"."sales_reports" TO "authenticated" USING (private.manee_sales_write(store_id, crew_id, date)) WITH CHECK (private.manee_sales_write(store_id, crew_id, date));

CREATE POLICY manee_security_live_session ON "public"."schedule_change_log" AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT private.is_live_manee_session())) WITH CHECK ((SELECT private.is_live_manee_session()));

CREATE POLICY "s3_requests_owner" ON "public"."sector3_requests" AS PERMISSIVE FOR ALL TO "authenticated" USING ((private.can_manage_store(store_id) AND private.is_live_manee_session())) WITH CHECK ((private.can_manage_store(store_id) AND private.is_live_manee_session()));

CREATE POLICY manee_security_live_session ON "public"."sector3_requests" AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT private.is_live_manee_session())) WITH CHECK ((SELECT private.is_live_manee_session()));

CREATE POLICY "s3_reviews_owner" ON "public"."sector3_reviews" AS PERMISSIVE FOR ALL TO "authenticated" USING ((private.can_manage_store(store_id) AND private.is_live_manee_session())) WITH CHECK ((private.can_manage_store(store_id) AND private.is_live_manee_session()));

CREATE POLICY manee_security_live_session ON "public"."sector3_reviews" AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT private.is_live_manee_session())) WITH CHECK ((SELECT private.is_live_manee_session()));

ALTER POLICY "manager_write" ON "public"."shifts" TO "authenticated" USING (private.manee_schedule_access(store_id)) WITH CHECK ((private.manee_schedule_access(store_id) AND private.crew_belongs_to_store(crew_id, store_id)));

CREATE POLICY "manee_staff_schedule_delete_boundary" ON "public"."shifts" AS RESTRICTIVE FOR DELETE TO "authenticated" USING (private.manee_schedule_access(store_id));

CREATE POLICY "manee_staff_schedule_insert_boundary" ON "public"."shifts" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK (private.manee_schedule_access(store_id));

CREATE POLICY "manee_staff_schedule_read_boundary" ON "public"."shifts" AS RESTRICTIVE FOR SELECT TO "authenticated" USING ((private.manee_schedule_access(store_id) OR (crew_id = private.current_crew_id(store_id)) OR (date = (((now() AT TIME ZONE 'Asia/Seoul'::text) - make_interval(hours => COALESCE(( SELECT stores.business_day_cutoff_hour
   FROM stores
  WHERE (stores.id = shifts.store_id)), 6))))::date)));

CREATE POLICY "manee_staff_schedule_update_boundary" ON "public"."shifts" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING (private.manee_schedule_access(store_id)) WITH CHECK (private.manee_schedule_access(store_id));

CREATE POLICY manee_security_live_session ON "public"."shifts" AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT private.is_live_manee_session())) WITH CHECK ((SELECT private.is_live_manee_session()));

CREATE POLICY manee_security_live_session ON "public"."store_business_calendar" AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT private.is_live_manee_session())) WITH CHECK ((SELECT private.is_live_manee_session()));

CREATE POLICY manee_security_live_session ON "public"."store_memberships" AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT private.is_live_manee_session())) WITH CHECK ((SELECT private.is_live_manee_session()));

CREATE POLICY manee_security_live_session ON "public"."tax_reminder_ack" AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT private.is_live_manee_session())) WITH CHECK ((SELECT private.is_live_manee_session()));

CREATE POLICY manee_security_live_session ON "public"."vendors" AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT private.is_live_manee_session())) WITH CHECK ((SELECT private.is_live_manee_session()));

SELECT cron.schedule('manee-sms-challenge-retention','*/10 * * * *','select private.manee_purge_expired_sms_challenges(500);');

DO $postconditions$ BEGIN
IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='assert_cost_access' AND pg_get_function_identity_arguments(p.oid)='p_store uuid, p_month text' AND md5(pg_get_functiondef(p.oid))='6c19f690da8715e092e524d9b11bfaa2') THEN RAISE EXCEPTION 'Deployed function mismatch: assert_cost_access'; END IF;
IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='can_delete_financials' AND pg_get_function_identity_arguments(p.oid)='target_store_id uuid' AND md5(pg_get_functiondef(p.oid))='f0323fb81454bd2d61d8e6cdde5e46b2') THEN RAISE EXCEPTION 'Deployed function mismatch: can_delete_financials'; END IF;
IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='can_manage_store' AND pg_get_function_identity_arguments(p.oid)='target_store_id uuid' AND md5(pg_get_functiondef(p.oid))='1ab157dd26179b31011cbef5cdfbc4a6') THEN RAISE EXCEPTION 'Deployed function mismatch: can_manage_store'; END IF;
IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='can_view_financials' AND pg_get_function_identity_arguments(p.oid)='target_store_id uuid' AND md5(pg_get_functiondef(p.oid))='bb604b8fed999efa3e8047c0f306193b') THEN RAISE EXCEPTION 'Deployed function mismatch: can_view_financials'; END IF;
IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='can_write_financials' AND pg_get_function_identity_arguments(p.oid)='target_store_id uuid' AND md5(pg_get_functiondef(p.oid))='591a8a73c76fe830563a3d5827d5e78a') THEN RAISE EXCEPTION 'Deployed function mismatch: can_write_financials'; END IF;
IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='claim_android_deliveries' AND pg_get_function_identity_arguments(p.oid)='p_dispatch_token text' AND md5(pg_get_functiondef(p.oid))='32b575e0292a484802fceb27c506f5b8') THEN RAISE EXCEPTION 'Deployed function mismatch: claim_android_deliveries'; END IF;
IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='claim_ios_deliveries' AND pg_get_function_identity_arguments(p.oid)='p_dispatch_token text' AND md5(pg_get_functiondef(p.oid))='e516bb57ab5286a7152620ebc0911605') THEN RAISE EXCEPTION 'Deployed function mismatch: claim_ios_deliveries'; END IF;
IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='has_sales_access' AND pg_get_function_identity_arguments(p.oid)='target_store_id uuid' AND md5(pg_get_functiondef(p.oid))='45b087193fece2ca925561db9ff0a4f5') THEN RAISE EXCEPTION 'Deployed function mismatch: has_sales_access'; END IF;
IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='manee_checklist' AND pg_get_function_identity_arguments(p.oid)='p_action text, p_store_id uuid, p_date date, p_payload jsonb' AND md5(pg_get_functiondef(p.oid))='c08e6ad510668b633f354874efa15559') THEN RAISE EXCEPTION 'Deployed function mismatch: manee_checklist'; END IF;
IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='manee_checklist_due' AND pg_get_function_identity_arguments(p.oid)='p_item jsonb, p_date date' AND md5(pg_get_functiondef(p.oid))='883e2064dfb519e835331e02f5d2c288') THEN RAISE EXCEPTION 'Deployed function mismatch: manee_checklist_due'; END IF;
IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='manee_checklist_due' AND pg_get_function_identity_arguments(p.oid)='p_item jsonb, p_date date' AND has_function_privilege('anon',p.oid,'EXECUTE')) THEN RAISE EXCEPTION 'Anonymous grant on manee_checklist_due'; END IF;
IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='manee_close_month' AND pg_get_function_identity_arguments(p.oid)='p_store_id uuid, p_month_key text, p_request_id uuid, p_amendment_reason text' AND md5(pg_get_functiondef(p.oid))='554ab79903bc4129ccbad361921aaedc') THEN RAISE EXCEPTION 'Deployed function mismatch: manee_close_month'; END IF;
IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='manee_cost_review' AND pg_get_function_identity_arguments(p.oid)='p_store_id uuid, p_month_key text, p_action text, p_payload jsonb' AND md5(pg_get_functiondef(p.oid))='62bac6f887e4fda5b1155e569fc4e3e0') THEN RAISE EXCEPTION 'Deployed function mismatch: manee_cost_review'; END IF;
IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='manee_expense_author' AND pg_get_function_identity_arguments(p.oid)='' AND md5(pg_get_functiondef(p.oid))='54ae096b62a168af33d9e6ce63af7110') THEN RAISE EXCEPTION 'Deployed function mismatch: manee_expense_author'; END IF;
IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='manee_expense_author' AND pg_get_function_identity_arguments(p.oid)='' AND has_function_privilege('anon',p.oid,'EXECUTE')) THEN RAISE EXCEPTION 'Anonymous grant on manee_expense_author'; END IF;
IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='manee_financial_report' AND pg_get_function_identity_arguments(p.oid)='p_store_id uuid, p_month_key text' AND md5(pg_get_functiondef(p.oid))='8d96f01ae9e72bb7d0c1286475aebbad') THEN RAISE EXCEPTION 'Deployed function mismatch: manee_financial_report'; END IF;
IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='manee_ios_claim_scheduled_deliveries' AND pg_get_function_identity_arguments(p.oid)='' AND md5(pg_get_functiondef(p.oid))='aab9c7353be09a6d5bccd7ea9a5fb778') THEN RAISE EXCEPTION 'Deployed function mismatch: manee_ios_claim_scheduled_deliveries'; END IF;
IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='manee_manager_cap' AND pg_get_function_identity_arguments(p.oid)='p_store uuid, p_cap text' AND md5(pg_get_functiondef(p.oid))='5004bf1ad18e18c3b36f258dd18dd3f6') THEN RAISE EXCEPTION 'Deployed function mismatch: manee_manager_cap'; END IF;
IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='manee_manager_cap' AND pg_get_function_identity_arguments(p.oid)='p_store uuid, p_cap text' AND has_function_privilege('anon',p.oid,'EXECUTE')) THEN RAISE EXCEPTION 'Anonymous grant on manee_manager_cap'; END IF;
IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='manee_manager_normalize' AND pg_get_function_identity_arguments(p.oid)='p jsonb' AND md5(pg_get_functiondef(p.oid))='2a1662dd4790db41a635896e45fb2e96') THEN RAISE EXCEPTION 'Deployed function mismatch: manee_manager_normalize'; END IF;
IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='manee_manager_normalize' AND pg_get_function_identity_arguments(p.oid)='p jsonb' AND has_function_privilege('anon',p.oid,'EXECUTE')) THEN RAISE EXCEPTION 'Anonymous grant on manee_manager_normalize'; END IF;
IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='manee_manager_permissions' AND pg_get_function_identity_arguments(p.oid)='p_crew_id uuid, p_action text, p_permissions jsonb, p_revision bigint' AND md5(pg_get_functiondef(p.oid))='861f610f0cc1b6a6d2e5bf52292fb1f1') THEN RAISE EXCEPTION 'Deployed function mismatch: manee_manager_permissions'; END IF;
IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='manee_manager_permissions' AND pg_get_function_identity_arguments(p.oid)='p_crew_id uuid, p_action text, p_permissions jsonb, p_revision bigint' AND has_function_privilege('anon',p.oid,'EXECUTE')) THEN RAISE EXCEPTION 'Anonymous grant on manee_manager_permissions'; END IF;
IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='manee_manager_portal' AND pg_get_function_identity_arguments(p.oid)='p_store_id uuid, p_month_key text' AND md5(pg_get_functiondef(p.oid))='a7df3097488775d3f37319cd36f20ce3') THEN RAISE EXCEPTION 'Deployed function mismatch: manee_manager_portal'; END IF;
IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='manee_manager_portal' AND pg_get_function_identity_arguments(p.oid)='p_store_id uuid, p_month_key text' AND has_function_privilege('anon',p.oid,'EXECUTE')) THEN RAISE EXCEPTION 'Anonymous grant on manee_manager_portal'; END IF;
IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='manee_manager_review' AND pg_get_function_identity_arguments(p.oid)='p_store_id uuid, p_month_key text, p_action text' AND md5(pg_get_functiondef(p.oid))='3146520396540cef8cd13903b5446bd9') THEN RAISE EXCEPTION 'Deployed function mismatch: manee_manager_review'; END IF;
IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='manee_manager_review' AND pg_get_function_identity_arguments(p.oid)='p_store_id uuid, p_month_key text, p_action text' AND has_function_privilege('anon',p.oid,'EXECUTE')) THEN RAISE EXCEPTION 'Anonymous grant on manee_manager_review'; END IF;
IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='manee_manager_write' AND pg_get_function_identity_arguments(p.oid)='p_store_id uuid, p_month_key text, p_action text, p_crew_id uuid, p_payload jsonb, p_previous jsonb' AND md5(pg_get_functiondef(p.oid))='e82c7767494307926f3fe2faf28a1b5f') THEN RAISE EXCEPTION 'Deployed function mismatch: manee_manager_write'; END IF;
IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='manee_manager_write' AND pg_get_function_identity_arguments(p.oid)='p_store_id uuid, p_month_key text, p_action text, p_crew_id uuid, p_payload jsonb, p_previous jsonb' AND has_function_privilege('anon',p.oid,'EXECUTE')) THEN RAISE EXCEPTION 'Anonymous grant on manee_manager_write'; END IF;
IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='manee_notice_revision_guard' AND pg_get_function_identity_arguments(p.oid)='' AND md5(pg_get_functiondef(p.oid))='60100a4df69be2012ee53df8c6174f34') THEN RAISE EXCEPTION 'Deployed function mismatch: manee_notice_revision_guard'; END IF;
IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='manee_notice_revision_guard' AND pg_get_function_identity_arguments(p.oid)='' AND has_function_privilege('anon',p.oid,'EXECUTE')) THEN RAISE EXCEPTION 'Anonymous grant on manee_notice_revision_guard'; END IF;
IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='manee_notice_visible' AND pg_get_function_identity_arguments(p.oid)='p_store uuid, p_audience text, p_archived boolean' AND md5(pg_get_functiondef(p.oid))='6d504b1c060ae827db706eec54a0c772') THEN RAISE EXCEPTION 'Deployed function mismatch: manee_notice_visible'; END IF;
IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='manee_notice_visible' AND pg_get_function_identity_arguments(p.oid)='p_store uuid, p_audience text, p_archived boolean' AND has_function_privilege('anon',p.oid,'EXECUTE')) THEN RAISE EXCEPTION 'Anonymous grant on manee_notice_visible'; END IF;
IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='manee_prepare_fixed_costs' AND pg_get_function_identity_arguments(p.oid)='p_store_id uuid, p_month_key text' AND md5(pg_get_functiondef(p.oid))='d7075fdcfe0adf95a653068b97914bf6') THEN RAISE EXCEPTION 'Deployed function mismatch: manee_prepare_fixed_costs'; END IF;
IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='manee_purge_expired_sms_challenges' AND pg_get_function_identity_arguments(p.oid)='p_limit integer' AND md5(pg_get_functiondef(p.oid))='9c5e1b5f1966ae6f998d3297cfc5c57a') THEN RAISE EXCEPTION 'Deployed function mismatch: manee_purge_expired_sms_challenges'; END IF;
IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='manee_purge_expired_sms_challenges' AND pg_get_function_identity_arguments(p.oid)='p_limit integer' AND has_function_privilege('anon',p.oid,'EXECUTE')) THEN RAISE EXCEPTION 'Anonymous grant on manee_purge_expired_sms_challenges'; END IF;
IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='manee_sales_read' AND pg_get_function_identity_arguments(p.oid)='p_store uuid, p_crew uuid' AND md5(pg_get_functiondef(p.oid))='aab905c7248bd2245cf85f5f48b60a7c') THEN RAISE EXCEPTION 'Deployed function mismatch: manee_sales_read'; END IF;
IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='manee_sales_read' AND pg_get_function_identity_arguments(p.oid)='p_store uuid, p_crew uuid' AND has_function_privilege('anon',p.oid,'EXECUTE')) THEN RAISE EXCEPTION 'Anonymous grant on manee_sales_read'; END IF;
IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='manee_sales_write' AND pg_get_function_identity_arguments(p.oid)='p_store uuid, p_crew uuid, p_date date' AND md5(pg_get_functiondef(p.oid))='8472e15cf6f19cd13d03da43062337d2') THEN RAISE EXCEPTION 'Deployed function mismatch: manee_sales_write'; END IF;
IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='manee_sales_write' AND pg_get_function_identity_arguments(p.oid)='p_store uuid, p_crew uuid, p_date date' AND has_function_privilege('anon',p.oid,'EXECUTE')) THEN RAISE EXCEPTION 'Anonymous grant on manee_sales_write'; END IF;
IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='manee_save_contract' AND pg_get_function_identity_arguments(p.oid)='p_store_id uuid, p_crew_id uuid, p_document jsonb, p_previous integer, p_attachment jsonb' AND md5(pg_get_functiondef(p.oid))='f18ee066a32c79a1fa7e02180d1a8599') THEN RAISE EXCEPTION 'Deployed function mismatch: manee_save_contract'; END IF;
IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='manee_save_contract' AND pg_get_function_identity_arguments(p.oid)='p_store_id uuid, p_crew_id uuid, p_document jsonb, p_previous integer, p_attachment jsonb' AND has_function_privilege('anon',p.oid,'EXECUTE')) THEN RAISE EXCEPTION 'Anonymous grant on manee_save_contract'; END IF;
IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='manee_schedule_access' AND pg_get_function_identity_arguments(p.oid)='p_store uuid' AND md5(pg_get_functiondef(p.oid))='100c9057e97376ab7e78bae12a5c1616') THEN RAISE EXCEPTION 'Deployed function mismatch: manee_schedule_access'; END IF;
IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='manee_schedule_access' AND pg_get_function_identity_arguments(p.oid)='p_store uuid' AND has_function_privilege('anon',p.oid,'EXECUTE')) THEN RAISE EXCEPTION 'Anonymous grant on manee_schedule_access'; END IF;
IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='manee_sector3_save' AND pg_get_function_identity_arguments(p.oid)='p_store_id uuid, p_date date, p_request_id uuid, p_sales jsonb, p_expenses jsonb, p_previous timestamp with time zone' AND md5(pg_get_functiondef(p.oid))='ed01b74e5641df5cabc5a7f0140c46f6') THEN RAISE EXCEPTION 'Deployed function mismatch: manee_sector3_save'; END IF;
IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='manee_sector3_save' AND pg_get_function_identity_arguments(p.oid)='p_store_id uuid, p_date date, p_request_id uuid, p_sales jsonb, p_expenses jsonb, p_previous timestamp with time zone' AND has_function_privilege('anon',p.oid,'EXECUTE')) THEN RAISE EXCEPTION 'Anonymous grant on manee_sector3_save'; END IF;
IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='manee_sms_ordinary_user' AND pg_get_function_identity_arguments(p.oid)='p_uid uuid' AND md5(pg_get_functiondef(p.oid))='414be747fb5ded5fc1388feb7b7a8b8d') THEN RAISE EXCEPTION 'Deployed function mismatch: manee_sms_ordinary_user'; END IF;
IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='manee_sms_ordinary_user' AND pg_get_function_identity_arguments(p.oid)='p_uid uuid' AND has_function_privilege('anon',p.oid,'EXECUTE')) THEN RAISE EXCEPTION 'Anonymous grant on manee_sms_ordinary_user'; END IF;
IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='manee_sms_service' AND pg_get_function_identity_arguments(p.oid)='p_action text, p_payload jsonb' AND md5(pg_get_functiondef(p.oid))='4b015868b42c76cbb339c90effc2002b') THEN RAISE EXCEPTION 'Deployed function mismatch: manee_sms_service'; END IF;
IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='manee_sms_service' AND pg_get_function_identity_arguments(p.oid)='p_action text, p_payload jsonb' AND has_function_privilege('anon',p.oid,'EXECUTE')) THEN RAISE EXCEPTION 'Anonymous grant on manee_sms_service'; END IF;
IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='manee_social_signup' AND pg_get_function_identity_arguments(p.oid)='p_user_id uuid, p_payload jsonb' AND md5(pg_get_functiondef(p.oid))='7dc99c4232e9136e38fc85be47f6f0a3') THEN RAISE EXCEPTION 'Deployed function mismatch: manee_social_signup'; END IF;
IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='manee_social_signup' AND pg_get_function_identity_arguments(p.oid)='p_user_id uuid, p_payload jsonb' AND has_function_privilege('anon',p.oid,'EXECUTE')) THEN RAISE EXCEPTION 'Anonymous grant on manee_social_signup'; END IF;
IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='manee_staff_expenses' AND pg_get_function_identity_arguments(p.oid)='p_store_id uuid, p_action text, p_payload jsonb' AND md5(pg_get_functiondef(p.oid))='40f5ee6411d7571f64aa4668fd3387fa') THEN RAISE EXCEPTION 'Deployed function mismatch: manee_staff_expenses'; END IF;
IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='manee_staff_expenses' AND pg_get_function_identity_arguments(p.oid)='p_store_id uuid, p_action text, p_payload jsonb' AND has_function_privilege('anon',p.oid,'EXECUTE')) THEN RAISE EXCEPTION 'Anonymous grant on manee_staff_expenses'; END IF;
IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='manee_staff_portal' AND pg_get_function_identity_arguments(p.oid)='p_action text, p_payload jsonb' AND md5(pg_get_functiondef(p.oid))='e4d7fd6899b8860e35817fabe1f402fc') THEN RAISE EXCEPTION 'Deployed function mismatch: manee_staff_portal'; END IF;
IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='queue_android_business_event' AND pg_get_function_identity_arguments(p.oid)='' AND md5(pg_get_functiondef(p.oid))='fd07daaa78b185a3d353edab66e1fac1') THEN RAISE EXCEPTION 'Deployed function mismatch: queue_android_business_event'; END IF;
IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='queue_ios_business_event' AND pg_get_function_identity_arguments(p.oid)='' AND md5(pg_get_functiondef(p.oid))='48f9780405a4f022f20414957d38a2ff') THEN RAISE EXCEPTION 'Deployed function mismatch: queue_ios_business_event'; END IF;
IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='seed_android_reminders' AND pg_get_function_identity_arguments(p.oid)='p_now timestamp with time zone' AND md5(pg_get_functiondef(p.oid))='f297c362ff306a43f7ae9b007bf99aa2') THEN RAISE EXCEPTION 'Deployed function mismatch: seed_android_reminders'; END IF;
IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='seed_ios_reminders' AND pg_get_function_identity_arguments(p.oid)='p_now timestamp with time zone' AND md5(pg_get_functiondef(p.oid))='ad8065f323a118a43bf10453a20cba50') THEN RAISE EXCEPTION 'Deployed function mismatch: seed_ios_reminders'; END IF;
IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='set_crew_manager_flag' AND pg_get_function_identity_arguments(p.oid)='target_crew_id uuid, is_manager boolean' AND md5(pg_get_functiondef(p.oid))='44c972928090886a313d358a331cd313') THEN RAISE EXCEPTION 'Deployed function mismatch: set_crew_manager_flag'; END IF;
IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='manee_manager_permissions' AND pg_get_function_identity_arguments(p.oid)='p_crew_id uuid, p_action text, p_permissions jsonb, p_revision bigint' AND md5(pg_get_functiondef(p.oid))='fd1b8a13ddc5c6a109294a0738a3e60a') THEN RAISE EXCEPTION 'Deployed function mismatch: manee_manager_permissions'; END IF;
IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='manee_manager_permissions' AND pg_get_function_identity_arguments(p.oid)='p_crew_id uuid, p_action text, p_permissions jsonb, p_revision bigint' AND has_function_privilege('anon',p.oid,'EXECUTE')) THEN RAISE EXCEPTION 'Anonymous grant on manee_manager_permissions'; END IF;
IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='manee_manager_portal' AND pg_get_function_identity_arguments(p.oid)='p_store_id uuid, p_month_key text' AND md5(pg_get_functiondef(p.oid))='7b54b83e0a95cd4d7226281887e35c15') THEN RAISE EXCEPTION 'Deployed function mismatch: manee_manager_portal'; END IF;
IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='manee_manager_portal' AND pg_get_function_identity_arguments(p.oid)='p_store_id uuid, p_month_key text' AND has_function_privilege('anon',p.oid,'EXECUTE')) THEN RAISE EXCEPTION 'Anonymous grant on manee_manager_portal'; END IF;
IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='manee_manager_review' AND pg_get_function_identity_arguments(p.oid)='p_store_id uuid, p_month_key text, p_action text' AND md5(pg_get_functiondef(p.oid))='be55e634c760ffd7fbc9599e5271da9e') THEN RAISE EXCEPTION 'Deployed function mismatch: manee_manager_review'; END IF;
IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='manee_manager_review' AND pg_get_function_identity_arguments(p.oid)='p_store_id uuid, p_month_key text, p_action text' AND has_function_privilege('anon',p.oid,'EXECUTE')) THEN RAISE EXCEPTION 'Anonymous grant on manee_manager_review'; END IF;
IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='manee_manager_write' AND pg_get_function_identity_arguments(p.oid)='p_store_id uuid, p_month_key text, p_action text, p_crew_id uuid, p_payload jsonb, p_previous jsonb' AND md5(pg_get_functiondef(p.oid))='06c9372f8f1c49e22cc606a3031261cd') THEN RAISE EXCEPTION 'Deployed function mismatch: manee_manager_write'; END IF;
IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='manee_manager_write' AND pg_get_function_identity_arguments(p.oid)='p_store_id uuid, p_month_key text, p_action text, p_crew_id uuid, p_payload jsonb, p_previous jsonb' AND has_function_privilege('anon',p.oid,'EXECUTE')) THEN RAISE EXCEPTION 'Anonymous grant on manee_manager_write'; END IF;
IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='manee_save_contract' AND pg_get_function_identity_arguments(p.oid)='p_store_id uuid, p_crew_id uuid, p_document jsonb, p_previous integer, p_attachment jsonb' AND md5(pg_get_functiondef(p.oid))='0e6c10a87f6f36f1292c8e28d98fa9a4') THEN RAISE EXCEPTION 'Deployed function mismatch: manee_save_contract'; END IF;
IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='manee_save_contract' AND pg_get_function_identity_arguments(p.oid)='p_store_id uuid, p_crew_id uuid, p_document jsonb, p_previous integer, p_attachment jsonb' AND has_function_privilege('anon',p.oid,'EXECUTE')) THEN RAISE EXCEPTION 'Anonymous grant on manee_save_contract'; END IF;
IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='manee_sector3_review' AND pg_get_function_identity_arguments(p.oid)='p_store_id uuid, p_month_key text, p_action text' AND md5(pg_get_functiondef(p.oid))='932d2ac02a7c770773f8f468030cc3b4') THEN RAISE EXCEPTION 'Deployed function mismatch: manee_sector3_review'; END IF;
IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='manee_sector3_review' AND pg_get_function_identity_arguments(p.oid)='p_store_id uuid, p_month_key text, p_action text' AND has_function_privilege('anon',p.oid,'EXECUTE')) THEN RAISE EXCEPTION 'Anonymous grant on manee_sector3_review'; END IF;
IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='manee_sector3_save' AND pg_get_function_identity_arguments(p.oid)='p_store_id uuid, p_date date, p_request_id uuid, p_sales jsonb, p_expenses jsonb, p_previous timestamp with time zone' AND md5(pg_get_functiondef(p.oid))='77492ec84c5f9084c6df343e7775803e') THEN RAISE EXCEPTION 'Deployed function mismatch: manee_sector3_save'; END IF;
IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='manee_sector3_save' AND pg_get_function_identity_arguments(p.oid)='p_store_id uuid, p_date date, p_request_id uuid, p_sales jsonb, p_expenses jsonb, p_previous timestamp with time zone' AND has_function_privilege('anon',p.oid,'EXECUTE')) THEN RAISE EXCEPTION 'Anonymous grant on manee_sector3_save'; END IF;
IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='manee_sector3_vendor' AND pg_get_function_identity_arguments(p.oid)='p_store_id uuid, p_id uuid, p_action text, p_name text, p_category text, p_count bigint, p_total bigint' AND md5(pg_get_functiondef(p.oid))='098075c880123fb587ee03bbf061f56b') THEN RAISE EXCEPTION 'Deployed function mismatch: manee_sector3_vendor'; END IF;
IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='manee_sector3_vendor' AND pg_get_function_identity_arguments(p.oid)='p_store_id uuid, p_id uuid, p_action text, p_name text, p_category text, p_count bigint, p_total bigint' AND has_function_privilege('anon',p.oid,'EXECUTE')) THEN RAISE EXCEPTION 'Anonymous grant on manee_sector3_vendor'; END IF;
IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='manee_sector4_notice' AND pg_get_function_identity_arguments(p.oid)='p_store_id uuid, p_id uuid, p_payload jsonb, p_version integer, p_request_id uuid' AND md5(pg_get_functiondef(p.oid))='0d28e2dc2a62d943b93a0c59a2824bda') THEN RAISE EXCEPTION 'Deployed function mismatch: manee_sector4_notice'; END IF;
IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='manee_sector4_notice' AND pg_get_function_identity_arguments(p.oid)='p_store_id uuid, p_id uuid, p_payload jsonb, p_version integer, p_request_id uuid' AND has_function_privilege('anon',p.oid,'EXECUTE')) THEN RAISE EXCEPTION 'Anonymous grant on manee_sector4_notice'; END IF;
IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='manee_sector4_reservation' AND pg_get_function_identity_arguments(p.oid)='p_store_id uuid, p_id bigint, p_payload jsonb, p_version integer, p_request_id uuid' AND md5(pg_get_functiondef(p.oid))='d694a5f35e688d3f8f6db9ed402c647b') THEN RAISE EXCEPTION 'Deployed function mismatch: manee_sector4_reservation'; END IF;
IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='manee_sector4_reservation' AND pg_get_function_identity_arguments(p.oid)='p_store_id uuid, p_id bigint, p_payload jsonb, p_version integer, p_request_id uuid' AND has_function_privilege('anon',p.oid,'EXECUTE')) THEN RAISE EXCEPTION 'Anonymous grant on manee_sector4_reservation'; END IF;
IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='manee_sms_service' AND pg_get_function_identity_arguments(p.oid)='p_action text, p_payload jsonb' AND md5(pg_get_functiondef(p.oid))='c0a614438b589af84462be0d934d60ef') THEN RAISE EXCEPTION 'Deployed function mismatch: manee_sms_service'; END IF;
IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='manee_sms_service' AND pg_get_function_identity_arguments(p.oid)='p_action text, p_payload jsonb' AND has_function_privilege('anon',p.oid,'EXECUTE')) THEN RAISE EXCEPTION 'Anonymous grant on manee_sms_service'; END IF;
IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='manee_social_signup' AND pg_get_function_identity_arguments(p.oid)='p_user_id uuid, p_payload jsonb' AND md5(pg_get_functiondef(p.oid))='ac311b2f90c14f7c19cdf529be7d2244') THEN RAISE EXCEPTION 'Deployed function mismatch: manee_social_signup'; END IF;
IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='manee_social_signup' AND pg_get_function_identity_arguments(p.oid)='p_user_id uuid, p_payload jsonb' AND has_function_privilege('anon',p.oid,'EXECUTE')) THEN RAISE EXCEPTION 'Anonymous grant on manee_social_signup'; END IF;
IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='manee_staff_expenses' AND pg_get_function_identity_arguments(p.oid)='p_store_id uuid, p_action text, p_payload jsonb' AND md5(pg_get_functiondef(p.oid))='4e7d244068f1f9d173c698f8d407546c') THEN RAISE EXCEPTION 'Deployed function mismatch: manee_staff_expenses'; END IF;
IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='manee_staff_expenses' AND pg_get_function_identity_arguments(p.oid)='p_store_id uuid, p_action text, p_payload jsonb' AND has_function_privilege('anon',p.oid,'EXECUTE')) THEN RAISE EXCEPTION 'Anonymous grant on manee_staff_expenses'; END IF;
IF (SELECT md5(pg_get_functiondef(p.oid)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='dispatch_android_notifications') IS DISTINCT FROM 'e4ff16d80549d3aec60ce341613fbc34' THEN RAISE EXCEPTION 'Production-specific function changed: dispatch_android_notifications'; END IF;
IF (SELECT md5(pg_get_functiondef(p.oid)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='staff_clock') IS DISTINCT FROM 'bffcf0d12bf3572f391dd59bd8e9c984' THEN RAISE EXCEPTION 'Production-specific function changed: staff_clock'; END IF;
END $postconditions$;

SAVEPOINT release145_verification;

-- Synthetic owner/manager/staff checks; every fixture and queue entry rolls back.
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
SELECT set_config('manee_qa.owner',gen_random_uuid()::text,true),
 set_config('manee_qa.manager',gen_random_uuid()::text,true),
 set_config('manee_qa.staff',gen_random_uuid()::text,true),
 set_config('manee_qa.store',gen_random_uuid()::text,true),
 set_config('manee_qa.other',gen_random_uuid()::text,true),
 set_config('manee_qa.manager_crew',gen_random_uuid()::text,true),
 set_config('manee_qa.staff_crew',gen_random_uuid()::text,true);
INSERT INTO auth.users(id) SELECT current_setting('manee_qa.'||r)::uuid FROM unnest(ARRAY['owner','manager','staff']) r;
INSERT INTO auth.sessions(id,user_id) SELECT current_setting('manee_qa.'||r)::uuid,current_setting('manee_qa.'||r)::uuid FROM unnest(ARRAY['owner','manager','staff']) r;
INSERT INTO public.profiles(user_id,username,display_name,status)
 SELECT current_setting('manee_qa.'||r)::uuid,'qa_'||left(replace(current_setting('manee_qa.'||r),'-',''),20),'Release QA '||r,'active' FROM unnest(ARRAY['owner','manager','staff']) r;
INSERT INTO public.stores(id,name) VALUES(current_setting('manee_qa.store')::uuid,'Release QA store'),(current_setting('manee_qa.other')::uuid,'Release QA other');
-- Only synthetic stores bypass subscription charging during the rollback-only exercise.
DELETE FROM private.store_billing_enforcement WHERE store_id IN(current_setting('manee_qa.store')::uuid,current_setting('manee_qa.other')::uuid);
INSERT INTO public.crew(id,store_id,name,wage,wage_type,is_manager) VALUES
 (current_setting('manee_qa.manager_crew')::uuid,current_setting('manee_qa.store')::uuid,'Release QA manager',10000,'hourly',false),
 (current_setting('manee_qa.staff_crew')::uuid,current_setting('manee_qa.store')::uuid,'Release QA staff',10000,'hourly',false);
INSERT INTO public.store_memberships(user_id,store_id,crew_id,role,status) VALUES
 (current_setting('manee_qa.owner')::uuid,current_setting('manee_qa.store')::uuid,null,'owner','active'),
 (current_setting('manee_qa.manager')::uuid,current_setting('manee_qa.store')::uuid,current_setting('manee_qa.manager_crew')::uuid,'staff','active'),
 (current_setting('manee_qa.staff')::uuid,current_setting('manee_qa.store')::uuid,current_setting('manee_qa.staff_crew')::uuid,'staff','active');
SELECT set_config('request.jwt.claim.sub',current_setting('manee_qa.owner'),true),set_config('request.jwt.claim.role','authenticated',true),
 set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('manee_qa.owner'),'session_id',current_setting('manee_qa.owner'),'role','authenticated')::text,true);
SET LOCAL ROLE authenticated;
DO $qa$ DECLARE r jsonb; BEGIN
 IF NOT private.can_manage_store(current_setting('manee_qa.store')::uuid) THEN RAISE EXCEPTION 'Owner access failed'; END IF;
 r:=public.manee_sector3_vendor(current_setting('manee_qa.store')::uuid,null,'save','Release QA supplier','food');
 PERFORM set_config('manee_qa.vendor',r->'vendor'->>'id',true);
 r:=public.manee_manager_permissions(current_setting('manee_qa.manager_crew')::uuid,'save','{"view":"sales","salesWrite":true,"schedule":true}',0);
 IF NOT (r->>'enabled')::boolean THEN RAISE EXCEPTION 'Manager assignment failed'; END IF;
 BEGIN
  PERFORM public.manee_sector3_review(current_setting('manee_qa.other')::uuid,to_char(now(),'YYYY-MM'),'get');
  RAISE EXCEPTION 'Foreign-store owner access unexpectedly succeeded';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $qa$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',current_setting('manee_qa.staff'),true),
 set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('manee_qa.staff'),'session_id',current_setting('manee_qa.staff'),'role','authenticated')::text,true);
SET LOCAL ROLE authenticated;
DO $qa$ DECLARE p jsonb;r jsonb;r2 jsonb;BEGIN
 p:=jsonb_build_object('date',(now() AT TIME ZONE 'Asia/Seoul')::date,'amount',1000,'vendor_id',current_setting('manee_qa.vendor'),'category','food','payment_method','card','payment_status','paid','memo','Release QA','request_id',gen_random_uuid());
 r:=public.manee_staff_expenses(current_setting('manee_qa.store')::uuid,'create',p);
 r2:=public.manee_staff_expenses(current_setting('manee_qa.store')::uuid,'create',p);
 IF r->>'id' IS NULL OR r->>'id' IS DISTINCT FROM r2->>'id' THEN RAISE EXCEPTION 'Expense idempotency failed';END IF;
 r2:=public.manee_staff_expenses(current_setting('manee_qa.store')::uuid,'list',jsonb_build_object('month',to_char(now() AT TIME ZONE 'Asia/Seoul','YYYY-MM')));
 IF jsonb_array_length(r2->'entries')<>1 THEN RAISE EXCEPTION 'Staff expense read failed'; END IF;
 BEGIN
  PERFORM public.manee_staff_expenses(current_setting('manee_qa.other')::uuid,'list',jsonb_build_object('month',to_char(now(),'YYYY-MM')));
  RAISE EXCEPTION 'Foreign-store expense access unexpectedly succeeded';
 EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN
  INSERT INTO public.shifts(store_id,crew_id,date,start_time,end_time) VALUES(current_setting('manee_qa.store')::uuid,current_setting('manee_qa.staff_crew')::uuid,current_date,'10:00','18:00');
  RAISE EXCEPTION 'Ordinary staff schedule write unexpectedly succeeded';
 EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN
  PERFORM public.manee_manager_permissions(current_setting('manee_qa.manager_crew')::uuid,'get');
  RAISE EXCEPTION 'Staff permission administration unexpectedly succeeded';
 EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END $qa$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',current_setting('manee_qa.manager'),true),
 set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('manee_qa.manager'),'session_id',current_setting('manee_qa.manager'),'role','authenticated')::text,true);
SET LOCAL ROLE authenticated;
DO $qa$ BEGIN
 IF NOT private.manee_manager_cap(current_setting('manee_qa.store')::uuid,'schedule') OR private.can_manage_store(current_setting('manee_qa.store')::uuid) THEN RAISE EXCEPTION 'Manager capability boundary failed'; END IF;
 INSERT INTO public.shifts(store_id,crew_id,date,start_time,end_time) VALUES(current_setting('manee_qa.store')::uuid,current_setting('manee_qa.staff_crew')::uuid,current_date,'10:00','18:00');
 BEGIN
  PERFORM public.manee_manager_write(current_setting('manee_qa.store')::uuid,to_char(now(),'YYYY-MM'),'wage',current_setting('manee_qa.staff_crew')::uuid,'{"wage":20000,"wage_type":"hourly"}','{"wage":10000,"wage_type":"hourly"}');
  RAISE EXCEPTION 'Ungrant​ed wage capability unexpectedly succeeded';
 EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END $qa$;
RESET ROLE;
DELETE FROM auth.sessions WHERE user_id=current_setting('manee_qa.manager')::uuid;
SET LOCAL ROLE authenticated;
DO $qa$ BEGIN
 IF private.manee_manager_cap(current_setting('manee_qa.store')::uuid,'schedule') THEN RAISE EXCEPTION 'Revoked session retained permissions'; END IF;
 BEGIN
  INSERT INTO public.shifts(store_id,crew_id,date,start_time,end_time) VALUES(current_setting('manee_qa.store')::uuid,current_setting('manee_qa.staff_crew')::uuid,current_date+1,'10:00','18:00');
  RAISE EXCEPTION 'Revoked-session schedule write unexpectedly succeeded';
 EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END $qa$;
RESET ROLE;
SELECT 'owner / staff expenses / idempotency / manager capabilities / cross-store isolation / session revocation passed' AS result;


ROLLBACK TO SAVEPOINT release145_verification;

RELEASE SAVEPOINT release145_verification;

NOTIFY pgrst, 'reload schema';

COMMIT;
