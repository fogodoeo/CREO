# 결제 후 배송 변경 검토 · 2026-10-23

## 범위와 근거

기존 HTML/JS/CSS 관리자 배송 편집의 결제 완료 후 배송비 변경, 조회 실패 복구, 수령지 되돌리기, 메모 저장을 개선했다. AGENTS.md와 LIVE_RELIABILITY_CHECKLIST.md를 적용했다. 위험도는 high(기존 결제 보호 분기 인접), 배포는 release다. 자동 환불·추가 결제 기능과 정산 계산 규칙은 추가하지 않는다.

| 분야 | 확인한 근거 | 결과 |
| --- | --- | --- |
| 접근성 | 실제 320px Tab/Enter/Space, 초점 표시·복귀, AX 이름·상태 | 복구·가림 문제 수정 |
| 구조 | 320px 및 1265px 실제 검토·오류·완료 화면 | 비교와 복구를 같은 편집창에 배치 |
| 문구 | 저장 차단 이유, 변경 전후 금액, 차액, 메모 보존 안내 | 자동 결제·환불 처리와 구분 |
| 글자 | 긴 안내 줄바꿈, 금액 정렬 | 14px/1.5 본문, 숫자 폭 고정, 줄바꿈 확인 |
| 색상 | 계산 스타일 rgb(51,65,85) / rgb(248,250,252) | 실제 본문 대비 9.90:1, 기존 팔레트 사용 |
| UI | 44px native button, 표시/숨김·대기·오류 상태 | 기존 버튼 규칙 사용, 새 애니메이션 없음 |

## 발견과 조치

| 심각도 | 분야 | 위치 | 이전 | 수정 | 사용자 영향 |
| --- | --- | --- | --- | --- | --- |
| HIGH | 문구/구조 | `platform-api.js:2687`, `public/shipping.html:4085` | 결제 후 배송비 변경 시 409와 빈 금액만 표시 | 읽기 전용 업체별 현재/확인/예상/차액 표시, 실제 저장은 차단 | 변경 효과와 다음 행동을 이해 |
| HIGH | 접근성 | `public/shipping.html:4058` | 조회 실패 후 같은 조건의 재시도 경로 없음 | 금액 다시 확인 버튼, 새 버전 조회, 입력 유지와 초점 복귀 | 입력을 잃지 않고 복구 |
| HIGH | 접근성 | `public/shipping.html:2090` | 모바일 Tab 이동 시 하단 메뉴가 저장 버튼을 가림 | 편집 중 하단 메뉴 숨김, 닫으면 복원 | 초점과 저장 버튼이 보임 |
| MEDIUM | 구조 | `public/shipping.html:4070` | 변경 취소에 수동 재선택 필요 | 수령지만 되돌리고 작성 메모 유지 | 재입력 제거 |

## 검증

- 새 회귀는 수정 전 409 응답에서 실패했고 수정 후 통과했다. 완료 226,000원 → 예상 200,000원(26,000원 감소), 다른 거점 예상 241,000원(15,000원 증가)을 확인한다. 중복·동시 조회/재시작은 기록을 바꾸지 않으며 저장 가능 값을 위조해도 실제 저장은 409다. 메모 저장은 결제 필드를 보존한다.
- `node --test test/operator-shipping-editor-ui.test.js test/operator-shipping-checkout.test.js test/vendor-shipping-editor.test.js test/shipping-interaction.test.js`: **42 통과**.
- `npm test -- --test-concurrency=4`: **1,803 통과, 0 실패**. 이후 하단 메뉴 숨김 CSS만 추가한 뒤 실제 화면으로 다시 검증했다.
- `python -m unittest discover -p "test*.py"`: **279 통과**. 실행 중인 앱은 재시작하지 않았다.
- `npm run check`, 변경 소스 5개 UTF-8·U+FFFD·스크립트 구문 검사, `git diff --check` 통과.
- `BUYER_PREVIEW_PORT=4425 BUYER_PREVIEW_PAID_REVIEW=1 node tools/buyer-journey-preview.cjs`: 가상 데이터/격리 SQLite만 사용. 실제 차액 검토 → 키보드 되돌리기 → 메모 저장 → 재진입 완료. A 226,000원 결제 완료와 B 107,000원 대기는 유지되고 A 메모만 변경됐다.
- 조회 실패 1회 주입 후 Tab/Enter로 재조회, 같은 메모/수령지 유지, 완료 후 메모에 초점 복귀 확인. 편집 종료 후 목록 버튼 초점과 하단 메뉴 복원. 외부 결제·환불·메시지 발송 없음.
- 증거: `../admin-home-review-20261022/paid-shipping-review-320.png`, `paid-shipping-focused.log`, `paid-shipping-server-full.log`, `paid-shipping-desktop.log`, `paid-shipping-check.log`.

**Not verified:** 200% 브라우저 확대, 실제 화면 낭독기, 전체 역할의 나머지 경로. 실제 환불·차액 정산은 외부 처리 업무이며 이 화면은 실행하거나 완료 표시하지 않는다.

## 배포

배포 및 읽기 전용 보존 검사는 반영 후 추가한다.

## 판정

Approve — 위 검증 범위의 HIGH 문제를 수정했다. 전체 UI/UX 개편 완료 판정은 아니다.
