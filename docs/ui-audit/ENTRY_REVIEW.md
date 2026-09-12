# 운영자 출품 검토 — 로컬 화면 검증

2026-09-12. 범위는 `vendor-entry-review.html`의 로그인 → 경매/업체 선택 → 개체·부모 확인 → 수정 요청/편성과, 운영 화면에서 현재 경매를 유지해 이 페이지로 이동하는 경로다. 순수 HTML/CSS/JS, 기존 `CreoPlatform` 운영자 세션, 공통 사진 뷰어를 사용한다. AGENTS.md, CHECKOUT_DESIGN.md, LIVE_RELIABILITY_CHECKLIST.md와 better-interface의 여섯 영역을 적용했다. 전체 사이트나 운영 배포에 대한 판정이 아니다.

| 영역 | 확인한 증거 | 결과 |
| --- | --- | --- |
| 접근성 | 로그인/폼 label, 브라우저 접근성 트리의 이름·역할, 키보드/포커스, native dialog와 사진 창의 Escape·바깥 닫기 | 검사 범위 내 미해결 없음 |
| 배치 | 목록/상태/업체 필터, 사진 없는 개체, 사진/부모/편성 창, 320/390/800px, 200% CSS 확대 | 검사 범위 내 미해결 없음 |
| 문구 | 검토 대기/수정 요청/편성 완료, 접수 상태, 오류 복구, 수정 요청 결과 | 업체에 알림을 발송했다는 문구 없이 출품 화면 기록으로 안내 |
| 타이포그래피 | 16px 입력, 긴 업체/개체명, 제목과 상세 정보 위계, 단어 줄바꿈 | 모바일 입력 크기·한글 중간 줄바꿈 수정 |
| 색 | 렌더링에 사용되는 단색 토큰, 활성 상태의 밑줄·문자·aria 상태 | 본문/보조문구/주요 버튼 대비 통과 |
| UI 마감 | 고정 하단 행동, 처리 중 비활성, 폼 값 보존, 사진 재시도와 선택한 사진 열기 | 검사 범위 내 미해결 없음 |

아래 발견 항목은 수정 후 재검증했다.

| 중요도 | 영역 | 위치 | 수정 전 | 수정 후 | 이유 |
| --- | --- | --- | --- | --- | --- |
| HIGH | 정확성 | `vendor-entries.js:149` | 새 편성 item에서 업체 팀 누락 | 업체 팀 기본값, 운영자의 명시적 팀 변경, 해당 경매 팀 검증 | 후속 집계/송출의 팀 식별 보존 |
| MEDIUM | UI | `public/checkout-item-view.js:76`, `public/vendor-entry-review.js:72` | 부모 사진을 눌러도 개체 사진이 먼저 열림 | 누른 URL과 사진 그룹으로 첫 사진 선택 | 행동과 표시 대상 일치 |
| MEDIUM | 타이포그래피 | `public/vendor-entry-review.css:4` | 업체 선택 입력 15px | 16px | 모바일 입력 시 자동 확대 요인 제거 |
| LOW | 타이포그래피 | `public/vendor-entry-review.css:8` | 320px에서 릴리화이트가 글자 중간에서 나뉨 | keep-all, 긴 단일 문자열만 anywhere | 단어 단위로 읽을 수 있게 유지 |

검증 결과:

- `node scratch/checkout-redesign/entry-review-check.cjs`: 실제 API+임시 SQLite로 통과. 운영자 인증, 접수 열기/닫기, 접수 종료 후 검토, 작성 중 개체 제외, 중복 번호 거부, 다음 순서와 업체 팀 기본값, 응답 유실 후 같은 requestId 재시도, 제출 버전 충돌과 명시적 최신 내용 재조회, 수정안 우선 표시, DB 재시작, 이전 경매의 지연 응답 무시, 보관 경매의 읽기 전용 확인.
- 같은 검사에서 320/390/800px 및 200% CSS 확대, 접근 가능한 폼 크기, 키보드 포커스, 선택한 부모 사진을 먼저 열기, Escape·바깥 닫기 확인. 320/390px 캡처를 직접 확인했다. 실제 앱 브라우저에서도 목록과 검토 창 접근성 트리를 확인했다.
- `node scratch/checkout-redesign/buyer-navigation-check.cjs`: 구매자/업체 공통 뷰어의 인접 회귀 통과.
- `node scratch/checkout-redesign/entry-integration-check.cjs`: 실제 구매자·업체 HTML에서 부모 수정/DB 재시작과 낙찰 사실 불변 확인. 테스트는 가상 자료이며 파일 업로드 API를 검증한 것이 아니다.
- `node --test test/vendor-entries.test.js`: 8개. API 집중 2개. `npm run check`, `npm test`: 540개. PC `python -m unittest discover -p "test*.py"`: 189개. 모두 통과.
- 단색 대비 계산: 본문 `#202631 / #fff` 15.18:1, 보조 `#5e6978 / #fff` 5.57:1, 보조/회색 배경 5.15:1, 흰 버튼 글자/파랑 5.17:1, 입력 테두리/흰색 3.004:1. 비활성 상태는 별도 행동 불가 표시다.
- UTF-8 대체 문자 및 diff 공백 검사 통과. 전체 페이지 목록은 48개로 갱신했고, 과거 운영 확인 46건은 원래 확인일과 함께 보존했다. 새 검토 페이지는 미배포다.

Not verified: 실기기 iOS Safari, NVDA/VoiceOver 실사용, RTL, 다중 서버의 분산 동시 쓰기, 실제 파일 업로드/Storage, 운영 배포. 이 항목을 통과한 것으로 간주하지 않는다. 주 목표에 남아 있는 업체 작성 UI API 연결과 과거 기록/장기 인증 작업은 별도 진행한다.

Approve — 위에 명시한 로컬 운영자 화면·동작 검사 범위. 전체 목표 완료 또는 배포 승인 판정이 아니다.
