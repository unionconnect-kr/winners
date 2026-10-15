# Reservation retention — appointment plus seven days

On 2026-10-16 KST the operator selected **예약 일시 후 7일**, rather than
completion/cancellation plus seven days. The existing cancellation action still
deletes the operational reservation immediately. No completion-status UI or new
Android binary is introduced.

## Exact scope and clock

`private.manee_reservation_retention_deadline(date,text)` interprets the appointment
in Asia/Seoul and adds exactly 168 hours. It does not calculate from creation or
assume the visit actually completed. A missing time uses the end of that booking
day (next midnight) as the conservative starting point. Malformed nonempty times
return NULL and need private review; they never cause an unsafe cast or automatic
deletion on a guessed time. Current Production has no such malformed/missing rows.

`private.manee_purge_expired_reservations(integer)` permanently deletes only due
`public.reservations` rows, up to 500 by default and never above 1,000 per call.
The proposed schedule is every minute. Rows include the booking's name, phone,
memo and remaining reservation fields; this is not a reversible hide/archive.
The actual date/id index limits scanning; FOR UPDATE SKIP LOCKED supports bounded
maintenance without waiting on rows currently being edited. Future/recent
reservations remain. There are no referencing reservation foreign keys in the
inspected live schema.

The maintenance function is SECURITY INVOKER with an empty search path, has no
public RPC wrapper, rejects customer JWT context, and grants no execute access to
PUBLIC, anon, authenticated or service_role. Neither installation nor a customer
can start it. PostgreSQL cron executes with the privileged operator identity.
The existing billing trigger already permits backend maintenance without an
auth.uid(); no billing/RLS protection was weakened. The actual Android business
event trigger does not enqueue cancellation for these past dates; live Staging
and local tests verify this. Existing pending reminders for erased rows can be
marked skipped by that trigger.

## Verification and current live state

- Six local PostgreSQL-engine tests pass: timezone/168-hour boundary, missing and
  invalid times, exact due threshold, recent/future preservation, bounded batch,
  no false cancellation, no client/service execution, and the exact rollback
  rehearsal. The six test cases include several assertions each.
- `security/reservation-retention-staging-rehearsal.sql` passed five checks on the
  real Staging project. It refuses to run if any existing reservation is due.
  Synthetic negative identity values use OVERRIDING SYSTEM VALUE, avoiding any
  sequence increment. Every fixture rolls back; all four original reservations
  match their before-state. Independent counts found zero fixture reservations,
  stores and cron jobs afterward.
- Migration `20261015152000_reservation_retention.sql` is installed on Staging and
  Production. It creates functions/index only; it schedules and erases nothing.
  Production postflight: 21 total reservations, 21 due, zero invalid times,
  index present, no client/service execution and **zero retention cron jobs**.
  All 21 remain. No attendance, payroll or real billing receipt was changed.
- Official-site version 24, source `498085509f80f80b99d0954576880e479366a1df`,
  deployment `appgdep_6ad0ef94a3808191a609d921f24dd37a` succeeded at
  2026-10-15 15:22:13 UTC. The notice now states the selected appointment basis,
  immediate cancellation deletion and the accurate **not yet active** state of
  operational automatic disposal. The audience remains public.

## Final activation and observation

Before executing `security/reservation-retention-activate.sql`, obtain explicit
confirmation of the actual effect: all 21 currently due Production reservation
rows will be permanently erased at the next scheduled run. Recheck aggregate
counts immediately before activation; review a material increase/change rather
than silently expanding the approved scope. The prepared SQL adds the exact
named minute schedule only if absent and refuses mismatched existing jobs. It is
not applied yet. No live purge has been executed.

After approved activation, observe `cron.job_run_details` for this exact job,
check a successful return and aggregate due/invalid/total counts, and confirm
future bookings and other business records remain intact. Inspect errors and
overdue backlog as operational failures rather than claiming that schedule
existence proves disposal. Update the public activation sentence only once the
real run is verified. `cron.unschedule` stops future runs but cannot recover
already erased records.

This scope is the operational reservation table. It does not prove removal of
device notifications, browser/device caches, provider logs, exports, historical
backups or other external copies. Backup rotation and restoration-time re-erasure
remain separate unresolved operations. No full-backup deletion or unverified
processor retention term is promised. The deletion-request case's 30-day clock,
staff-record retention and signup age policy are separate launch questions.


## Approved Production activation — 2026-10-16 00:34–00:35 KST

The operator answered “자동 파기” to the explicit activation question describing
permanent deletion of the existing 21 rows and the recurring appointment-plus-
seven-day rule. A fresh 00:33:24 KST read confirmed 21 total/due rows, zero invalid
times, no existing retention job, 2,024 attendance rows and zero payroll rows.
A short reservation-table lock and exact 21-due-row guard protected the activation
boundary. The first submitted wrapper had a SQL dollar-quoting syntax error and
executed no changes; the corrected wrapper then scheduled the reviewed command.

At 00:34:23.534 KST the Production job `manee-reservation-retention` (job 7) was
active as postgres with schedule `* * * * *` and exact command
`select private.manee_purge_expired_reservations(500);`. The first real cron run
started at 00:35:00.422 and succeeded at 00:35:00.468 KST. Independent 00:35:13
postflight found zero total/due reservations, establishing removal of the 21
preflight rows. The cron return message is “1 row” for the SELECT result, not a
reported deletion count. Attendance remained 2,024, payroll remained zero and
billing enforcement enrollment remained zero. No manual second purge was used.
A follow-up found the job active, one successful run, zero failed runs and no due
backlog. Staging remains unscheduled with its original four reservations.

This supersedes the inactive-state and pending-confirmation observations above.
The underlying implementation source `bbf8ccd` passed all six CI workflows,
including actual Auth/Storage APIs and Android packaging. Root regression was
955 total / 944 passed / zero failed / 11 environment-dependent skips. This turn
changes operational state and documentation only; no new Android install or
checkout is required. Other account-deletion, backup/processor, age-policy and
handset release gates are not completed by reservation disposal.
