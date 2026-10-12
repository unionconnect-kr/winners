# 매니 iOS 빌드 준비

현재 상태: iOS 프로젝트와 CI 서명 빌드 경로를 준비했습니다. App Store 제출용 완료본은 아니며, CI는 IPA artifact만 생성하고 Apple 업로드나 심사 제출은 수행하지 않습니다.

- 앱 ID: `kr.co.manee.app`, Apple Team: `J7AWFKW86N`, 버전: `1.0`
- 최초 대상: iPhone, iOS 15 이상. iPad 전용 배포는 현재 준비 범위에 포함하지 않습니다.
- Capacitor 8, Xcode 26 이상, Node.js 22 이상. Swift Package Manager 사용.
- 웹 화면과 라이브러리를 앱에 포함합니다. 원격 `server.url`을 사용하지 않습니다.
- 기존 웹 배포 파일 및 서버 환경 설정은 수정하지 않습니다.

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

1. **브랜딩**: 생성된 Capacitor 기본 앱 아이콘/시작 화면을 승인된 매니 원본으로 교체합니다. 현재 기본 이미지는 제출용이 아닙니다.
2. **실기기 확인**: 사장님/직원 로그인, 세션 복구, 초대, 출퇴근, 사진 첨부, 급여/매출, PDF·엑셀 저장/공유, 화면 안전 영역과 키보드를 확인합니다. 파일 다운로드와 브라우저 음성 인식은 네이티브 대응이 필요할 수 있습니다.
3. **알림**: 웹 Service Worker 등록과 웹 푸시 가입을 비활성화했습니다. APNs 및 서버 토큰 연동을 별도로 구현해야 합니다. 운영 서버에서 다른 웹 사용자에게 발송하는 기능은 유지됩니다.
4. **구독**: App Store Connect의 `manee.store1.monthly` 생성만으로 결제가 동작하지 않습니다. StoreKit 구매/복원 및 서버 구독 권한 검증이 아직 없습니다. 결제 화면과 출시 범위를 확정한 후 구현·Sandbox 시험해야 합니다.
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

워크플로: `.github/workflows/ios-signed-build.yml` (`iOS signed archive`). 회사 저장소의 `codex/ios-build-preparation` 브랜치만 실행합니다. 해당 워크플로 파일 변경 push로 실행되며, 기본 브랜치에 등록된 뒤에는 workflow_dispatch도 사용할 수 있습니다.

Repository secrets:
- `IOS_DISTRIBUTION_P12_BASE64`: 배포 인증서와 개인키를 포함하는 p12의 Base64
- `IOS_DISTRIBUTION_P12_PASSWORD`: p12 암호
- `IOS_PROVISION_PROFILE_BASE64`: App Store 프로파일의 Base64

임시 키체인 암호는 실행마다 무작위로 생성합니다. 입력 파일 해독, 암호와 개인키 import, 배포 인증서/프로파일 일치, 회사 Team, 앱 ID, 프로파일 만료 및 배포 유형을 검증합니다. Windows OpenSSL 3 p12를 macOS에서 직접 import할 수 없으면 임시 로컬 파일로 호환 컨테이너를 만들고 삭제합니다. 서명 자료는 작업 종료 시 제거되며 artifact에 포함하지 않습니다.

`npm test` → `build:production` → `sync:ios` → Release archive → app-store-connect IPA export 순서입니다. 빌드 번호는 `1.<run_number>.<run_attempt>`이고 IPA artifact는 7일 보관합니다. 빌드 성공은 기능/실기기 QA나 App Store 심사 통과를 의미하지 않습니다. 위 제출 전 남은 작업을 완료한 후 업로드해야 합니다.

