# Upload the reviewed iOS device build

The current mobile source is isolated from production main. This manual workflow
uploads the already signed, successfully compiled device build without merging
the cumulative mobile/Android/web branch or rebuilding a different binary.

Fixed destination: App Store Connect app `6820833544`, bundle `kr.co.manee.app`.
Fixed source: `d94bd7da08e83002966f65c0ec5386d5f0869267`, successful signed-build
run `38786406361`, artifact `11997692946` (`manee-ios-signed-5-1`). The artifact
expires on 2026-10-22 UTC. Expiry or any provenance/digest mismatch fails closed;
there is no fallback to another artifact, branch or binary.

Only manual workflow dispatch on company repository main with build `1.5.1`
starts the upload. PRs and pushes never upload. Minimal repository permissions
are contents/actions read. Apple credentials are supplied only to the existing
pinned uploader after archive validation. It verifies app identity, validates
the IPA with Apple before uploading and removes its temporary key files.

This does not accept Apple agreements, invite testers, submit App Store review,
activate purchases, change app visibility or deploy the production web app.
Upload success is separate from Apple processing and TestFlight installation.
Apple paid-entitlement integration, notifications and actual iPhone QA remain
release gates; build 1.5.1 is suitable for the scoped existing-store device QA,
not a claim of completed paid iOS rollout.

2026-10-16: the operator has TestFlight installed and the account-holder login
succeeded. The developer account's agreement page currently renders a maintenance
message, so no updated license agreement has been reviewed or accepted. A fresh
tab returned the same maintenance page. App Store Connect remains accessible.
