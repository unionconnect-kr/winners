# Reviewed iOS QA upload — 2026-10-16

The operator explicitly authorized remaining overnight release preparation while
reserving device verification for one later batch. This narrow workflow uploads
only signed iOS 1.0 / build 1.6.1 after successful compilation and review of the
follow-up source. It does not submit App Store/Beta App Review, invite testers,
change access permissions, accept contracts or enable purchases.

Fixed source: `16ffc5c6a500de696fe9abc60a9e83e04b9f9a75`.
Successful archive run: `38800572039`, artifact `12003933161`, name
`manee-ios-signed-6-1`. Archive SHA-256:
`60d1de674a6ac18331c9f449edd74a89bad832c0dbceac9c1cd11207e4045ceb`.

The dedicated workflow runs only on company main when its own reviewed workflow
file is merged, or on an explicit manual retry for the fixed build. It validates
source/run/repository/workflow path, artifact identity/expiry/size and digest,
then safely extracts exactly one bounded IPA. A separate fixed-workflow guard
rejects other repositories, branches, event types and authorization markers.
The existing manual 1.5.1 upload path is unchanged.

Apple keys are available only to upload and read-only readiness steps. Identity is
pinned to app 6820833544 / kr.co.manee.app. Validation precedes upload; temporary
key files are private and always removed. Apple raw errors, tokens, keys and
account/contact fields are not printed. Follow-up processing/catalog inspection
prints only build state and product/price/trial/group metadata, without modifying
it. Failure of that read must not be confused with an accepted upload.

Four focused uploader/readiness tests pass: fixed official API origin, GET-only
requests, identity isolation, account-field filtering; denial boundaries; validation/upload ordering,
scoped child environment and key-file permissions/cleanup on success/failure.
