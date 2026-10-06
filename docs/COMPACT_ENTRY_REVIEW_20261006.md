# 전국크레자랑 일괄 입력 화면 정리

## 범위와 검토

업체 방송 달력에서 여는 4~5마리 일괄 등록 화면만 검토했다. 기존 HTML/JavaScript/CSS와 Pretendard, 색상 변수를 사용했다. 저장 API, 예약 수량 정책, 운영자 승인과 일반 경매는 변경하지 않았다. 프로젝트 `AGENTS.md`와 `docs/LIVE_RELIABILITY_CHECKLIST.md`를 적용했다. 배포가 포함되어 Release 등급으로 검증했다.

| 영역 | 확인한 증거 | 결과 |
| --- | --- | --- |
| Accessibility | 입력 이름·네이티브 details, 키보드 Tab 이동, 3px 포커스 링, 오류 표시, 320px 화면 | 입력 대비·잘림 수정. 실제 스크린리더는 미검증 |
| Layout | 모바일 320/375/390px, 데스크톱 1280px, 초기·작성·제출·수정·사진 펼침 | 반복 카드 대신 열을 맞춘 입력 행, 선택 정보 접기 적용 |
| Writing | 반복 제목·미등록 문구, 열 제목, 다섯 번째 선택 표시, 추가 정보 표시 | 불필요한 반복 삭제. 필요한 상태·동작 명칭 유지 |
| Typography | 입력값과 날짜, 소수 체중, 미구분 선택값, computed font size | 입력 16px 유지, 날짜·소수·성별 잘림 해소 |
| Colors | 실제 computed RGB/배경 대비 계산 | 입력 테두리 3.08:1, 보조 글자 5.26:1, 파란 글자/버튼 5.08:1 |
| UI | 펼침/접힘, 부모 사진 추가·삭제·복구, 저장·제출·수정 상태 | 기본 동작 유지. 새 애니메이션 없음 |

## 수정한 사항

| 심각도 | 영역 | 위치 | 이전 | 이후 | 이유 |
| --- | --- | --- | --- | --- | --- |
| HIGH | Typography / Accessibility | `public/vendor-broadcast.css:53` | 촘촘한 행에서 네이티브 날짜·소수·미구분 값 일부 잘림 | 숫자 스피너 공간 제거, 날짜 아이콘 크기 정리, 374px 이하에서 번호만 별도 줄 | 주요 입력값을 읽고 수정할 수 있어야 함 |
| HIGH | Colors | `public/vendor-broadcast.css:53` | 입력 테두리 `#c3cbd6` / 흰 배경 1.64:1 | `#8994a3` / 흰 배경 3.08:1 | 입력 영역 경계를 식별할 수 있도록 비텍스트 대비 확보 |
| MEDIUM | Layout | `public/vendor-broadcast.css:45`, `public/vendor-broadcast.js:113` | 모바일에서 열 제목을 숨기고 개체별로 모든 필드를 세로 나열 | 성별·체중·출생일이 한 행에 정렬되고 사진·추가 정보는 네이티브 details로 분리 | 개체 간 비교와 반복 입력 비용 감소 |

## 검증

- `node --test --test-isolation=none test/national-broadcast.test.js test/broadcast-entry-range.test.js test/broadcast-inbound-ui.test.js`: 27개 통과.
- `npm.cmd run check`: 통과.
- `NODE_PATH=<bundled dependencies> npm.cmd test`: 1,006개 통과.
- 데스크톱 `python -m unittest discover -p 'test*.py'`: 203개 통과.
- `git diff --check`, 수정한 HTML/JS/CSS의 strict UTF-8 / U+FFFD 검사 통과.
- 격리 미리보기에서 4개체 입력, 닫기·재접속 후 값 유지, 추가 정보 펼침·접힘, 4마리 제출 완료, 개별 수정 후 일괄 재제출 확인.
- 부모 사진 추가·X 삭제·되돌리기 UI 확인. 격리 미리보기에는 서버 사진 저장소가 없어 사진 포함 제출 시 안내가 나타났고 작성 내용은 보존되었다. 사진을 제외하고 재시도해 정상 제출했다. 운영 사진 업로드를 테스트로 실행하지 않았다. 사진 저장·연결·실패 원자성은 기존 서버 테스트가 통과했다.
- 브라우저 DOM 치수 검사를 320/375/390px에서 실행: 5개 행의 성별·체중·출생일 높이 정렬, 가로 넘침 없음, 성별 칸 74px 이상·날짜 칸 126px 이상을 확인했다. 결과는 작업공간 `outputs/compact-entry-20261006/layout-checks.json`에 기록했다.
- 390px 입력 상태 스크린샷은 `outputs/compact-entry-20261006/mobile-grid.jpg`. 데스크톱 화면, 320px 전체 날짜·소수 표시, 375px 제출 후 수정 화면도 실제 렌더링으로 확인했다.

실물 휴대폰의 가상 키보드, 실제 스크린리더, 200% 브라우저 확대는 미검증이다. 한국어 서비스이며 이번 범위에서는 RTL을 검토하지 않았다. 기본 입력 칸은 44px, 밀집 행의 보조 펼침·수정은 32px 높이로 겹침 없이 유지했다.

## 판정

Approve — 검토 범위에 남은 HIGH 사항 없음. 운영 데이터 변경 없이 공개 정적 파일 및 상태 응답으로 배포를 확인한다.
