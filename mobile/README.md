# 매니 iOS 빌드 준비

2026-10-16 이어가기: 최신 공통 화면을 반영하고 iOS 보고서 저장·공유와
입력 제한 안내를 보완한 별도 빌드를 준비 중입니다. 아래 기존 구축 기록과
구분한 현재 범위·출시 차단 항목은 [iOS 이어가기 기록](../docs/ios-release-2026-10-16.md)을
참고하세요. TestFlight 업로드·설치 및 Apple 결제 검증은 완료 상태가 아닙니다.

현재 상태: iOS 프로젝트와 CI 서명 빌드 경로를 준비했습니다. App Store 제출용 완료본은 아니며, CI는 IPA artifact만 생성하고 Apple 업로드나 심사 제출은 수행하지 않습니다.

- 앱 ID: `kr.co.manee.app`, Apple Team: `J7AWFKW86N`, 버전: `1.0`
- 최초 대상: iPhone, iOS 15 이상. iPad 전용 배포는 현재 준비 범위에 포함하지 않습니다.
- Capacitor 8, Xcode 26 이상, Node.js 22 이상. Swift Package Manager 사용.
- 웹 화면과 라이브러리를 앱에 포함합니다. 원격 `server.url`을 사용하지 않습니다.
- 모바일 빌드는 웹 화면 원본을 보존합니다. 이 브랜치는 별도의 iOS 서버 함수와 예약 알림의 APNs 경로를 추가하며, 운영 배포는 아직 하지 않았습니다.

## 재현

저장소 루트에서:

```sh
cd mobile
npm ci
npm test
npm run build:staging
npm run sync:ios
npm run open:ios
```

`npm test`는 환경 분리, 스크립트 구문, 필수 자산과 웹 원본 보존을 검사합니다. GitHub의 `iOS simulator build`는 Mac에서 서명 없이 컴파일합니다. 시뮬레이터 빌드는 App Store에 업로드할 수 없습니다.

`build:staging`은 별도 Supabase 스테이징 프로젝트만 사용합니다. 스테이징 Netlify 서비스가 없으므로 AI/영수증 분석/푸시 서비스 주소는 `.invalid`로 차단합니다. `build:production`만 기존 운영 서비스 주소를 포함합니다. 환경 인자를 생략하면 실패합니다.

위치 확인은 Capacitor Geolocation을 통해 사용자 동작 시 요청합니다. 기존 출퇴근 서버의 거리 확인 로직을 그대로 사용합니다. 권한 거부/위치 서비스 해제/대략적 위치 및 실제 매장 반경은 iPhone에서 검증해야 합니다.

## 제출 전 남은 작업

1. **브랜딩**: Mac의 `sync:ios`가 기존 `icons/icon-512.png` 매니 로고로 1024px 불투명 아이콘과 시작 화면 자산을 생성합니다. 실제 기기에서 크기와 화면 전환을 확인해야 합니다.
2. **실기기 확인**: 사장님/직원 로그인, 세션 복구, 초대, 출퇴근, 사진 첨부, 급여/매출, PDF·엑셀 저장/공유, 화면 안전 영역과 키보드를 확인합니다. 파일 다운로드와 브라우저 음성 인식은 네이티브 대응이 필요할 수 있습니다.
3. **알림**: 사장님용 APNs 등록/해제/본인 테스트 및 오늘 예약 cron 연결을 구현했습니다. 직원 알림, 월 비용 알림, 예약 직전 알림 및 알림 터치 후 매장 이동은 아직 네이티브에 연결하지 않았습니다. Apple 키와 서버 배포 후 실제 기기 수신 검증이 필요합니다. 웹 푸시 설정은 모바일에서 사용하지 않습니다.
4. **구독**: StoreKit 2 구매/복원, 미완료 거래 재처리, Apple 서버 검증 및 갱신/환불 webhook을 구현했습니다. 실 결제는 기본 OFF입니다. 아직 기존 서비스 기능에 유료 이용권 제한을 적용하지 않았으므로, 과금 정책·무료 이용 범위·추가 매장 상품·Sandbox 검증을 완료하기 전에는 활성화하지 마세요. 현재 상품은 한 Apple 구독을 한 매장에만 연결합니다.
5. **개인정보**: 네이티브 SDK/외부 AI 처리/구독 데이터까지 포함하여 개인정보 공개와 실제 수집 동작을 대조해야 합니다. 이 프로젝트는 미확인 암호화 수출 답변이나 개인정보 선언을 자동 입력하지 않습니다.
6. **서명 및 업로드**: 아래 CI는 서명된 IPA를 생성합니다. Apple 업로드 및 심사 제출은 별도 단계입니다. 인증서, `.p8`, `.p12`, 비밀번호는 저장소/대화에 넣지 않습니다.

