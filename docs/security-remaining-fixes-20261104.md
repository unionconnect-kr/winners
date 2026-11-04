# Remaining security fixes — 2026-11-04

Revoked sessions could still read their own profile, attachment checks were not
installed, and staging retention depended on unrelated activity. This change
adds a narrow profile guard, bounded attachment structure checks, and scheduled
staging disposal using existing retention periods.

## Deployment state

- **Production and staging:** `profile_read_live_session_guard` installed.
  Original policy is preserved in `private.manee_security_policy_backup` under
  `profile_session_20261104`. Every live active-profile session had identical
  profile visibility before/after the change. Backup rows are not client-readable.
- **Staging only:** `attachment_structure_validation` installed. Two triggers
  protect sales-report photos and contract attachments; installed function
  hashes match the release record. Production deployment was rejected by
  automatic approval review pending explicit approval of possible upload
  compatibility impact. No alternate production execution was attempted.
- **Staging only:** `staging_retention_schedule_and_sms_cleanup` installed.
  Four reservations past the established seven-day deadline were disposed of;
  four unexpired reservations remain. Completed deletion requests use the
  existing 720-hour rule. Five expired SMS challenges remain because none has
  reached the existing seven-day history deadline. The separate verified
  account binding remains intact.

## Scope and limits

The profile policy requires `is_live_manee_session()` in addition to matching
the user's identity. It retains AAL1 login bootstrap and AAL2 access. It does
not change sessions, write policies or account rows.

Attachment checks apply to new/changed values. Historical values retained in
the same row and column survive unrelated edits. New remote URLs are refused
because their contents cannot be validated by this database guard. Limits are
5 MiB per file, 20 photos and 20 MiB encoded JSON per photo category.

JPEG markers/scan framing, PNG chunk bounds, WebP RIFF bounds and PDF final
cross-reference framing are checked, with dimension bounds for images. PDF
active-feature names are checked after decoding name escapes. Encrypted PDFs
and compressed-object-stream PDFs are rejected conservatively; users may need
to export an ordinary PDF or upload a supported image. This is structural
validation, **not** full image pixel decoding, image re-encoding, a complete
PDF parser, or antivirus scanning. The earlier fake-header samples are now
rejected, but the broader attachment-hardening item remains partial.

The SMS service already deleted challenge history older than seven days when
a new SMS was requested. The scheduled maintenance reuses that period, also
requiring expired challenges/proofs, and preserves in-flight `consuming`
operations. It does not delete phone bindings or reset rate-limit records.
No client role, including service_role, can run maintenance functions.

## Validation

- Three new scenario suites cover profile revocation/expiry/foreign sessions,
  exact rollback and drift refusal; real and malformed JPEG/PNG/WebP/PDF,
  active PDFs, MIME mismatches, size/count/URL boundaries and historical data;
  SMS retention boundaries, in-flight proofs, unchanged bindings and grants.
- Full local regression: **862 total, 852 passed, 10 environment-dependent
  skips, zero failures**. The scenario suites contain multiple assertions and
  are included in this total.
- Staging: attachment triggers enabled, three function hashes matched, fake
  PNG/PDF refused. Production attachment functions are still absent.
- All three staging retention jobs active; zero currently due reservations
  and SMS challenges after the bounded first run.

## Rollback / stop

Run the corresponding SQL in one transaction. The profile rollback verifies
the installed policy before restoring the exact original. The attachment
rollback verifies function hashes and both trigger shapes before removing only
these new guards; it never modifies stored attachments. The retention stop
script verifies commands and unschedules only the three reviewed jobs.
Already disposed records cannot be recovered with the stop script.

These are explicit operator scripts under `security/`; normal web builds do
not execute them. Production attachment installation still requires approval.
