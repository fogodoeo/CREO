# 전국크레자랑 도착지 자동 지정 — 2026-10-06

위험도: Release. 업체용 방송 응답과 화면에 운송사별 공통 도착지를 추가하고 운영 웹에 배포한다.

- 파르게: 대구 크레오. 도도시: 대구 크레용.
- 같은 설정을 업체 API, 달력 아래 배송 안내, 배송 마감 팝업, 5마리 제출 후 수거 화면에서 사용한다.
- 출발 정거샵과 업체 지역을 바꿔도 도착지는 바뀌지 않는다. 기존 예약에도 공통 설정이 바로 적용되며 업체의 도착지 입력 단계는 없다.
- 기존 출발지 선택, 마감일 계산, 개체 승인, 수거 상태 저장은 유지한다. 외부 운송사에 예약을 자동 접수하는 변경은 아니다.

## 검증

- `node --test test/broadcast-inbound.test.js test/broadcast-origin.test.js test/national-broadcast.test.js`: 37/37 통과.
- `npm.cmd run check`, `node --check public/broadcast-inbound.js`, `node --check public/broadcast-inbound-core.js`: 통과.
- `node --test` (`NODE_PATH`에 번들 의존성 경로 지정): 992/992 통과.
- 데스크톱 `python -m unittest discover -p "test*.py"`: 203/203 통과.
- 새 회귀 테스트: 공통 도착지의 읽기 시 무변경, 임의 도착지 입력 무시, 다른 지역 출발지 선택, 수거 완료, 중복 요청, 재시작 이후 값 유지.
- 가상 업체·격리 DB로 `INBOUND_PREVIEW_PORT=4362 node tools/inbound-delivery-preview.cjs` 실행. 320px/390px 화면에서 출발 정거샵 선택, 5마리 일괄 제출, 수거 완료, 마감 팝업 열기·Escape 닫기를 확인했다. 브라우저 오류 로그 없음. 운영 경매 자료를 테스트 데이터로 사용하지 않았다.

## Interface review

범위: 전국크레자랑 업체의 고정 도착지 표시와 수거 화면. 기존 vanilla JS/CSS와 `--muted`/`--ink` 색상을 유지했다. 저장소 AGENTS.md와 LIVE_RELIABILITY_CHECKLIST.md를 따랐다.

| Domain | Evidence inspected | Result |
| --- | --- | --- |
| Accessibility | dt/dd 의미 구조, 수거 버튼 Enter, 팝업 Escape, 닫기 버튼 포커스 표시, 320px | Clear in inspected states |
| Layout | 운송사 카드 안에서 도착지와 출발지 분리, 320px/390px, 제출 후 수거 영역 | Clear |
| Writing | 운송사와 도착지 이름, 기존 “파르게 수거”의 운송사 오표기를 “수거 상태”로 변경 | Fixed |
| Typography | 도착지 값 14px/600, 보조 라벨 13px/400, 긴 값 줄바꿈 | Clear |
| Colors | 실제 흰 배경에서 보조 라벨 RGB(98,109,123) 5.26:1, 값 RGB(32,38,50) 15.17:1 | Clear |
| UI | 선택 컨트롤을 추가하지 않고 공통값 표시, 기존 수거 버튼·상태 유지 | Clear |

| Severity | Domain | Location | Before | After | Why |
| --- | --- | --- | --- | --- | --- |
| MEDIUM | Layout | public/broadcast-inbound.js:50; public/vendor-broadcast.js:20 | 출발지만 확인 가능 | 운송사별 도착지 자동 표시 | 업체가 어디로 보내야 하는지 같은 화면에서 확인 |
| MEDIUM | Writing | public/vendor-broadcast.js:20 | 모든 수거 상태에 “파르게 수거” | “수거 상태” 및 두 운송사 도착지 | 도도시도 사용할 수 있는 흐름과 용어 일치 |

수정된 경로에서 잔여 HIGH 없음. 판정: Approve (위에 명시한 범위). 실제 모바일 기기·스크린리더·200% 확대·운송 데이터 로딩/오류 상태는 이번 시각 검증에서 별도로 확인하지 않았다. 운송 일정은 기존대로 참고값이며 실제 도착 보장은 운송사 확인이 필요하다.
