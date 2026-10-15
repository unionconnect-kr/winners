begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

-- Launch policy selected on 2026-10-15: expired enrolled stores also deny
-- clock-in/out, manual attendance changes and correction requests/approvals.
-- Reuse the OLD/NEW store gate, including inside SECURITY DEFINER RPCs.
-- Reads, account recovery and purchase/restore are unaffected. No enrollment.
create trigger manee_billing_write_gate
before insert or update or delete on public.attendance
for each row execute function private.manee_guard_billed_write();

create trigger manee_billing_write_gate
before insert or update or delete on public.attendance_edit_requests
for each row execute function private.manee_guard_billed_write();

commit;
