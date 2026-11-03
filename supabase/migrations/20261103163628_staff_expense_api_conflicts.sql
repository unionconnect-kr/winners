-- Keep the existing invoker boundary and all private expense permission checks.
-- Application revision/idempotency conflicts must be HTTP 409, not database 500.
CREATE OR REPLACE FUNCTION public.manee_staff_expenses(p_store_id uuid, p_action text, p_payload jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $function$
BEGIN
 RETURN private.manee_staff_expenses(p_store_id,p_action,p_payload);
EXCEPTION WHEN SQLSTATE '40001' THEN
 RAISE SQLSTATE 'PT409' USING MESSAGE=SQLERRM;
END;
$function$;
