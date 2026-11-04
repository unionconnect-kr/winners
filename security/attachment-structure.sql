-- Bounded structural validation. This does not claim pixel decoding or malware scanning.
-- Preserve existing attachments on unrelated edits; validate all newly supplied bytes.
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
DO $$BEGIN
 IF to_regprocedure('private.manee_safe_file(text,text,integer)') IS NOT NULL
 OR to_regprocedure('private.manee_file_uint(bytea,integer,integer,boolean)') IS NOT NULL
 OR to_regprocedure('private.manee_validate_attachments()') IS NOT NULL THEN
  RAISE EXCEPTION 'Attachment functions already exist; review drift';
 END IF;
END $$;
CREATE OR REPLACE FUNCTION private.manee_file_uint(b bytea,p integer,bytes integer,little boolean DEFAULT false)
RETURNS bigint LANGUAGE plpgsql IMMUTABLE STRICT SET search_path='' AS $$
DECLARE v bigint:=0;i integer;
BEGIN
 IF p<0 OR bytes NOT BETWEEN 1 AND 4 OR p+bytes>octet_length(b) THEN RETURN NULL;END IF;
 FOR i IN 0..bytes-1 LOOP
  v:=v*256+get_byte(b,p+CASE WHEN little THEN bytes-1-i ELSE i END);
 END LOOP;
 RETURN v;
END $$;
REVOKE ALL ON FUNCTION private.manee_file_uint(bytea,integer,integer,boolean) FROM public,anon;
GRANT EXECUTE ON FUNCTION private.manee_file_uint(bytea,integer,integer,boolean) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION private.manee_safe_file(p_data text,p_type text,p_limit integer)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE b bytea;n integer;i integer;j integer;sz bigint;tag text;marker integer;w bigint;h bigint;components integer;
 seen_header boolean:=false;seen_data boolean:=false;t text;decoded text;ch text;xref_offset bigint;scan_count integer:=0;
