# 업체 결제 작업창과 낙찰자 완료 흐름

위험도: Release. 기존 결제/카드 API를 쓰는 클라이언트 흐름과 배포 변경이다. 서버 계산·저장 규약은 변경하지 않는다. better-interface의 단계별 노출, 명확한 행동/금액, 입력 보존, 기본 대화상자, 키보드 초점, 모바일 reflow를 적용했다.

## 변경

- 목록에는 상태·금액·카드 안내 등록 또는 결제 확인 버튼을 표시한다. 링크 입력과 외부 발송 선택은 카드 안내 작업창에 모았다.
- 실제 결제 확인/이전 카드 안내 취소 확인은 구매자·회차·금액을 보여주는 기본 대화상자를 사용한다. 실제 처리 여부 확인 없이 완료할 수 없다.
- 카드 링크 입력을 닫았다 다시 열어도 유지한다. 작업 중 입력·중복 클릭·닫기·이동을 막는다. 실패는 사라지는 alert 대신 같은 작업창에 표시하고 초점을 보낸다.
- 결과가 불명확한 요청은 동일 식별자·버전·금액으로 다시 확인한다. 해당 요청을 먼저 해결하기 전에는 금액/링크를 바꿔 보내지 않는다. 확정적인 입력 오류는 수정할 수 있고 회차/버전 충돌은 최신 조회로 복구한다.
- 저장 완료와 알림 발송 결과를 구분해 해당 구매자에 표시하고 완료된 단계 필터로 이동한다. 계좌/카드 내역의 실제 확인과 외부 카드 취소 자체는 종전대로 업체가 수행한다.

## 검증

- `node --test test/platform-pages.test.js test/vendor-payment-work.test.js test/vendor-checkout-flow.test.js test/buyer-payment-report-ui.test.js test/payment-confirmation.test.js test/checkout-change-requests.test.js test/vendor-shipping-editor.test.js test/checkout-round-continuity.test.js`: 124 통과.
- 새 작업창 10개 검사: 입력/취소, 오류 초점, 중복/동시 입력, 응답 유실 재시도 및 재진입, 실제 결제 확인 체크, 변경 배송비/미결제액, 회차/버전/업체 격리, 4xx 수정, 저장 후 표시 오류 복구, 외부 안내/취소 경로, 종료/결제완료/변경대기/수령지 미입력 경계.
- `npm run check`, 변경 JS/preview 및 HTML 인라인 구문 검사, 7개 파일 strict UTF-8/U+FFFD 검사 통과.
- `npm test -- --test-concurrency=4`: 1774 통과. 첫 실행은 엔드포인트 문자열이 HTML에서 새 작업창 파일로 이동한 데 따른 기존 정적 검사 1개가 실패했다. 파일 연결을 검증하도록 갱신한 뒤 전체 재실행에서 실패 0.
- 데스크톱 `python -m unittest discover -p "test*.py"`: 279 통과.
- 실제 CUA 격리 4421/320px: 카드 안내 107000원 등록, 응답 유실 후 자동 재시도 동일 요청, 낙찰자 카드 링크 표시, 완료 요청, 업체 확인, 3회 확인 응답 유실 후 지속 오류/키보드 재시도, 완료 필터/초점, 낙찰자 부분 결제 반영 확인.
- 실제 데스크톱: 계좌이체 226000원 확인창 Escape 취소/원래 버튼 초점 복귀, 다시 열어 확인 후 낙찰자 333000원 전체 완료/새로고침 유지 확인. 동일 요청으로 카드 안내 2회, 결제 확인 4회가 전달되어도 금액은 107000원 한 번만 확인되었다. 실제 메시지/결제 없음.
- 실측: 320px 내부 document clientWidth=scrollWidth=305, 데스크톱 1265/1265. 48px 버튼·20px 체크박스, 본문 15px, #4e5968/white. 기존 공통 CSS 때문에 비활성 버튼이 파랗던 상태를 회색으로 보정하고 최종 계산 스타일 확인.
- 증거는 `../admin-home-review-20261022/vendor-payment-{focused,server-full,desktop,check}.log`, `vendor-payment-error-320.png`, `vendor-payment-confirm-desktop.png`, `vendor-payment-buyer-completed-320.png`.

## 범위와 남은 확인

- 가상 SQLite/합성 연락처/가짜 알림 제공자만 사용했다. 외부 결제사의 실제 카드 승인·취소 화면은 변경하거나 거래하지 않았다.
- 전체 역할의 200% 확대/화면 낭독·인증·복수 회차·배송비 변경/환불 연결은 상위 계획에서 계속 진행한다. 이 작업만으로 전체 UI/UX 완료를 주장하지 않는다.
