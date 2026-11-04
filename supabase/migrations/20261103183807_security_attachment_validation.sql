-- Validate new/changed attachments without deleting legacy customer records.
CREATE OR REPLACE FUNCTION private.manee_safe_file(p_data text,p_type text,p_limit integer)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE b bytea; n integer; t text;
BEGIN
 IF p_data IS NULL OR p_type IS NULL OR length(p_data)>ceil(p_limit/3.0)*4 OR length(p_data)%4<>0 OR p_data!~'^[A-Za-z0-9+/]+={0,2}$' THEN RETURN false;END IF;
 b:=decode(p_data,'base64');n:=octet_length(b);IF n<12 OR n>p_limit THEN RETURN false;END IF;
 IF p_type='image/png' THEN RETURN substring(b from 1 for 8)=decode('89504e470d0a1a0a','hex');END IF;
 IF p_type='image/jpeg' THEN RETURN substring(b from 1 for 3)=decode('ffd8ff','hex') AND substring(b from n-1 for 2)=decode('ffd9','hex');END IF;
 IF p_type='image/webp' THEN RETURN substring(b from 1 for 4)=decode('52494646','hex') AND substring(b from 9 for 4)=decode('57454250','hex');END IF;
 IF p_type='application/pdf' THEN
  IF substring(b from 1 for 5)<>decode('255044462d','hex') THEN RETURN false;END IF;
  -- Reject PDF active content. This is validation, not a substitute for a malware scanner.
  t:=convert_from(b,'LATIN1');
  RETURN position('%%EOF' in right(t,2048))>0 AND t!~*'/(JavaScript|JS|Launch|EmbeddedFile|RichMedia|OpenAction|AA)[[:space:]/<>\\[\\]() ]';
 END IF;
 RETURN false;
EXCEPTION WHEN others THEN RETURN false;
END $$;
REVOKE ALL ON FUNCTION private.manee_safe_file(text,text,integer) FROM public,anon;
GRANT EXECUTE ON FUNCTION private.manee_safe_file(text,text,integer) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION private.manee_validate_attachments()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE row_new jsonb:=to_jsonb(new);row_old jsonb:='{}';k text;v jsonb;s text;mime text;payload text;
BEGIN
 IF TG_OP='UPDATE' THEN row_old:=to_jsonb(old);END IF;
 FOREACH k IN ARRAY ARRAY['settlement_photos','receipt_photos','note_photos'] LOOP
  IF row_new ? k AND (TG_OP='INSERT' OR row_new->k IS DISTINCT FROM row_old->k) THEN
   v:=row_new->k;IF v IS NULL OR v='null'::jsonb THEN CONTINUE;END IF;
   IF jsonb_typeof(v)<>'array' OR jsonb_array_length(v)>20 OR octet_length(v::text)>20971520 THEN RAISE EXCEPTION '사진 형식이나 총 용량을 확인해 주세요.' USING ERRCODE='22023';END IF;
   FOR s IN SELECT value #>> '{}' FROM jsonb_array_elements(v) LOOP
    IF s IS NULL OR s ~ '[[:cntrl:]"<>]' OR position(chr(39) in s)>0 THEN RAISE EXCEPTION '사진 주소가 올바르지 않아요.' USING ERRCODE='22023';END IF;
    IF s ~ '^data:image/(jpeg|png|webp);base64,' THEN
      mime:=split_part(split_part(s,';',1),':',2);payload:=split_part(s,',',2);
      IF NOT private.manee_safe_file(payload,mime,5242880) THEN RAISE EXCEPTION '올바른 5MB 이하 사진을 선택해 주세요.' USING ERRCODE='22023';END IF;
    ELSIF s !~ '^https://[A-Za-z0-9.-]+(:[0-9]{1,5})?(/[^[:space:]]*)?$' OR length(s)>2048 THEN RAISE EXCEPTION '사진 주소가 올바르지 않아요.' USING ERRCODE='22023';END IF;
   END LOOP;
  END IF;
 END LOOP;
 IF row_new->>'attachment_base64' IS NOT NULL AND (TG_OP='INSERT' OR row_new->'attachment_base64' IS DISTINCT FROM row_old->'attachment_base64' OR row_new->'attachment_type' IS DISTINCT FROM row_old->'attachment_type') THEN
  IF NOT private.manee_safe_file(row_new->>'attachment_base64',row_new->>'attachment_type',5242880) THEN RAISE EXCEPTION '첨부파일 내용과 형식이 일치하지 않거나 허용되지 않아요.' USING ERRCODE='22023';END IF;
 END IF;
 RETURN new;
END $$;
REVOKE ALL ON FUNCTION private.manee_validate_attachments() FROM public,anon,authenticated;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['public.sales_reports','public.manee_contract_documents'] LOOP
 IF to_regclass(t) IS NOT NULL THEN
  EXECUTE format('DROP TRIGGER IF EXISTS manee_validate_attachments ON %s',t);
  EXECUTE format('CREATE TRIGGER manee_validate_attachments BEFORE INSERT OR UPDATE ON %s FOR EACH ROW EXECUTE FUNCTION private.manee_validate_attachments()',t);
 END IF;
 END LOOP;
END $$;
