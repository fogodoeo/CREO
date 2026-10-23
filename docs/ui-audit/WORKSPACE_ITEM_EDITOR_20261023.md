# 개체 수정창과 저장 복구 — 2026-10-23

## 범위와 위험

- 위험도: release. 관리자 개체 저장에 선택적 재시도 식별자와 원자적 영수증을 추가했다. 기존 데스크톱·시트 API 요청 방식은 유지한다.
- 개체명·순서·업체·분류·시작가·비고를 먼저 표시하고 출품 설정·사진, 낙찰 정보는 펼치기로 분리한다.
- 선택 회차의 방송일, 취소·진행·기존 상태 및 무게·성별·생일·부모 사진 메타데이터를 유지한다.
- 저장 중 입력·닫기·메뉴 이동을 막고 실패한 입력을 보존한다. 오류 입력 또는 지속 메시지에 초점을 둔다.
- 저장 완료 후 목록 조회 실패는 읽기 재시도로 안내한다. 닫기 및 목록 갱신 후 초점을 복원한다.

## 저장 불변 조건

- 생성 ID와 요청 ID를 재사용하고 개체 및 재시도 영수증을 같은 SQLite 트랜잭션에 저장한다.
- 응답 유실 후 입력이 바뀌면 기존 요청 결과를 먼저 확인한 뒤 해당 버전으로 새 변경을 저장한다.
- 오래된 버전·회차·보관 개체는 새 쓰기를 거절한다. 완료된 요청 재생은 최신 경매 결과를 덮어쓰거나 개체를 부활시키지 않는다.
- 영수증 없이 같은 생성 ID를 다시 쓰면 충돌로 처리한다. 채널별 식별자는 분리한다.

## 검증 결과

- `node --test test/workspace-item-save.test.js test/workspace-item-draft.test.js test/workspace-item-editor-ui.test.js test/workspace-item-feedback.test.js test/workspace-item-list.test.js test/item-sheet-web.test.js test/workspace-vendor-form.test.js test/operator-shell.test.js test/platform-pages.test.js`: **82 통과**.
- `npm run check`: 통과. 변경 HTML 인라인·신규 JS/CJS 구문, 엄격한 UTF-8/U+FFFD 및 `git diff --check`: 통과.
- `npm test -- --test-concurrency=4`: 최종 **1,747 통과 / 0 실패**.
- 데스크톱 `python -m unittest discover -p "test*.py"`: **279 통과**.
- 최초 전체 검사의 구형 폼 구조 참조 2건을 새 편집 모델과 실제 초점 함수로 갱신했다. 이후 1회 임시 포트가 fetch의 `bad port` 제한에 걸렸으나 gateway 5건 단독 및 최종 전체 검사는 통과했다. 운영 포트 정책은 변경하지 않았다.
- 중복 입력, 동시 요청, 버전 충돌, 원자적 롤백, API 재시작, SQLite 종료·재연결, 보관 경계, 채널 분리, 배송·알림 자료 보존을 격리 데이터로 검증했다.

## 실제 화면

- 로컬 4416, 가상 업체/개체, 임시 SQLite만 사용. 운영 데이터 변경·실제 알림 없음.
- 데스크톱: 수정/추가, 취소 후 계속 작성, 저장 전 503, 저장 후 응답 유실, 입력 변경 후 재시도, 목록 조회만 503, 목록 재조회 완료까지 확인했다.
- 응답 유실 뒤 변경한 입력으로 재시도해도 같은 ID의 비고만 바뀌며 중복 개체가 생기지 않음을 조회했다.
- 15초 지연 중 상단 새로고침과 10/26 회차 변경은 차단되고 10/21 선택이 유지됐다.
- 실제 화면에서 발견한 저장/재조회 후 초점 유실을 수정하고 회귀 테스트를 추가했다. 최종 재조회 후 `item-list-query` 초점을 확인했다.
- 320px: 한 열 입력, 고정 저장/취소, 오류 초점, Enter 재시도 확인. 내부 문서 `clientWidth=scrollWidth=305`; 오류 하단 373.17, 저장 상단 404로 겹치지 않는다.
- 증거 폴더 `../admin-home-review-20261022/`: `item-editor-desktop.png`, `item-editor-320.png`, `item-editor-error-320.png`, `item-editor-focused.log`, `item-editor-check.log`, `item-editor-server-full-final.log`, `item-editor-desktop-full.log`.

## 배포 전과 남은 범위

- 2026-10-23T05:44:44Z: health/durable 정상, outbox 0, mirrorError 없음, 활성 회차 10/21. 네 전국크레자랑 채널에 진행 중 개체 없음.
- `item-editor-release-before.json`에 개체·배송·주관사 정산·송출 자료 해시를 보관했다. 배포 후 비교는 별도 기록한다.
- 사진 URL을 직접 업로드로 바꾸는 UX, 전체 키보드·200% 확대·화면 낭독, 다른 역할의 금융/인증/영상 통합 검증은 남아 있다. 전체 UX 목표의 일부다.
