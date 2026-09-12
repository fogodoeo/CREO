# 구매자 보관함의 계정 전환·화면 수명 검증

2026-09-12. 위험도 release: 인증된 개인 화면의 표시 수명과 여러 페이지가 사용하는 사진·문의 뷰어를 변경했다. 운영 배포·실제 로그인·고객 기록 변경·알림 발송은 하지 않았다.

## 재현한 문제

실제 Chrome 두 탭, 임시 SQLite, 가상 카카오 제공자와 실제 OAuth 콜백/세션 쿠키를 사용했다. 두 번째 탭에서 로그아웃한 뒤 첫 번째 탭의 세션 API는 `authenticated:false`였지만 개체 카드 **3개가 계속 표시**됐다. 첫 진입 외에 세션을 재확인하는 처리가 없었다.

PC 저장소의 재현 증거: `scratch/checkout-redesign/buyer-library-session-before.json`, `buyer-library-session-before.png`.

## 반영한 동작

- 다른 탭에서 로그인·로그아웃하면 로그인 상태를 다시 확인한다. `BroadcastChannel`을 우선 사용하고 미지원 환경은 `storage` 이벤트를 쓴다. 신호는 변경을 알리는 용도이며 그 자체로 권한을 부여하지 않는다.
- 탭 숨김·페이지 이탈 시 개인 목록, 상세, 연결 미리보기, 사진, 문의 번호·링크를 비운다. 창 복귀·뒤로가기 캐시 복원 시 서버 확인 후 다시 표시한다.
- 신호에는 계정·전화번호·거래 링크·원본 CSRF 값을 넣지 않는다. 세션 식별 비교에는 CSRF 값의 SHA-256 지문을 사용한다. 이 값으로 API에 접근할 수는 없다.
- 화면 세대가 바뀌면 진행 중 조회를 중단한다. 늦게 도착한 개체 상세·목록·연결 응답과 오류가 새 화면을 덮지 않게 한다.
- 같은 세션이면 보고 있던 경매를 다시 조회하고, 입력 중이던 연결 창은 입력값만 복원한다. 확인·연결 저장을 자동 재실행하지 않는다. 취소했던 창은 복귀 시 다시 열지 않는다.
- 다른 세션이면 이전 경매 위치·연결 입력도 초기화한다. 같은 전화번호의 다른 카카오 계정으로 이전 소유권을 넘기지 않는다.
- 로그아웃을 누르면 개인 화면부터 비운다. 응답 유실 시 개인 자료를 복원하지 않고 서버 재확인 또는 재시도 화면으로 복구한다. 세션 확인 자체가 실패해도 기존 자료를 표시하지 않는다.
- 사진·문의 뷰어에 명시적인 `clear()`를 추가했다. 보관함이 이 함수를 호출해 닫힌 창의 제목·부모 설명·사진 URL·전화 링크·복사 문구까지 정리한다. 다른 페이지의 일반 닫기 동작은 유지한다.

## 검증 결과

- `node scratch/checkout-redesign/buyer-library-session-check.cjs`: **8그룹 통과**. 실제 두 탭 로그아웃, 열린 사진 제거, 같은 번호의 다른 계정과 문의 창 정리, 세션 장애/복구와 입력 보존, 지연 상세 응답, 뒤로가기, 로그아웃 응답 유실, BroadcastChannel 미지원 시 storage 경로를 검증했다.
- 실제 Chrome 뒤로가기에서 `pageshow.persisted === true`를 관찰해 **BFCache 복원 경로**를 확인했다. 숨김/표시 이벤트의 추가 실패 주입은 document visibility를 시뮬레이션했다. 모바일 OS의 앱 전환을 직접 검증했다는 뜻은 아니다.
- `node scratch/checkout-redesign/buyer-library-check.cjs`, `buyer-inquiry-check.cjs`(5그룹), `buyer-navigation-check.cjs`: 인접 실제 브라우저 회귀 통과. 기존 연결 응답 유실 재시도, 거래 재사용·삭제 후 기록 유지, 문의/사진, 첫 등록 순서와 모바일 크기를 유지했다.
- `node --test test/buyer-account.test.js test/buyer-auth-lifecycle.test.js test/checkout-item-view.test.js test/vendor-inquiry.test.js`: **38개 통과**.
- `npm run check`, `npm test`: 서버 **634개 통과**. PC `python -m unittest discover -p "test*.py"`: **189개 통과**. 이후 복구 화면 제목 추가는 위 8그룹 브라우저 검사에서 다시 확인했다.
- UTF-8, `git diff --check` 통과. 수정 전 자료 노출과 수정 후 세션 오류 화면을 이미지로 검토했다.

## 남은 경계

실제 Android/iOS 카카오톡 내장 브라우저·Safari 앱 전환, 저장소와 탭 통신이 모두 차단된 환경의 즉시 탭 간 알림은 미검증이다. 복귀 시 서버 재확인은 유지한다. 로그인해 계속 보고 있는 거래 자체의 실시간 변경 갱신, 계정 탈퇴/연결 해제, 과거 고객 자료 이관과 기록·사진 보관 정책은 별도 미완료 범위다. 이 검증으로 전체 사이트 개선 완료를 주장하지 않는다.
