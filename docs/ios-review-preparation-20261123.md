# iOS 재심사 준비 — 2026-11-23

## 실제 기기에서 확인한 범위

TestFlight 1.56 (156.22.1)의 실제 iPhone에서 Apple 인증 후 이름·이메일 재입력 없이 가입 화면에 진입했고, 문자 수신·휴대폰 인증·사장님 신규가입·로그아웃 후 Apple 재로그인까지 완료했다. 기존 Apple 구매가 다른 매니 계정에 연결된 경우 재구매가 차단됐고 원래 매니 계정에서는 테스트 구독 인식과 복원 후 상태 유지가 확인됐다.

이는 새 Apple 구독을 구매하고 해당 매니 계정의 서버 이용권에 반영한 실험을 대신하지 않는다. 실제 iPad 검증도 아직 완료되지 않았다.

## 반영한 내용

- iOS의 구독 거절 안내는 사장님에게 더보기의 구독 상태를 안내하고, 직원에게만 사장님 문의를 안내한다. 역할별 실행 테스트를 추가했다.
- 기존 심사 전용 가상매장 한 곳만 Sandbox 이용권 검증 환경으로 전환했다. 변경 전 Sandbox 매장은 0곳, 변경 후 1곳이다. 운영 결제는 계속 활성 상태이며 다른 매장은 Production 환경을 유지한다. 유효한 테스트 구매 없이 해당 심사 매장에 입력 권한을 부여하지 않았다.
- App Store Connect의 기존 심사 계정 비밀번호와 검증 안내를 갱신한 뒤 같은 API로 읽어 일치함을 확인했다. 실행 45091298125에서 updated, passwordVerified, notesVerified 모두 true였다. 비밀번호는 기존 Apple API 서명키의 공개키로 암호화한 자료만 저장소에 기록하고 실행 환경 안에서 복호화했다. 비밀키나 비밀번호는 로그에 출력하지 않는다.
- 심사 빌드 선택, 정식 심사 제출 또는 계정의 구매 소유권 이전은 수행하지 않았다. 확인한 앱 버전 상태는 REJECTED다.

## 아직 필요한 사항

1. 기존 구매 이력이 영향을 주지 않는 Apple Sandbox 결제 환경에서 신규 구매 → 서버 저장 → 심사 전용 매장 입력 권한 반영 → 재실행 후 유지까지 실제 기기에서 확인한다. 일반 Apple 계정의 기존 테스트 구독을 다른 매니 계정으로 옮겨 검증하지 않는다.
2. 심사자가 첫 Apple 가입을 직접 검수하려면 한국 번호의 SMS 인증 코드를 받을 수 있는 절차가 필요하다. 일반 사용자의 휴대폰 인증을 완화하거나 클라이언트에 고정 인증번호를 넣지 않았다. 유효기간이 짧은 실제 SMS 코드를 미리 심사 노트에 적는 것으로 해결됐다고 간주하지 않는다. 기존 만료 데모 계정으로 구매 흐름을 열고, 신규가입 SMS는 App Review 통화 등 전달 일정과 연락 절차를 정해야 한다. 통화 예약은 아직 하지 않았다.
3. 실제 iPad의 신규 구매 및 심사자의 인증 절차가 준비되기 전에는 재제출 준비 완료로 보고하지 않는다.

## 신규 결제의 실제 검증 순서

1. TestFlight에서 새 빌드를 먼저 설치한다.
2. App Store Connect의 사용자 및 액세스 > Sandbox에서 구매 이력이 없는 테스트 계정을 만든다. 이메일은 일반 Apple 계정에 사용하지 않은 주소여야 한다.
3. TestFlight 결제에 Sandbox 계정을 사용하려면 테스트 기기의 미디어 및 구입 항목에서 일반 계정을 로그아웃하고 개발자 설정의 Sandbox Apple 계정에 로그인한다. 기기 전체 iCloud 계정은 로그아웃하지 않는다.
4. 매니에서는 만료 데모 계정으로 로그인하고 주 심사 전용 가상매장을 선택한 뒤 구독한다.
5. Apple 구매 완료 뒤 올바른 계정·상품·Sandbox 거래가 서버에 저장되고 매장 입력 권한이 실제로 열렸는지 확인한다.
6. 매출 1건 등 업무 입력, 앱 재실행, 구독 복원을 차례로 확인한다. 사용자의 실제 검증 전에는 통과로 기록하지 않는다.

참고: https://developer.apple.com/help/app-store-connect/test-a-beta-version/testing-subscriptions-and-in-app-purchases-in-testflight/
참고: https://developer.apple.com/help/app-store-connect/test-in-app-purchases/create-a-sandbox-apple-account

## 자동 검증

- 모바일 테스트 277개 통과.
- 심사정보 암호화·수정 범위·읽어 확인하기 테스트 6개 통과.
- 서명 아카이브·내보낸 IPA·Apple 로그인 entitlement·IPA와 테스트한 생성 자산 일치 검사 통과.

## TestFlight 배포 완료

1.56 (156.23.1)은 2026-11-23 10:03:14 KST에 Apple processingState=VALID, internalBuildState=IN_BETA_TESTING, internalGroupConnected=true를 확인했다. 서명 워크플로 실행은 success로 종료됐다. 정식 심사 제출은 하지 않았다.

실행: https://github.com/unionconnect-kr/winners/actions/runs/45091118528

이 빌드는 마지막 심사 소스와 이번 계정 확인·안내 수정 기준이다. PC에만 있는 미커밋 작업의 포함 여부는 확인하지 못했다.