## Apple 서명 후 업로드 (Mac)

출시 검증이 끝나면 `npm run build:production && npm run sync:ios` 후 Xcode 프로젝트를 엽니다.

1. Xcode Settings → Accounts에서 회사 Apple 개발자 계정으로 로그인합니다.
2. App 타깃 → Signing & Capabilities에서 회사 Team 및 자동 서명을 선택합니다. 기존 Bundle ID를 유지합니다.
3. 앱 아이콘과 권한 설명을 확인하고, 빌드 번호를 이전 업로드보다 높게 설정합니다.
4. 실제 기기 대상에서 Product → Archive → Distribute App → App Store Connect로 업로드합니다.
5. Apple 처리 완료 후 App Store Connect → 매니 → iOS 앱 버전 1.0 → 빌드에서 선택합니다.

## GitHub에서 서명 빌드

워크플로: `.github/workflows/ios-signed-build.yml` (`iOS signed archive`). 회사 저장소의 `main`과 `codex/ios-build-preparation`에서 실행합니다. 모바일 소스·자산 및 해당 워크플로 파일 변경 push는 서명된 IPA만 생성하며 Apple에 업로드하지 않습니다.

기본 브랜치에 반영된 후 GitHub Actions → iOS signed archive → Run workflow에서 `main`을 선택하고 `upload_testflight`를 체크한 수동 실행만 App Store Connect 업로드를 수행합니다. 기본값은 false입니다. 기존 `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_PRIVATE_KEY`를 사용하며, 고정된 매니 앱 접근 확인 → Apple IPA 검증 → 업로드 순서로 진행합니다. 검증 실패 시 업로드하지 않고 개인키는 성공/실패 시 모두 제거합니다. 업로드 성공과 Apple 처리 완료는 별개이며, 이 절차는 테스터 초대·외부 테스트 심사·앱스토어 심사 제출을 하지 않습니다.

Repository secrets:
- `IOS_DISTRIBUTION_P12_BASE64`: 배포 인증서와 개인키를 포함하는 p12의 Base64
- `IOS_DISTRIBUTION_P12_PASSWORD`: p12 암호
- `IOS_PROVISION_PROFILE_BASE64`: App Store 프로파일의 Base64

임시 키체인 암호는 실행마다 무작위로 생성합니다. 입력 파일 해독, 암호와 개인키 import, 배포 인증서/프로파일 일치, 회사 Team, 앱 ID, 프로파일 만료 및 배포 유형을 검증합니다. Windows OpenSSL 3 p12를 macOS에서 직접 import할 수 없으면 임시 로컬 파일로 호환 컨테이너를 만들고 삭제합니다. 서명 자료는 작업 종료 시 제거되며 artifact에 포함하지 않습니다.

`npm test` → `build:production` → `sync:ios` → Release archive → app-store-connect IPA export 순서입니다. 빌드 번호는 `1.<run_number>.<run_attempt>`이고 IPA artifact는 7일 보관합니다. TestFlight에서 먼저 로그인·파일·알림을 검증하고, 결제는 별도 Sandbox 서버 연결 후 검증합니다. 운영 서버의 과금 활성화와 앱스토어 심사 제출은 위 출시 조건을 완료한 뒤 진행합니다.


## 네이티브 서버 배포와 키 설정

구현 파일: `netlify/functions/ios-billing.js`, `ios-apple-notifications.js`, `ios-push.js`.
사장님 앱의 **더보기 → 아이폰 구독·알림**에서 구매/복원 및 알림을 관리합니다.
서버가 준비되지 않으면 구매 버튼을 표시하지 않습니다. 푸시 가입은 사용자가 누른 때만 권한을 요청합니다.

