# MANEE 1.44 device feedback candidate

User confirmed 1.43 starts normally, retains login, and routes owner/staff correctly. Android Apple linking remained visible; owner notification actions and iPhone post-clock-out confirmation needed alignment. User supplied exact launch art for both platforms.

The reported calendar zero was clarified as a money display, not month zero. User explicitly requested retaining existing 10,000-won units and truncation. Calendar rendering is preserved byte-for-byte by regression coverage.

## Changes
- Remove Apple sign-in/link choices from both packaged platforms. Kakao/Naver callbacks and existing server identities are preserved.
- Dedicated notification settings card with full-width centered action and persistent loading control; explain that this QA build does not deliver native pushes.
- Equal-width, minimum 48px attendance confirmation actions. Short labels: 시간 수정 / 확인.
- Original supplied 852×1846 PNG is packaged without editing. Web launch view uses contain; iOS native launch uses matching aspect-fit artwork.
- Build 1.44 / Android code 45, iOS 144.x.x. Retains account checkout integration from PR67, with payments and push disabled. Not a production release.

## Verification
161 mobile regressions passed locally. Complete Android/iOS assets built. Cloud workflow additionally checks native packaging, Android Keystore/emulator, full page inventory, targeted notification/attendance alignment and supplied artwork across viewport widths.

Existing 1.43 artifacts remain unchanged. A new signed APK must retain the prior QA signing certificate before delivery. iOS is uploaded to TestFlight after build checks, with no App Store review submission or new tester invitation.

## Remaining
Actual push receipt and subscription purchase tests require a separately configured native test environment. Current QA remains unsuitable for App Store review or production rollout.
