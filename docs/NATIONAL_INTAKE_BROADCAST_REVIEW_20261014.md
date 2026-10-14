# 전국크레자랑 출품 확인·P1/P3 검수 (2026-10-14)

## 범위와 근거

대상은 개체관리의 업체 제출 내역, 방송일별 출품 검토, national-stage의 P1 진행자 자막과 P3 낙찰 집계다. 기존 HTML/JavaScript/CSS와 승인 API를 사용했다. 입찰 처리, 정산 계산, 업체 제출 상태는 변경하지 않았다. `AGENTS.md`와 데스크톱 저장소의 `docs/LIVE_RELIABILITY_CHECKLIST.md`를 적용했다. 운영 채널 전환과 웹 배포가 포함되어 Release 위험도로 검증했다.

운영 조회 당시 오늘(10/14) 제출 완료는 베누스게코 4마리, 더블디게코 4마리였으며 스텔라게코는 2마리 작성 중이었다. 10/19 제출분은 별도로 8마리였다. 승인된 경매 개체가 0마리라 기존 개체 표만으로는 제출 상황을 알 수 없었다. 운영 채널은 크레용 1001에서 전국크레자랑으로 전환했으며 대기 상태를 유지했다. 실제 출품 승인·낙찰·문자 발송 테스트는 하지 않았다.