BEGIN
 IF p_limit IS NULL OR p_limit NOT BETWEEN 12 AND 5242880 OR p_data IS NULL OR p_type IS NULL
 OR length(p_data)>ceil(p_limit/3.0)*4 OR length(p_data)%4<>0 OR p_data!~'^[A-Za-z0-9+/]+={0,2}$' THEN RETURN false;END IF;
 b:=decode(p_data,'base64');n:=octet_length(b);IF n<12 OR n>p_limit THEN RETURN false;END IF;
 IF replace(encode(b,'base64'),chr(10),'')<>p_data THEN RETURN false;END IF;
 IF p_type='image/png' THEN
  IF substring(b from 1 for 8)<>decode('89504e470d0a1a0a','hex') THEN RETURN false;END IF;
  i:=8;
  WHILE i+12<=n LOOP
   sz:=private.manee_file_uint(b,i,4);IF sz>n-i-12 THEN RETURN false;END IF;
   tag:=convert_from(substring(b from i+5 for 4),'LATIN1');
   IF NOT seen_header THEN
    IF tag<>'IHDR' OR sz<>13 THEN RETURN false;END IF;
    w:=private.manee_file_uint(b,i+8,4);h:=private.manee_file_uint(b,i+12,4);
    IF w NOT BETWEEN 1 AND 16384 OR h NOT BETWEEN 1 AND 16384 OR w*h>40000000
     OR get_byte(b,i+18)<>0 OR get_byte(b,i+19)<>0 OR get_byte(b,i+20)>1 THEN RETURN false;END IF;
    seen_header:=true;
   ELSIF tag='IHDR' THEN RETURN false;
   ELSIF tag='IDAT' THEN IF sz>0 THEN seen_data:=true;END IF;
   ELSIF tag='IEND' THEN RETURN sz=0 AND seen_data AND i+12=n;
   END IF;
   i:=i+sz::integer+12;
  END LOOP;
  RETURN false;
 ELSIF p_type='image/jpeg' THEN
  IF substring(b from 1 for 2)<>decode('ffd8','hex') THEN RETURN false;END IF;
  i:=2;
  WHILE i<n LOOP
   IF get_byte(b,i)<>255 THEN RETURN false;END IF;
   WHILE i<n AND get_byte(b,i)=255 LOOP i:=i+1;END LOOP;
   IF i>=n THEN RETURN false;END IF;
   marker:=get_byte(b,i);i:=i+1;
   IF marker=217 THEN RETURN seen_header AND seen_data AND i=n;END IF;
   IF marker IN (0,216) OR marker BETWEEN 208 AND 215 OR i+2>n THEN RETURN false;END IF;
   sz:=private.manee_file_uint(b,i,2);IF sz<2 OR sz>n-i THEN RETURN false;END IF;
   IF marker IN (192,193,194) THEN
    IF sz<11 OR seen_header THEN RETURN false;END IF;
    h:=private.manee_file_uint(b,i+3,2);w:=private.manee_file_uint(b,i+5,2);components:=get_byte(b,i+7);
    IF components NOT BETWEEN 1 AND 4 OR sz<>8+3*components OR get_byte(b,i+2)<>8
     OR w NOT BETWEEN 1 AND 16384 OR h NOT BETWEEN 1 AND 16384 OR w*h>40000000 THEN RETURN false;END IF;
    seen_header:=true;
   ELSIF marker=218 THEN
    IF NOT seen_header OR sz<8 THEN RETURN false;END IF;
    components:=get_byte(b,i+2);IF components NOT BETWEEN 1 AND 4 OR sz<>6+2*components THEN RETURN false;END IF;
   ELSIF marker NOT IN (196,219,221,254) AND NOT marker BETWEEN 224 AND 239 THEN RETURN false;
   END IF;
   i:=i+sz::integer;
   IF marker=218 THEN
    j:=i;scan_count:=0;
    WHILE i<n LOOP
     IF get_byte(b,i)<>255 THEN
      scan_count:=scan_count+1;
      j:=position(decode('ff','hex') in substring(b from i+1));
      IF j=0 THEN RETURN false;END IF;i:=i+j-1;
     END IF;
     IF i+1>=n THEN RETURN false;END IF;
     IF get_byte(b,i+1)=0 OR get_byte(b,i+1) BETWEEN 208 AND 215 THEN i:=i+2;scan_count:=scan_count+1;
     ELSE EXIT;END IF;
    END LOOP;
    IF scan_count=0 THEN RETURN false;END IF;seen_data:=true;
   END IF;
  END LOOP;
  RETURN false;
 ELSIF p_type='image/webp' THEN
  IF substring(b from 1 for 4)<>decode('52494646','hex') OR substring(b from 9 for 4)<>decode('57454250','hex')
   OR private.manee_file_uint(b,4,4,true)<>n-8 THEN RETURN false;END IF;
  i:=12;
  WHILE i+8<=n LOOP
   tag:=convert_from(substring(b from i+1 for 4),'LATIN1');sz:=private.manee_file_uint(b,i+4,4,true);
   IF sz>n-i-8 THEN RETURN false;END IF;
   IF tag='VP8 ' THEN
    IF seen_data OR sz<10 OR get_byte(b,i+8)%2<>0 OR substring(b from i+12 for 3)<>decode('9d012a','hex') THEN RETURN false;END IF;
    w:=private.manee_file_uint(b,i+14,2,true)&16383;h:=private.manee_file_uint(b,i+16,2,true)&16383;seen_data:=true;
   ELSIF tag='VP8L' THEN
    IF seen_data OR sz<5 OR get_byte(b,i+8)<>47 THEN RETURN false;END IF;
    j:=private.manee_file_uint(b,i+9,4,true);w:=(j&16383)+1;h:=((j>>14)&16383)+1;seen_data:=true;
   ELSIF tag NOT IN ('VP8X','ALPH','ICCP','EXIF','XMP ') THEN RETURN false;
   END IF;
   IF seen_data AND (w<1 OR h<1 OR w*h>40000000) THEN RETURN false;END IF;
   i:=i+8+sz::integer+(sz%2)::integer;
  END LOOP;
  RETURN seen_data AND i=n;
 ELSIF p_type='application/pdf' THEN
  t:=convert_from(b,'LATIN1');
  IF left(t,8)!~'^%PDF-(1\.[0-7]|2\.0)' OR right(t,2048)!~'%%EOF[[:space:]]*$'
   OR t!~'[0-9]+[[:space:]]+[0-9]+[[:space:]]+obj' OR t!~'endobj' THEN RETURN false;END IF;
  -- Decode PDF name escapes before screening active features (e.g. /J#53).
  FOR ch IN SELECT (regexp_matches(t,'/([A-Za-z0-9#]+)','g'))[1] LOOP
   IF length(ch)>128 THEN CONTINUE;END IF;
   decoded:='';i:=1;
   WHILE i<=length(ch) LOOP
    IF substr(ch,i,1)='#' AND substr(ch,i+1,2)~'^[0-9A-Fa-f]{2}$' THEN
     j:=get_byte(decode(substr(ch,i+1,2),'hex'),0);IF j=0 THEN RETURN false;END IF;
     decoded:=decoded||chr(j);i:=i+3;
    ELSE decoded:=decoded||substr(ch,i,1);i:=i+1;END IF;
   END LOOP;
   IF lower(decoded)=ANY(ARRAY['javascript','js','launch','embeddedfile','embeddedfiles','richmedia','openaction','aa','xfa','encrypt','objstm']) THEN RETURN false;END IF;
  END LOOP;
  -- Require a resolvable final cross-reference start, not merely %PDF / %%EOF markers.
  ch:=substring(right(t,2048) from 'startxref[[:space:]]+([0-9]+)[[:space:]]+%%EOF[[:space:]]*$');
  IF ch IS NULL OR length(ch)>10 THEN RETURN false;END IF;xref_offset:=ch::bigint;
  IF xref_offset<8 OR xref_offset>=n THEN RETURN false;END IF;
  ch:=substr(t,xref_offset::integer+1,256);
  RETURN (left(ch,4)='xref' AND t~'/Root[[:space:]]')
   OR (ch~'^[0-9]+[[:space:]]+[0-9]+[[:space:]]+obj' AND ch~'/Type[[:space:]]*/XRef');
 END IF;
 RETURN false;
EXCEPTION WHEN others THEN RETURN false;
END $$;
REVOKE ALL ON FUNCTION private.manee_safe_file(text,text,integer) FROM public,anon;
GRANT EXECUTE ON FUNCTION private.manee_safe_file(text,text,integer) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION private.manee_validate_attachments()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE row_new jsonb:=to_jsonb(new);row_old jsonb:='{}';k text;v jsonb;item jsonb;s text;mime text;payload text;
BEGIN
 IF TG_OP='UPDATE' THEN row_old:=to_jsonb(old);END IF;
 FOREACH k IN ARRAY ARRAY['settlement_photos','receipt_photos','note_photos'] LOOP
  IF row_new ? k AND (TG_OP='INSERT' OR row_new->k IS DISTINCT FROM row_old->k) THEN
   v:=row_new->k;IF v IS NULL OR v='null'::jsonb THEN CONTINUE;END IF;
   IF jsonb_typeof(v)<>'array' THEN RAISE EXCEPTION '사진 목록 형식을 확인해 주세요.' USING ERRCODE='22023';END IF;
   IF jsonb_array_length(v)>20 OR octet_length(v::text)>20971520 THEN RAISE EXCEPTION '사진 개수나 총 용량을 확인해 주세요.' USING ERRCODE='22023';END IF;
   FOR item IN SELECT value FROM jsonb_array_elements(v) LOOP
    -- Preserve unchanged historical values only within the same row and column.
    IF TG_OP='UPDATE' AND jsonb_typeof(row_old->k)='array' AND (row_old->k)@>jsonb_build_array(item) THEN CONTINUE;END IF;
    IF jsonb_typeof(item)<>'string' THEN RAISE EXCEPTION '사진 형식을 확인해 주세요.' USING ERRCODE='22023';END IF;
    s:=item#>>'{}';
    IF s!~'^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$' THEN RAISE EXCEPTION '사진 파일을 다시 선택해 주세요.' USING ERRCODE='22023';END IF;
    mime:=split_part(split_part(s,';',1),':',2);payload:=split_part(s,',',2);
    IF NOT private.manee_safe_file(payload,mime,5242880) THEN RAISE EXCEPTION '올바른 5MB 이하 사진을 선택해 주세요.' USING ERRCODE='22023';END IF;
   END LOOP;
  END IF;
 END LOOP;
 IF row_new->>'attachment_base64' IS NOT NULL AND (TG_OP='INSERT' OR row_new->'attachment_base64' IS DISTINCT FROM row_old->'attachment_base64' OR row_new->'attachment_type' IS DISTINCT FROM row_old->'attachment_type') THEN
  IF NOT private.manee_safe_file(row_new->>'attachment_base64',row_new->>'attachment_type',5242880) THEN RAISE EXCEPTION '첨부파일 내용과 형식을 확인해 주세요.' USING ERRCODE='22023';END IF;
 END IF;
 RETURN new;
END $$;
REVOKE ALL ON FUNCTION private.manee_validate_attachments() FROM public,anon,authenticated;
-- Check existing inline photos in place, returning no customer file bytes.
DO $$DECLARE item jsonb;s text;BEGIN
 FOR item IN SELECT v FROM public.sales_reports r
 CROSS JOIN LATERAL (VALUES (r.settlement_photos),(r.receipt_photos),(r.note_photos)) a(photos)
 CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(a.photos)='array' THEN a.photos ELSE '[]'::jsonb END) v LOOP
  s:=item#>>'{}';
  IF s~'^data:image/(jpeg|png|webp);base64,' AND NOT private.manee_safe_file(split_part(s,',',2),split_part(split_part(s,';',1),':',2),5242880) THEN
   RAISE EXCEPTION 'Existing inline photo fails validation; review before enabling';
  END IF;
 END LOOP;
