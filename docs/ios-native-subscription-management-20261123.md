# iOS TestFlight 구독 관리 — 2026-11-23

## 발견한 문제와 수정

기존 iOS 구독 관리 버튼은 https://apps.apple.com/account/subscriptions 를 외부 화면으로 열었다. Apple의 App Store Commerce Engineer는 일반 Apple 계정으로 구매한 TestFlight 구독을 취소하려면 앱 안에서 StoreKit 구독 관리창을 열어야 한다고 설명한다. 이 기능 없이 설정 화면으로만 보내면 TestFlight 구매의 자동 갱신을 끄지 못하고 자연 종료까지 기다려야 할 수 있다.

- 공식 설명: https://developer.apple.com/forums/thread/802551
- API: https://developer.apple.com/documentation/storekit/appstore/showmanagesubscriptions(in:)
- TestFlight 갱신 안내: https://developer.apple.com/help/app-store-connect/test-a-beta-version/testing-subscriptions-and-in-app-purchases-in-testflight/

ManeeStoreKit의 manageSubscriptions 메서드를 추가해 현재 앱 창에 연결된 foreground UIWindowScene으로 AppStore.showManageSubscriptions를 호출한다. 다른 네이티브 창이 열렸거나 표시가 이미 진행 중이면 중복 표시를 차단하고 재시도 안내를 반환한다. 임의의 다른 scene이나 일반 구독 웹주소로 대체하지 않는다.

JavaScript 클라이언트는 기존 사장님·선택 매장 확인과 처리 중 잠금을 적용한다. 관리창을 닫은 뒤 계정·매장 일치 여부를 확인하고, 기존 매니 구독 팝업을 새 상태 조회로 다시 연다. 오류는 현재 팝업에 표시하며 재시도가 가능하다. 관리 요청은 구매·거래 검증·거래 완료·결제 lease 획득·구독 소유권 변경을 수행하지 않는다.

## 검증

- 소스 커밋: dd201127a38b591a631abcdccaeed3330932dc59.
- 로컬 전체 모바일 테스트 288개 통과, 실패 0개. 새 회귀 검사에는 네이티브 관리 호출, 중복 처리 방지, 계정 변경과 실패 시 잠금 해제, 관리창 종료 후 상태 재조회, 실패 후 재시도를 포함했다.
- production iOS 1.56 자산 생성 및 verify-store-assets --ios-release156 통과.
- 실행 45120297553 / job 137512275735의 서명 아카이브·IPA 내보내기·Apple 로그인 entitlement·테스트한 production 자산과 IPA 일치 검사·Apple 검증·업로드가 모두 success로 완료됐다.
- 2026-11-23 14:56:05 KST 확인: marketingVersion=1.56, version=156.25.1, processingState=VALID, internalBuildState=IN_BETA_TESTING, internalGroupConnected=true, invitationSent=false, reviewSubmitted=false.
- simulator 컴파일(45120301823)과 WebKit 화면 감사(45120301818)도 success다. WebKit의 1,968개 컨트롤에서 failures=[]였고 390px·820px에서 변경 전 배경 이동을 재현하고 변경 후 backgroundMoved=false를 확인했다. 이 결과는 실제 아이패드 구매나 취소 완료를 입증하지 않는다.

## 기기에서 마무리할 순서

1. 기존 156.24.1에서 이미 성공한 신규 구매는 다시 반복하지 않는다. 심사 전용 가상매장의 실제 매출 폼에서 매출 1,000원 저장과 저장값 재열람, 이용권 팝업 뒤 화면의 손가락 스크롤 잠금을 확인한다. 운영 매장 대신 지정된 가상매장을 이용한다.
2. 새 빌드가 TestFlight에서 사용 가능해진 뒤 업데이트한다. 더보기 > 매니 구독 > 구독 관리에서 앱 안의 Apple 구독 관리창이 열리고 테스트 구독이 표시되는지 확인한다.
3. 만료 검증을 위해 자동 갱신을 끄려면 이 Apple 관리창에서 테스트 구독을 취소한다. 취소했다고 즉시 만료로 간주하지 않는다. 관리창의 만료 시각과 이후 Apple·서버 상태를 확인한다.
4. 마지막 서버 조회 2026-11-23 14:47 KST에는 todtod07의 주 심사 매장 구독이 Sandbox, status=1, revoked=false, write entitlement=true였다. 당시 expires_at은 2026-11-24 13:36:30 KST였다. 자동 갱신 여부에 따라 바뀔 수 있으므로 이 시각을 확정 종료 시각으로 약속하지 않는다.
5. 같은 사장님 아이디의 다른 매장에도 아이디 단위 구독이 적용된다. 다른 매장 선택만으로 만료 계정을 만들 수 없다. 검증 상태를 만들기 위해 Apple 거래나 DB의 만료·소유권을 조작하지 않는다.
6. 실물 iPad는 별도 미확인 항목이다. iPad 크기의 WebKit 통과를 실물 iPad 통과로 기록하지 않는다.

Apple 신규가입 SMS 지원 통화 요청은 이미 접수됐고 3~5영업일 이내 연락 안내를 받았다. 이번 수정·TestFlight 배포는 통화와 독립적으로 진행한다. 정식 App Store 재제출이나 출시 승인을 의미하지 않는다.

실행 링크:

- https://github.com/unionconnect-kr/winners/actions/runs/45120297553
- https://github.com/unionconnect-kr/winners/actions/runs/45120301823
- https://github.com/unionconnect-kr/winners/actions/runs/45120301818