배포 순서:
1. `native_ios_services` SQL 마이그레이션을 테스트 DB에서 검증한 뒤 운영 DB에 적용합니다. 테이블은 private/RLS이며 구매 결과 저장과 APNs 대상 조회는 service_role 전용입니다. 이번 작업은 스테이징 DB에만 적용했습니다.
2. 승인된 서버 배포에서 아래 환경변수를 설정합니다. 키 원문은 저장소·대화·빌드 로그에 넣지 않습니다. GitHub 서명용 p12와 서버용 p8은 다른 자격증명입니다.
3. 전용 테스트 서버와 테스트 앱을 연결하여 Sandbox 거래를 검증합니다. 현재 `build:staging`은 외부 서버 연결을 차단하므로, 테스트 서버의 고정 origin을 명시하는 배포 구성이 추가로 필요합니다.
4. StoreKit 테스트에서 신규/재설치/복원/승인 대기/갱신/만료/환불/다른 계정·매장/오프라인 실패를 확인합니다. Sandbox 레코드는 운영 이용권을 절대 활성화하지 않습니다.
5. 유료 기능의 서버 권한 제한과 약관·개인정보 공개를 완료한 뒤에만 운영 환경에서 `IOS_PURCHASES_ENABLED=true`를 설정합니다.

| 서버 환경변수 | 값/용도 |
| --- | --- |
| `APPLE_IAP_KEY_ID`, `APPLE_IAP_ISSUER_ID`, `APPLE_IAP_PRIVATE_KEY` | App Store Connect → 사용자 및 액세스 → 통합 → 앱 내 구입에서 준비한 서버 API 서명 키 |
| `APPLE_IAP_ENVIRONMENT` | 테스트 서버 `Sandbox`, 운영 서버 `Production`; 요청 본문으로 변경 불가 |
| `IOS_PURCHASES_ENABLED` | 기본 미설정/false. 출시 검증 전 true 금지 |
| `IOS_PRIVACY_URL`, `IOS_TERMS_URL` | 공개 HTTPS 개인정보 처리방침 및 적용되는 구독 이용약관 URL |
| `APNS_KEY_ID`, `APNS_PRIVATE_KEY` | Developer → Keys에서 APNs 사용이 허용된 키 |
| `APNS_TEAM_ID` | `J7AWFKW86N` |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | 해당 서버 환경의 DB. 클라이언트에 노출하지 않음 |

App Store 서버 알림 V2 주소: 배포 origin의 `/.netlify/functions/ios-apple-notifications`.
Apple JWS 인증서 체인과 서명을 검증하고, 매번 Apple 서버의 최신 구독 상태를 다시 조회합니다.
등록된 매장 토큰과 일치해야 저장하며 오래된 응답은 최신 상태를 덮어쓰지 않습니다.

APNs는 App Store/TestFlight용 production endpoint만 사용합니다. 서명 프로파일에 `aps-environment=production`이 없으면 CI가 명확한 메시지로 중단합니다.
한 기기의 알림은 사장님이 선택한 한 매장에 연결됩니다. 발송 시 현재 세션·정지 여부·매장 소유 권한을 다시 검사합니다.
직접 알림 테스트는 로그인한 본인의 기기로만 전송합니다. 로그아웃은 서버 토큰 해제를 확인한 후 완료합니다.
푸시 키가 없으면 cron의 기존 웹 알림은 계속 동작하고 네이티브 발송은 건너뜁니다.

검증:
```sh
npm ci
node --test tests/native-apple-services.test.mjs tests/native-ios-database.test.mjs
npm --prefix mobile ci
npm --prefix mobile test
```
이 테스트는 모의 Apple 응답과 격리된 PostgreSQL을 사용합니다. Apple Sandbox 거래나 실제 APNs 수신을 대신하지 않습니다.

스테이징 보안 점검: 새 테이블 3개는 private/RLS이고 클라이언트 직접 접근 정책을 의도적으로 두지 않았습니다.
[정책 없는 RLS 안내](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)는 이 구조에서 예상되는 정보 항목입니다.
기존 public RPC 3개의 SECURITY DEFINER 경고와 유출 암호 차단 비활성 경고는 이번 변경 이전 영역으로, 이 작업에서 변경하지 않았습니다.
[RPC 권한 안내](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable) · [암호 보호 설정](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

## Android 테스트 앱

Android 프로젝트와 APK 빌드·기기 확인 순서는 [ANDROID.md](ANDROID.md)를 참고하세요.