END $$;
DO $$DECLARE t text;BEGIN
 FOREACH t IN ARRAY ARRAY['public.sales_reports','public.manee_contract_documents'] LOOP
  IF to_regclass(t) IS NOT NULL THEN
   IF EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=to_regclass(t) AND tgname='manee_validate_attachments') THEN RAISE EXCEPTION 'Attachment trigger already exists; review drift';END IF;
   EXECUTE format('CREATE TRIGGER manee_validate_attachments BEFORE INSERT OR UPDATE ON %s FOR EACH ROW EXECUTE FUNCTION private.manee_validate_attachments()',t);
  END IF;
 END LOOP;
END $$;
CREATE TABLE private.manee_attachment_guard_release(signature text PRIMARY KEY,definition_hash text NOT NULL);
ALTER TABLE private.manee_attachment_guard_release ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.manee_attachment_guard_release FROM public,anon,authenticated,service_role;
INSERT INTO private.manee_attachment_guard_release
SELECT p.oid::regprocedure::text,md5(pg_get_functiondef(p.oid)) FROM pg_proc p
WHERE p.oid IN ('private.manee_file_uint(bytea,integer,integer,boolean)'::regprocedure,
 'private.manee_safe_file(text,text,integer)'::regprocedure,'private.manee_validate_attachments()'::regprocedure);
