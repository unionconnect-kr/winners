-- Stops new validation; does not mutate attachments or other triggers.
SET LOCAL lock_timeout='5s';
DO $$DECLARE r record;t text;BEGIN
 IF (SELECT count(*) FROM private.manee_attachment_guard_release)<>3 THEN RAISE EXCEPTION 'Expected three recorded function definitions';END IF;
 FOR r IN SELECT * FROM private.manee_attachment_guard_release LOOP
  IF to_regprocedure(r.signature) IS NULL OR md5(pg_get_functiondef(to_regprocedure(r.signature)))<>r.definition_hash THEN
   RAISE EXCEPTION 'Attachment function changed after deployment';
  END IF;
 END LOOP;
 FOREACH t IN ARRAY ARRAY['public.sales_reports','public.manee_contract_documents'] LOOP
  IF to_regclass(t) IS NOT NULL THEN
   IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=to_regclass(t) AND tgname='manee_validate_attachments'
    AND tgfoid='private.manee_validate_attachments()'::regprocedure AND tgenabled='O' AND tgtype=23) THEN
    RAISE EXCEPTION 'Attachment trigger changed after deployment';
   END IF;
   EXECUTE format('DROP TRIGGER manee_validate_attachments ON %s',t);
  END IF;
 END LOOP;
END $$;
DROP FUNCTION private.manee_validate_attachments();
DROP FUNCTION private.manee_safe_file(text,text,integer);
DROP FUNCTION private.manee_file_uint(bytea,integer,integer,boolean);
