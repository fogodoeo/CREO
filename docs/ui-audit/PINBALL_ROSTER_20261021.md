# 핀볼 참가자 전체 명단 표시

## 범위

위험도 **Medium**. national 테마의 추첨 준비 명단만 수정한다. 기존 24명 단위 페이지와 6초 자동 넘김을 삭제하고 전체 명단을 표시한다. 실제 이름 너비, 명단 영역 크기와 인원수에 맞춰 열 수와 글자 크기를 계산한다. 물리 엔진, 추첨 결과, 서버 명령, 운영 데이터는 변경하지 않는다. `AGENTS.md`, `docs/LIVE_RELIABILITY_CHECKLIST.md`, better-interface의 여섯 영역을 적용했다.

## 화면 검토

| 영역 | 확인 | 결과 |
| --- | --- | --- |
| 접근성 | 실제 320px 화면에서 End 키와 스크롤 초점 | 마지막 120번까지 접근 가능, 가로 넘침 없음, 기존 브라우저 초점 표시 유지 |
| 배치 | 1920×1080 송출, 가상 48명 및 120명 | 전원 화면 안에 표시, 세로 스크롤 없음, 왼쪽 채팅 공간 유지 |
| 문구 | 명단 제목과 총인원 | 기존 표현 유지, 불필요한 페이지 번호와 넘김 조작 삭제 |
| 글자 | 실제 글꼴 너비 측정, 반응형 그리드 | 48명 30px·4열, 120명 24px·7열, 전화번호 뒷자리 숨김 유지 |
| 색상 | 실제 이름 `rgb(243,242,238)` / 카드 `rgb(22,25,30)` | 대비 15.73:1, 기존 색상 유지 |
| UI | 준비, 반복 갱신, 시작·완료·오류·초기화 | 자동 넘김 없음, 추첨 진행 및 결과를 명단이 덮지 않음 |

| 심각도 | 위치 | 이전 | 수정 | 이유 |
| --- | --- | --- | --- | --- |
| MEDIUM | `roulette-app/src/participantRoster.js:4` | 48명이 24명씩 2페이지로 나뉨 | 전체 identity를 한 목록에 표시 | 모든 참가자를 동시에 보여 달라는 운영 요구 |
| MEDIUM | `roulette-app/src/app.ts:203`, `roulette-app/assets/national.scss:87` | 고정 3열과 큰 행 여백 | 화면 및 이름 너비에 맞춘 열·글자 크기 | 전체 명단이 송출 영역 안에 들어오도록 조정 |

## 검증

- 실제 수정 전 브라우저에서 48명을 입력해 DOM 24명, 페이지 표시 `1 / 2` 재현.
- `node --test test/pinball-roster.test.js test/pinball-national-stage.test.js test/pinball-import-display.test.js`: **23/23 통과**.
- `$pinballTestFiles = rg --files test -g 'pinball-*.test.js'; node --test $pinballTestFiles`: **52/52 통과**. 명단 24/25/48/49/120/500명 경계, 동명이인 구분, 중복 identity, 반복 갱신, 회차 교체, 시작/완료/오류, 개인정보 표시, 원격 조작 및 결과 복원 포함.
- `npm.cmd run check:roulette`, `npm.cmd run build:roulette`: 통과.
- 수정한 원본과 빌드 텍스트 11개 strict UTF-8 및 U+FFFD 검사 통과. `git diff --check` 통과.
- 가상 데이터만 사용하는 `tools/pinball-preview.cjs`에서 관리자 → 명단 준비 → 송출 확인. 48명/120명 모두 모든 행의 실제 경계가 카드 안에 있고 스크롤 높이와 표시 높이가 같음.
- 320px에서 120명은 읽을 수 있는 최소 글자 크기를 유지하며 동일 목록 안에서 스크롤한다. 페이지 분할은 없다. 500명은 목록 누락 여부를 자동 검사했으며 실제 화면 동시 가독성을 보증하지 않는다.
- 200% 확대, OS 화면 읽기 프로그램, PRISM 내부 렌더링은 이번 검사에서 미검증.

**Approve — 위 참가자 명단 범위.**

## 배포 전 검증

사용자가 웹 반영을 승인해 배포 위험도를 **Release**로 올렸다. 운영 커밋 `ec5d692`에서 별도 작업 폴더를 만들고 위 핀볼 원본·테스트·빌드만 적용해 전체 검사를 수행했다.

- 격리 배포본 `npm.cmd run check`: 통과.
- 격리 배포본 `node --test`: **1,466/1,466 통과**, 실패·취소·건너뜀 0.
- 데스크톱 `python -m unittest discover -p "test*.py"`: **270/270 통과**.
- 운영 GET 전용 스냅샷: `national-cre` complete/revision 38, `national-cre-20261021` prepared/revision 4. 전체 세션 해시를 저장했고 배포 후 동일성을 비교한다.
- 운영 검증 결과는 상위 `scratch/national-session-20261019/pinball-roster-*` 파일에 기록한다.