P1의 둥근 캡슐과 겹친 색 띠는 [전국노래자랑 방송 자막 사진(스포츠서울, 2025-08-17)](https://www.sportsseoul.com/news/read/1538702)을 참고해 자체 CSS로 구성했다. 기존 베이지·청색·금색 팔레트를 사용했다. 방송사 로고나 원본 그래픽을 사용한 것은 아니다.

| 영역 | 확인 근거 | 결과 |
| --- | --- | --- |
| Accessibility | 입력 이름, 네이티브 날짜 선택, 포커스 링, 상태 텍스트, 작성 중 상세, 320px iframe의 실제 렌더링 | 범위 내 발견 사항 수정 |
| Layout | 제출/편성 구분, 날짜 변경과 선택 초기화, 320px 가로 넘침, 1920×1080 송출 캔버스 | 범위 내 발견 사항 수정 |
| Writing | 검토 대기·작성 중·편성 완료, 날짜 표시, 실패 후 새로고침, 한국어 진행 역할 | 수정 완료 |
| Typography | 공유 CSS와 P1 글자 크기 충돌, 긴 진행자·업체명, 집계 금액 | 수정 완료 |
| Colors | 실제 P3 제목/페이지 표시, 청색/아이보리와 집계 색쌍 대비 테스트 | 수정 완료 |
| UI | 이름판 끝 장식, 집계 순위 구분, 고정 캔버스 여백, 새 애니메이션 없음 | 확인 완료 |

공통 관리자 전체 기능, 모바일 실제 기기, OBS 프로그램 내 합성, 스크린리더 음성 출력은 이 검수의 범위 밖이다. 송출 레이아웃은 기본 배치로 확인했으며 운영자가 임의로 극단적인 크기로 조절한 모든 조합은 검증하지 않았다.

## 발견과 수정

| 심각도 | 영역 | 위치 | 이전 | 수정 | 이유 |
| --- | --- | --- | --- | --- | --- |
| HIGH | Layout | `public/channel-workspace.html:21`, `public/workspace-entry-intake.js:1` | 승인 개체만 표시해 제출물이 없는 것으로 보임 | 제출 현황을 같은 화면에 표시하고 날짜·업체·상태가 지정된 검토 링크 연결 | 운영자가 제출 누락과 승인 대기를 구분해야 함 |
| HIGH | Layout | `public/vendor-entry-review.js:14` | 여러 방송일이 동일 목록과 선택 범위에 표시 | 방송일 필터와 날짜 변경 시 선택 초기화, 날짜가 다른 편성의 교차 배치 차단 | 다른 회차를 함께 승인하거나 이동하는 실수 예방 |
| HIGH | Accessibility | `public/channel-workspace.html:41` | 관리자 비밀번호 입력에 접근 가능한 이름이 없음 | `aria-label` 추가 | 입력 목적 식별 |
| HIGH | Colors | `public/broadcast-national.css:41` | 공통 강제 색상이 P3 페이지 표시에 적용되어 밝은 배경에서 흐림 | 어두운 글자색으로 명시적 재정의 | 페이지 구분 가독성 |
| HIGH | Layout | `public/workspace-entry-intake.css:5` | 320px 화면에서 날짜·새로고침이 14px 넘침 | 좁은 폭에서 두 줄로 배치 | 새로고침 버튼이 잘리지 않아야 함 |
| MEDIUM | Typography | `public/broadcast-national.css:17` | 공유 CSS가 P1 이름과 역할을 모두 60px로 덮어씀 | 역할/이름 위계와 컨테이너에 맞는 글자 크기, 명시적 색상·곡률 | 이름판의 크기와 정보 위계 유지 |
| MEDIUM | Layout | `public/vendor-entry-review.css:18` | 320px에서 네 상태 필터의 단어가 중간에서 줄바꿈 | 2열 필터, 44px 높이 | 짧은 라벨을 한 줄로 읽고 누를 수 있어야 함 |
| MEDIUM | Writing | `public/channel-workspace.html:33` | 등록 개체 0이 미제출로 오해될 수 있음 | 수치 이름을 경매 편성으로 변경 | 제출물과 실제 경매 목록을 구분 |

## 검증

- 서버: `node --test test/entry-intake.test.js test/entry-batch.test.js test/broadcast-themes.test.js test/broadcast-summary.test.js` — 31/31 통과.
- 추가 집중 검사: `node --test test/national-broadcast-panels.test.js test/entry-intake.test.js` — 10/10 통과.
- 서버 전체: `node --test` (`npm test`와 동일 실행) — 1,112/1,112 통과.
- 서버 구문: `npm run check` — precheck/check/postcheck 통과.
- 데스크톱: `python -m unittest discover -p "test*.py"` — 첫 실행 203개 중 로컬 라벨 프린터 HTTP 테스트 1개가 WinError 10053으로 실패. 해당 테스트 단독 재실행 통과 후 전체 재실행 **203/203 통과**. 코드 변경 없이 재실행했으므로 일시적 연결 실패로 기록한다.
- 수정 파일 12개 strict UTF-8 검사, U+FFFD 검사 및 HTML 내 스크립트 3개 구문 검사 통과. `git diff --check` 통과.
- 결정적 회귀: 한국 시간 자정, 명시적 전체 방송 링크, 날짜별 집계, 채널/탭 전환 중 늦은 응답 폐기, 실패 재시도, HTML 이스케이프, 날짜 변경 시 선택 해제, 해당 날짜만 일괄 승인 요청, 작성 중 개체의 승인 차단.
- 기존 승인 API 회귀: 중복 요청, 동시 승인, 재시작, 저장 실패 롤백, 오래된 버전 거절, 채널 경계 — 기존 `entry-batch.test.js`로 확인.
- 실제 화면: 로컬의 격리된 가상 데이터만 사용. 개체관리 → 날짜 지정 검토 → 날짜 변경 → 선택 0 확인 → 작성 중 상세(승인 버튼 없음). 320px iframe에서 문서 폭과 scrollWidth 모두 305px(스크롤바 제외)로 가로 넘침 없음.
- 송출: 1920×1080 iframe의 P1 기본/긴 이름과 P3 빈 집계/5행/다음 페이지, 긴 업체명·천만 원 표시를 확인. 공개 송출에 가상 낙찰을 넣지 않았다.
- 실제 화면 캡처는 상위 작업 폴더 `scratch/national-release-20261014/p1-proof.png`, `p3-proof.png`, `mobile-intake-proof.png`에 보관했다.

## 판정

**Approve — 위에 명시한 화면과 상태에 한정한다.** 실제 업체의 제출물은 운영자 검토 후 승인해야 경매 편성에 나타난다. 운영 웹의 정적 파일 해시·health·현재 채널은 배포 뒤 읽기 전용으로 별도 확인한다. 이미 켜 둔 OBS 브라우저 소스는 새 CSS를 받기 위해 새로고침이 필요하다.
