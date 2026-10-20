# 전체 사이트 점검 · 2026-10-20

상태: 진행 중. 전체 목표를 유지하며 역할별 흐름을 순서대로 점검한다. 62개 HTML의 HTTP 응답 확인은 실사용 검증 완료를 뜻하지 않는다.

## 전체 범위와 남은 검증

| 흐름 | 현재 증거 | 다음 검증 |
| --- | --- | --- |
| 공통 진입·로그인 | 62개 정적 경로 응답, `/main`의 로그인 경계는 기존 배포 검사 | 로그인 실패·복귀·공통 메뉴·오래된 별칭 |
| 운영 홈·회차·출품 | 회차 격리, 보관 채널의 배송 메뉴, 잘못된 회차 복구, 320px/PC 홈 확인 | 실제 운영자 로그인 이후 진입, 출품 편집·빈/오류 상태 |
| 낙찰·배송·인쇄·정산 | 배송 편집·업체 선택·전체조회·관리자 로그인·총정산 회차명/엑셀·오류 복구 배포. 7개 운영 회차 보고서와 같은 회차 입금 관리 연결 확인 | 주관사 입금 관리 회차 표시·전체 조작·실제 기기 |
| 업체 로그인·출품·예약·정산 | 기존 개별 검사 기록과 이번 로그인 정리 회귀 | 현재 버전의 모바일 연결·오류·재접속 |
| 구매자 배송·결제·보관함 | 현재/이전 결제 회차 표시, 가상 상태 전이·복귀 배포. 보관함 회차 선택·재연결·계정 전환 실화면 확인·배포 | 변경 요청·문의·실제 기기 |
| 방송·핀볼·캡처·배너 | 경기→전라·충청 구성 복사, 실제 준비 화면 확인 | 조작/송출 동기화·재접속·도구 연결 |
| 기타 채널·설문·레거시 화면 | 페이지 목록과 응답 | 실제 연결 및 불필요한 중복 진입점 |

운영 자료를 backtest에 사용하지 않는다. 주문·결제·발송 상태와 실제 알림은 검증을 위해 변경하지 않는다.

## 저장소 순회 오류

위험도: release. 만료 로그인 정리와 사진 사용량 조회가 공유하는 읽기 순회를 수정한다. 경매 쓰기 경로와 데이터 형식은 변경하지 않는다.

- 운영 로그의 `Invalid inventory order`를 추적했다. 운영 저장소 키 101개를 읽기 전용으로 점검했을 때 JavaScript 순서와 다른 인접 쌍이 27개였다. 키·토큰·개인정보는 보고서에 기록하지 않는다.
- 원격 DB의 `ORDER BY key`와 `gt`는 같은 DB 정렬 규칙을 사용한다. JavaScript의 문자열 비교로 그 순서를 다시 거부하거나 SQLite 경계와 합치지 않는다. [PostgreSQL 정렬 규칙](https://www.postgresql.org/docs/18/collation.html), [PostgREST 정렬·필터](https://docs.postgrest.org/en/stable/references/api/tables_views.html).
- 접두어는 `_`를 이스케이프한 LIKE로 제한한다. 서명 검증, 중복/다른 범위 응답 거부, 제한량, 8초 시간 제한을 유지한다.
- SQLite와 원격 저장소는 각각의 커서로 순서대로 조회한다. 로컬 수정·삭제 표식을 우선하며 재시작 후에도 커서로 이어간다. 조회를 위해 캐시를 쓰거나 전체 원격 목록을 메모리에 적재하지 않는다.
- 로그인 정리는 한 번에 최대 25개를 검사/삭제한다. 만료 후 유예, 암호문 확인, 최신값 재확인, 중복 실행 억제를 유지한다. 사진 조회는 두 번의 전체 결과 해시를 비교하고 실패를 0건으로 표시하지 않는다.
- 수정 코드로 운영 로그인 기록 75개/3페이지의 서명과 중복 없는 진행을 읽기 전용으로 확인했다.

## 이번 화면 검토 범위

Vanilla HTML/JS/CSS. 기존 `CHECKOUT_DESIGN.md`의 흰 표면·회색 본문·파란 조작 색과 모바일 44px/16px 기준을 사용했다. `better-interface`와 여섯 도메인 스킬을 적용했다. 이번 묶음의 UI 범위는 배송 목록→편집→닫기이며 전체 배송 기능 승인으로 확대하지 않는다.

| 분야 | 확인한 증거 | 결과 |
| --- | --- | --- |
| Accessibility | 실제 접근성 트리, Enter/Space/Escape, 열기/닫기 초점 | 카드·합배송·입력 이름 수정 |
| Layout | 320×700 iframe, 1265px 실제 화면, 하단 스크롤 | 좁은 금액 행을 2열+합계 행으로 조정 |
| Writing | 수령지 미설정, 코드 오류 경고 | 다음 행동이 있는 문구로 수정 |
| Typography | 실제 금액 말줄임, 입력·금액 스타일 | 금액 전체 표시, 모바일 입력 16px |
| Colors | 실제 전화번호/태그/입력 안내/금액 레이블 스타일 | 흐린 보조 정보 수정. #71717A/white 4.83:1, #71717A/#FAFAFA 4.63:1 |
| UI | 선택·포커스·펼침·닫기, 모션 코드 | 버튼/초점/펼침 상태, 모션 감소 시 스크롤·전환 제거 |

| 심각도 | 분야 | 위치 | 수정 전 | 수정 후 | 이유 |
| --- | --- | --- | --- | --- | --- |
| HIGH | Accessibility | `public/shipping.html:3379` 낙찰 카드·합배송·거점 버튼 | 클릭 가능한 div | 기본 button, 펼침 상태, 닫기 및 초점 복귀 | 키보드 작업 경로 확보 |
| HIGH | Typography | `public/shipping.html:1625` `.editor-total-item strong` | 320px에서 200,00… | 줄바꿈·좁은 화면 2열·합계 전체 행 | 금액을 생략하지 않음 |
| HIGH | Colors | `public/shipping.html:990` `.winner-card-phone`, `.gecko-tag-dimmed`, `.input-text::placeholder` | 흐린 글자와 45% 불투명도 | 기존 보조 본문 색, 불투명도 제거 | 필요한 정보를 읽을 수 있게 함 |
| HIGH | Accessibility | `public/shipping.html:2282` 편집 입력 | 연결되지 않은 label | for/id 연결 | 입력 이름 제공 |
| MEDIUM | Writing | `public/shipping.html:3436` 목록·편집 실패 | 코드·스택 노출 | 연결 확인·재조회 안내 | 복구 방법 표시 |

추가로 낙찰자 이름·개체 표시·업체명·수령 안내가 카드에서 HTML로 해석되지 않도록 이스케이프했다.

## 검증

- 집중: 저장소·사진·구매자/업체 로그인 33개, 배송 조작 3개. 최종 배송 인접 검사 12개 통과.
- `npm run check`: 통과. `npm test`: 1,381개 통과. 이후 금액·색·모바일 입력 CSS와 카드 텍스트 이스케이프를 조정하고 인접 검사를 통과했다.
- PC `python -m unittest discover -p "test*.py"`: 270개 통과.
- 실제 브라우저: 카드 Enter→닫기 초점, 합배송 Space→펼침, Escape→카드 복귀, 기타 배송 입력 이름, 320px 금액 전체 표시·하단 저장/결제 버튼까지 스크롤 확인. 테스트 자료만 사용했고 저장·결제·알림 전송은 실행하지 않았다.
- 그림: 상위 저장소 `scratch/national-session-20261019/site-audit-shipping-320.png`.
- 미검증: 실제 휴대폰/Safari·스크린리더 음성·브라우저 200% 확대, 배송 검색 결과와 회사 선택 모달의 전체 키보드 흐름. 전체 사이트 검토는 계속 진행한다.
- `e4697f9a1f8be4ed5c144264cde7eaf8754e5887` 배포 완료. Render `dep-dbb7eenlk1mc738ntta0`가 05:03:31 KST에 Live가 됐다. 시작 및 이후 표시된 로그에서 `Invalid inventory order` 재발은 관찰하지 못했다. 장기 무오류를 보장하는 관찰은 아니다.
- 배포 후 GET 검사: 건강 상태 200, 송출 200, 정적 파일 12개 일치, 운영 홈 로그인 경계 유지. 전국크레자랑 72개 낙찰/70개 배송과 씨랩·크레용 각 회차의 식별자·낙찰합계 불변. 이번 회차 34개/34개 배송, 이전 회차 38개/36개 배송 격리 유지. 두 회차의 미결제 구매자 조회 200이며 결제 가능 상태 유지.
- 62개 HTML의 로컬 JS/CSS 참조 334개 모두 파일 존재. 동적 링크 및 실제 권한 흐름은 별도 점검 대상이다.
- 새 배송 탭의 목록→키보드 편집 경로에서 브라우저 오류 0개. 기존 iframe 검사 탭에서는 DOM 검사 도중 `MutationObserver` 오류가 1번 기록됐지만 새 직접 진입 탭에서는 재현되지 않았다.

## 회차 메뉴·보관 자료 접근·인쇄 목록

위험도: release. HTTP 입구와 공유 메뉴를 맞추고 인쇄 조회를 배송 조회에서 분리했다. 경매 활성화·납부·알림 쓰기는 변경하지 않는다.

- 재현: 운영 홈은 archived 배송 링크를 만들지만 서버는 거부했다. 준비 중인 draft 회차에는 아직 허용되지 않는 배송 메뉴가 나왔다.
- 수정: 공통 `operationalFeatureAvailable` 기준을 서버·운영 홈·상단 단계 메뉴에 적용했다. archived는 배송·정산에 계속 접근하고 방송 조작은 숨긴다. draft 전크자는 방송 준비를 유지한다. 기능 자체가 비활성화된 경우는 계속 제한한다. 브라우저의 오래된 주소에는 회차 선택으로 돌아가는 링크를 제공하며 JSON 오류 계약은 유지한다.
- 회차가 하나면 선택기를 숨긴다. PC 작업 카드는 실제 표시 개수만큼 열을 채우며 비어 있는 보조 도구 영역은 숨긴다. 기존 색·서체·44px 조작 기준을 유지하고 모션은 추가하지 않는다.
- 실제 화면에서 새 버그 재현: 가상 준비 개체가 1마리인데 인쇄의 ‘경매 리스트’가 0마리였다. 낙찰 전·유찰 개체도 포함하는 `loadPrintItems`를 추가했다. 회차 범위를 유지하며 배송 목록과 정산 합계는 낙찰 개체만 처리한다. 레거시 목록 동작과 지원하지 않는 보관 범위의 오류는 유지한다.

| 분야 | 이번 증거 | 결과 |
| --- | --- | --- |
| Accessibility | 기본 select/link, 숨김 메뉴의 접근성 트리 | 단일 회차 선택기와 숨김 링크 미노출 확인 |
| Layout | 1265px 준비 화면 3열, 보관 화면 2열, 320px 위/아래 스크롤 | 사용 가능한 카드로 공간을 채우며 하단 도구 접근 가능 |
| Writing | 준비 중·결제/배송 상태와 회차 선택 복구 문구 | 화면과 서버의 가능한 행동 일치 |
| Typography | 기존 글자·줄바꿈, 320px 회차명 | 잘림 없는 상태 확인 |
| Colors | 기존 운영 홈 색 토큰 유지 | 이번 변경으로 색상 대비 변경 없음 |
| UI | 메인→인쇄→경매 리스트, 보관→전체 배송 조회 | 회차 유지, 무관한 방송 메뉴 숨김 |

- 집중 검사: `node --test test/operation-channel.test.js test/print-shipping-summary.test.js test/operator-home.test.js test/operator-pipeline.test.js test/server-smoke.test.js test/checkout-round-continuity.test.js` 39개 통과. 동일 요청·동시 확인·재시작·저장 실패·과거/현재 회차 경계는 기존 continuity 검사로 확인했다. HTTP 검사는 임시 DB를 사용한다.
- `npm test`: 1,386개 통과. 첫 전체 실행의 실패 1개는 이전 `loadShippingItems` 호출 문자열을 고정한 검사였으며 인쇄 전용 조회 계약에 맞춰 갱신한 후 다시 통과했다. `npm run check` 통과. PC `python -m unittest discover -p "test*.py"`: 270개 통과.
- 엄격한 UTF-8 디코딩·U+FFFD 부재·`git diff --check` 확인. 캐시 키 변경은 이번에 수정한 의존 화면만 반영했다.
- 실제 브라우저: 준비 개체 1마리 경매 리스트, 준비 회차의 낙찰 합계 0, 보관 채널의 단일 회차 홈→전체 배송 조회, 보관 상단 배송/인쇄 메뉴, 320px 하단 도구 확인. 모두 로컬 가상 자료다. `site-audit-prepared-print.png`에 낙찰 전 인쇄 결과를 남겼다.
- `1491584d069dadf63fc985adca23439a68f47cc7` / Render `dep-dbb7luk9v7es73cheh40`는 05:19:31 KST Live. 교체 중 502를 한 번 관찰했으며, 완료 후 health·송출 200 및 정적 파일 19개 일치를 확인했다. 이번/이전 회차 자료·낙찰합계·배송 식별자 불변, 두 회차 미결제 조회 유지. 실제 보관 채널 3개의 배송 페이지 9개가 200, 방송 조작은 404 유지. 잘못된 회차의 복구 화면과 로그인 화면까지 복귀를 실제 확인했다. 운영 홈의 인증 후 화면은 보유한 API용 비밀키와 웹 로그인 암호가 달라 재확인하지 못했으며 로컬 가상 자료로 확인했다. 인증 설정은 변경하지 않았다.

## 사진 처리 패키지 보안 패치

위험도: release. 배포의 npm 감사에서 `sharp 0.35.4` 관련 high 경고 1개를 확인했다. [제작사 공지](https://github.com/lovell/sharp/security/advisories/GHSA-wq5f-xc86-pv6w)의 수정판 `0.35.5`로만 갱신했다. lockfile의 모든 플랫폼 패키지는 유지되고 sharp/libvips 관련 버전만 변경됐다. 로컬 네이티브 모듈은 sharp 0.35.5 / librsvg 2.63.2로 확인했다.

- 기존 업로드는 디코더 호출 전 JPG/PNG/WebP의 파일 표식을 확인하며 SVG를 거부한다. 형식 제한·16MP 제한·변환 시간 제한·동시 처리 제한·개인 저장소 권한은 유지한다.
- `node --test test/entry-photo-storage.test.js test/entry-photo-audit.test.js test/vendor-parent-photo-ui.test.js test/broadcast-parent-photos.test.js`: 24개 통과. 실제 JPEG 방향·메타데이터 제거, 잘못된/큰 입력 거부, 실패 후 슬롯 해제, 저장 재시도·소유권·부개체 사진 전환을 포함한다.
- 패치 후 `npm test` 1,386개, `npm run check`, PC `python -m unittest discover -p "test*.py"` 270개 통과. npm 설치 후 감사 결과 취약점 0개. 전체 보안을 보증하는 수치는 아니다.
- 로컬 실화면: 합성 4색 PNG를 실제 업로드 처리기로 WebP 본문/작은 이미지로 변환한 결과를 브라우저에서 확인했다. 실제 경매 사진·운영 레코드는 사용하지 않았다.
- `3de62658a5665748cd86d12dd8a368190e1bc2af` / Render `dep-dbb7oce7bikc73bt08mg`는 05:24:43 KST Live. 운영 npm 감사에서도 취약점 0개. GET 검증은 health·송출 200, 19개 정적 파일 일치, 현재 채널과 모든 조사 회차의 개체·배송 식별자 및 낙찰합계 불변, 이번/이전 미결제 조회 200이었다.
- 운영 Linux 콘솔에서 Node v22.23.3 / sharp 0.35.5 / librsvg 2.63.2를 확인하고 40×20 가상 PNG를 실제 처리기로 WebP 본문/작은 이미지로 변환했다. 두 결과 모두 40×20 WebP였으며 저장·경매 자료 접근·알림 없이 메모리에서만 실행했다. 로컬 Node 24/Windows 검증과 함께 운영 네이티브 모듈 실행도 확인했다.
- 경기편 구성을 이어받은 전라·충청 1P 송출 화면도 운영에서 재확인했다. 그림: 상위 저장소 `scratch/national-session-20261019/site-audit-jeolla-prepared-page1.png`. 미검증한 전체 역할별 흐름은 첫 표의 범위를 계속 유지한다.

## 결제 회차 오류 복구와 실제 화면 연결

위험도: release(배포). 구현은 조회 오류 화면의 링크만 추가한다. API 권한·납부·알림·방송 쓰기는 변경하지 않는다.

- 재현: 구매자·업체 링크에 없는 `round`가 붙으면 409와 ‘회차 목록을 다시 열어 주세요’만 나오고, 회차 선택기는 오류로 숨겨져 복귀할 수 없었다. ‘다시 시도’도 같은 주소를 반복했다.
- 수정: 해당 조회 실패에 ‘낙찰 내역 다시 열기’ 또는 ‘결제·정산 다시 열기’를 표시한다. 같은 URL의 `round` 필터만 제거하고 원래 short link/token, event, hash를 유지한다. 기본 회차 선택과 소유권 확인은 기존 서버가 수행한다. 401/403 등에는 복귀 링크가 나오지 않고 이전 href도 지운다. 단일 회차 선택기 숨김은 유지한다.
- UI: 기존 색·버튼·여백을 유지하고, 구매자 320px에서는 복귀 링크를 한 줄 전체 너비로 배치했다. 업체 오류 문구에 `role=alert`를 연결했다. 새 모션은 없다. 두 페이지의 실제 320px 화면에서 줄바꿈·버튼 표시를 확인했다.
- 로컬 가상 자료: 배송 파르게 선택 후 합계 333,000원, 업체 A 226,000원/B 107,000원. 중복 신고 및 동시 확인 뒤 A만 paid, B는 입금 대기이며, 이전 회차 1개체/100,000원과 입금 신고 상태는 그대로였다. 이미 열린 업체 화면도 자동 갱신했다. 실제 연락·운영 결제는 실행하지 않았다.
- 브라우저 자동화의 중첩 iframe 확인창이 멈춰 클릭/Enter 활성화 검증은 완료하지 못했다. 앱 자체 오류로 단정하지 않는다. 실제 DOM의 복귀 href를 읽어 직접 이동했을 때 구매자·업체의 본인 내역과 회차 선택이 복원되는 것은 확인했다. 신고/결제 상태 전이는 로컬 가상 API로 검사했다.
- 집중: 변경 전 결제·문의·변경 요청 묶음 73개 통과. 수정 후 `node --test test/checkout-round-picker.test.js test/checkout-round-continuity.test.js test/buyer-checkout-flow.test.js test/vendor-checkout-flow.test.js` 42개 통과(신규 회귀 3개). 이전/현재 분리·권한 유지·중복·동시 확인·응답 순서·재시작·저장 실패를 포함한다.
- 최종 `npm test`: 1,389개 통과. `npm run check` 통과. PC `python -m unittest discover -p "test*.py"`: 270개 통과. 브라우저의 실제 휴대폰/Safari·확인창 클릭 전체 흐름은 아직 남은 항목이다.
- `25ccda065adcb43201b131a682aacd74d8386ca4` / Render `dep-dbb81vm7bikc73btelu0`는 05:45:13 KST Live. 배포 후 GET 검사에서 health·송출 200, 정적 19개 파일 일치, 전체 비교 채널의 개체·배송 식별자 및 낙찰합계 불변이었다. 전국크레자랑 현재 34개/34개 배송, 이전 38개/36개 배송이 계속 분리되고 두 회차의 미결제 미리보기는 모두 200/readOnly=false였다. 운영 자료에 쓰기 요청을 보내지 않았다.
- 그림: 상위 저장소 `scratch/national-session-20261019/site-audit-checkout-recovery-320.png`. 실제 320px 구매자 오류·복귀 화면이다. 로컬 상태 전이 결과는 같은 디렉터리 `site-local-checkout-audit.json`, 운영 전후는 `site-round-recovery-before.json`/`site-round-recovery-after.json`에 남겼다.

## 보관함의 회차 분리

위험도: release. 공개 보관함 응답과 새 연결 기록의 권한 경계를 변경한다. 결제·배송 쓰기와 실제 발송은 변경하지 않는다.

- 운영 보관함 로그인 기능은 GET 200/available=true였다. 미러 DB에서 키 내용 없이 개수만 조회했을 때 account 10개/record 12개였다. 이 수치를 로컬 주 저장소의 완전한 실시간 재고라고 단정하지 않는다. 개인정보·보관 내용은 읽거나 수정하지 않았다.
- 가상 회귀 재현: 같은 사람이 첫 회차 연결→회차 보관→새 회차 연결을 하면 두 연결의 보관함 ID가 같았다. 기존 구현은 채널+전화 해시로만 묶고 회차별 `roundScope`를 저장하지 않았다.
- 새 연결은 회차 경계를 포함한 schema 2 grant로 저장한다. 원본 스냅샷·원래 소유권은 유지하고, 명시적으로 연결한 개체만 옛 묶음에서 해당 회차로 이동한다. 단일 원자적 쓰기이며 실패하면 원래 암호화 행까지 동일하다. 읽기만으로는 기존 기록을 재저장하지 않는다.
- 기존 합친 grant는 원래 링크 권한을 유지하고 확인 가능한 후속 회차에는 추가 권한 검사를 적용한다. 후속 회차의 교체·중지가 있으면 새 링크로 명시적 재연결이 필요하다. 원본이 없어 회차를 복원할 수 없는 옛 스냅샷은 추측해서 합치지 않고 개별 ‘보관 기록’으로 남긴다. 이 경우의 권한은 기존 grant 기준을 유지한다.
- 기록을 다시 연결할 때만 확인된 회차 정보를 스냅샷에 보충한다. 재판매로 같은 개체 ID를 재사용해도 옛 스냅샷을 새 회차로 분류하지 않는다. 사진·업체 문의는 원래 스냅샷 참조를 유지한다.
- UI는 보관함 카드에 회차명을 표시하고, 옛 합친 묶음 안에는 두 회차 이상일 때만 선택기를 표시한다. 선택한 회차의 개체만 표시하며 실패·늦은 응답·계정 초기화가 선택 상태를 덮어쓰지 않는다. 새 목록 API는 중지된 grant의 사진/개체명을 조회하지 않고, 동일 권한 검사를 기록마다 반복하지 않는다.
- 구버전 열린 페이지가 여러 회차 중 일부만 조용히 표시하지 않도록, 회차 표시를 지원하지 않는 조회에는 새로고침 안내를 반환한다. 새 UI는 `view=rounds`를 보낸다.
- 회차를 보관 처리하기 직전에 열었던 상세의 선택값으로 다시 조회하면 409가 되는 경계를 추가로 재현했다. 저장된 회차 식별값은 유지하고, 표시 이름은 확인된 보관 회차명을 사용하도록 수정했다. 보관 직전 선택값으로 복귀하는 통합 회귀를 포함한다.
- 집중 `node --test test/buyer-account.test.js test/buyer-library-rounds.test.js test/buyer-link-access.test.js`: 35개 통과. 새 회차 분리·중지·교체·명시적 재연결, 기존 합친 자료, 원자성 실패·중복·재시작·보관 직전 선택값, 응답 순서·계정 초기화, 모르는 회차의 재판매 격리, 500개 옛 기록의 권한 검사 재사용을 포함한다.
- 마지막 회차 식별값 보완 후 전체 `npm test` 1,397개, `npm run check`, PC `python -m unittest discover -p "test*.py"` 270개가 통과했다. 로그는 `site-library-round-tests.log`, `site-library-round-check.log`, 상위 `scratch/site-library-round-desktop.log`다.
- 로컬 가상 서버를 재시작하고 확인창에 막혔던 탭을 정리한 뒤 실제 클릭이 정상 동작했다. PC/320px에서 기존 합친 4개체의 현재 1개체·이전 3개체 선택을 확인했다. 가상 다른 계정으로 로그인하자 이미 열려 있던 모바일 탭도 이전 자료를 지우고 빈 보관함으로 바뀌었다.
- 같은 가상 구매자로 복귀해 현재 낙찰 링크 미리보기→연결을 실제 클릭했다. 목록이 1개체·3개체의 두 회차 카드로 분리되고, 각 상세에서 선택기가 숨겨지며 총 4개체가 유지됐다. 실제 회원 연결·결제·알림은 실행하지 않았다.
- 320px에서 ISO 날짜가 중간에 줄바꿈되는 문제를 확인하고 날짜 부분만 함께 줄바꿈되도록 조정했다. 모든 입력 문자열은 이스케이프한다. 최종 CSS로 실제 화면을 다시 확인했으며, 기존 색·44px 이상 버튼과 기본 select를 유지했다. 사진은 상위 `scratch/national-session-20261019/site-library-current-320.png`, `site-library-previous-320.png`, `site-library-reconnected-previous.png`다.
- 남은 환경 검증: 실제 회원 계정·실제 휴대폰/Safari. 브라우저 도구의 네이티브 확인창 제한은 이전 결제 신고 화면 검증의 잔여 항목이며, 보관함의 기본 HTML 연결 창과 회차 선택 검증은 완료했다.
- `8148c9ff3bf59098a1ff4e1d8f1c7814eaa61214` / Render `dep-dbb8gr4s728c73cfh71g`는 06:17:04 KST Live. 배포 후 health·송출 200, 정적 파일 22개 일치, 모든 비교 채널의 개체·배송 식별자 및 낙찰합계 불변이었다. 현재 34개체/34개 배송, 이전 38개체/36개 배송과 양쪽 미결제 조회 200/readOnly=false를 유지했다. 배포 전후 자료는 `site-library-round-before.json`/`site-library-round-after.json`이다.
- 실제 재연결 후 320px의 두 회차 목록은 `site-library-separated-rounds-320.png`에 남겼다. 새 직접 진입 보관함 탭의 오류·경고 로그는 0개였다.

## 배송 업체 선택 창

위험도: release(배포). 구현은 업체 선택 창의 DOM·초점·표시만 변경한다. 배송 저장·결제·알림 계약은 변경하지 않는다.

- 실제 PC 화면에서 업체변경→Tab을 누르자 열린 창 뒤의 ‘변경 요청’ 링크로 초점이 빠졌다. 기본 HTML dialog로 바꾸고 이름을 연결했다. 처음에는 업체 버튼에 초점이 오고, 창 내부에서 순환하며 Escape 취소 후 업체변경 버튼으로 돌아온다. 숨겨진 화면 상단 취소 영역을 눈에 보이는 44px 닫기 버튼으로 바꿨다.
- 업체명을 HTML 속성과 인라인 onclick 문자열에 직접 넣던 코드를 DOM 생성·textContent·클로저로 교체했다. 따옴표·꺾쇠·앤드가 들어간 가상 업체명도 원문 그대로 표시하고 선택되는 회귀를 추가했다. 선택 상태는 aria-pressed로 전달한다.
- 반복 열기·취소·브라우저 뒤로가기에서 모달과 모바일 이력을 중복 닫지 않도록 검사했다. 실제 PC에서 초점 순환·Escape 복귀, 320px에서 Tab→Space 업체 B 선택→Enter 확정→업체 B 목록과 111,000원 표시를 확인했다. 실제 경매 기록과 발송은 사용하지 않았다.
- 좁은 화면은 업체명을 읽기 쉽게 1열, 넓은 화면은 기존 2열을 유지한다. 기존 색과 모션을 유지하고 버튼을 44px 이상으로 맞췄다. 실제 320px 사진: `site-shipping-company-320.png`.
- 집중 `node --test test/shipping-interaction.test.js test/shipping-vendor-settings.test.js` 7개 통과. 배송 갱신 검사를 함께 실행한 중간 검사도 통과했다. 최종 `npm test` 1,399개, `npm run check`, PC `python -m unittest discover -p "test*.py"` 270개 통과. `git diff --check`와 변경 파일 3개의 엄격한 UTF-8·U+FFFD 부재도 확인했다. 로그는 `site-shipping-company-tests.log`, `site-shipping-company-check.log`, 상위 `scratch/site-shipping-company-desktop.log`다.
- 전체조회에서 현재 3개체의 가상 구매자만 보이고 ‘없는이름’ 검색은 빈 결과로 표시됐다. 전화번호 일부 `0003` 검색→현재 3개체 상세→다른 낙찰자 선택으로 복귀도 실제 확인했다. 다만 상세/복귀 후 초점은 문서로 빠졌고 검색 입력은 접근성 이름이 없었다. 관리자/안내 창도 별도 초점 검토가 필요하다. 다음 범위에서 회귀와 함께 보완한다.
- `73e4506c448bbb4b5b16c107c311e44210e48308` / Render `dep-dbb8khui0phs73euojj0`는 06:24:51 KST Live. 배포 후 health·송출 200, 정적 파일 22개 일치, 전체 비교 채널의 식별자·낙찰합계 불변, 현재/이전 회차의 미결제 조회 200/readOnly=false였다. `site-shipping-company-before.json`/`site-shipping-company-after.json`에 기록했다.

## 배송 전체조회 오류 복구·검색·금액 표시

위험도: release. UI 조회 상태와 금액 표시를 수정하고 기존 원 단위 변환 함수를 공개한다. 낙찰·배송·결제 저장과 알림 전송은 변경하지 않는다.

범위: Vanilla HTML/JS/CSS의 전체조회 진입→조회 실패/재시도→낙찰자·업체 검색→상세·목록 복귀, 변경내역/알림 탭의 표시. `AGENTS.md`, `LIVE_RELIABILITY_CHECKLIST.md`, `CHECKOUT_DESIGN.md`와 기존 흰 표면·회색 보조 본문·파란 조작 색을 따랐다. `better-interface`의 여섯 도메인과 `emil-design-eng`의 빈번한 전환에서 불필요한 모션을 줄이는 지침을 적용했다. 전체 사이트 범위를 축소하지 않으며 관리자/안내 창은 다음 점검 항목으로 유지한다.

| 분야 | 확인한 증거 | 결과 |
| --- | --- | --- |
| Accessibility | 실제 AX 이름, 오류 heading/재시도/검색/상세/모바일 뒤로가기 초점 | label, 동적 상태, 초점 복귀와 기본 버튼 경로 확인 |
| Layout | 320px 오류/목록/업체 결과, PC 전체 목록과 탭 | 제목·버튼·금액에 잘림 없이 표시 |
| Writing | 실패 후 성공 안내, 단위 없는 낙찰가, 빈 검색 결과 | 성공 시에만 안내, 원 단위 표기, 재검색/재시도 행동 명시 |
| Typography | 10px 요약과 13px 입력의 실제 계산 스타일, 작은 업체/배송 본문 | 보조 정보 12px 이상, 모바일 입력 16px, 제목의 한 글자 줄바꿈 제거 |
| Colors | 요약 글자/실제 배경의 계산 스타일과 대비 계산 | #7b8492/#fafbfd 3.65:1 → #6b7280/#fafbfd 4.67:1. 같은 새 본문/흰색 4.83:1 |
| UI | 탭·검색·상세·재시도와 기본 초점 표시 | 불필요한 smooth scroll과 toast 이동 제거, 조작 44px 기준 유지 |

| 심각도 | 분야 | 위치 | 수정 전 | 수정 후 | 이유 |
| --- | --- | --- | --- | --- | --- |
| HIGH | Writing | `public/shipping-status.html:482` | 실패 시 검색 DOM을 지우고 성공 toast 표시 | 별도 복구 화면, 최신 성공 응답만 표시·안내 | 오류를 해결할 행동 제공, 오래된/부분 자료를 성공처럼 표시하지 않음 |
| HIGH | Accessibility | `public/shipping-status.html:166`, `:175`, `:339`, `:397` | 이름 없는 입력, 상세/복귀 후 문서 초점 | 연결된 label, 상세 heading/검색창 초점 | 키보드·보조기술로 연속 작업 가능 |
| HIGH | Writing | `public/shipping-status.html:335` | 10만 원을 단위 없이 ‘낙찰가 10’으로 표시 | 기존 `itemWon`으로 ‘100,000원’ 표시 | 만원/원 혼동 방지, 명시적 0원 보존 |
| HIGH | Colors | `public/shipping-status.html:37` | 실제 요약 대비 3.65:1 | 기존 보조 본문 토큰으로 4.67:1 | 본문 최소 대비 확보 |
| MEDIUM | Typography | `public/shipping-status.html:51`, `:79` | 작은 입력·한 글자 제목 줄바꿈·작은 배송 정보 | 16px 입력, 단어 단위 제목, 본문/보조 크기 정리 | 좁은 화면에서 읽기·검색 용이 |

- 회귀 재현: 가상 요청이 실패한 뒤 `winner-search`가 사라져 다음 성공 응답도 렌더링할 수 없었다. 이제 DOM 구조를 유지하고 실패/로딩에는 기존 자료를 숨긴다. 오류 응답·렌더 실패를 성공으로 안내하지 않으며, 느린 이전 응답이 최신 결과를 덮어쓰지 않는다. 운영 기록은 쓰지 않는다.
- 실제 업체 화면에서 가상 A01·A02·B03의 낙찰가가 모두 ‘10’으로 보였다. `print-shipping-summary.js`의 기존 `itemWon`을 재사용해 원 단위 값을 표시한다. 명시적인 0원과 레거시 만원 입력을 별도 검사했다. 계산 로직은 기존 함수 그대로이고 export만 추가했다.
- 낙찰자 식별자를 인라인 onclick에 넣지 않고 data 속성과 이벤트 연결로 취급한다. 따옴표/꺾쇠 식별자의 선택 회귀도 통과했다.
- 집중 `node --test test/shipping-status-interaction.test.js test/print-shipping-summary.test.js test/shipping-interaction.test.js`: 25개 통과. 실패·재시도·응답 순서·부분 렌더 실패·초점·문자열·원 단위/0원/레거시 표시를 포함한다.
- 최종 `npm test` 1,404개, `npm run check`, PC `python -m unittest discover -p "test*.py"` 270개 통과. 로그: `site-shipping-status-tests.log`, `site-shipping-status-check.log`, 상위 `scratch/site-shipping-status-desktop.log`. 구현/검사 UTF-8과 `git diff --check` 확인.
- 실제 격리된 localhost 프록시에서 workspace GET만 503으로 바꿔 실패 화면을 확인했다. 오류를 해제한 뒤 ‘다시 불러오기’를 클릭하자 현재 3개체 목록·검색창 초점이 복구됐다. 상세 heading→다른 낙찰자→검색창 초점, 업체 B 검색→100,000원, PC 두 업체 목록과 빈 변경내역/알림 상태를 확인했다. 실제 낙찰·결제·발송은 수행하지 않았다.
- 그림: 상위 `scratch/national-session-20261019/site-shipping-status-error-320.png`, `site-shipping-status-recovered-320.png`, `site-shipping-status-company-desktop.png`. 후속 보완: 실제 휴대폰/Safari, 200% 확대, 스크린리더 음성은 Not verified. 현재 범위에서 재현한 HIGH 항목은 수정·검증됐다.

- `b03cc709b4b744d2106f82d90f2e3810dfb1168c` / Render `dep-dbb8r9jrjlhs73cjqbcg`는 06:39:12 KST Live. 배포 후 health·송출 200, 정적 23개 파일 일치, 전체 비교 채널의 개체·배송 식별자와 낙찰합계 불변이었다. 현재 34개/34개 배송, 이전 38개/36개 배송과 양쪽 미결제 조회 200/readOnly=false가 유지됐다. `site-shipping-status-before.json`/`site-shipping-status-after.json`에 기록했다.

판정: 배송 전체조회에서 확인한 범위는 Approve. 전체 사이트의 나머지 흐름은 첫 표대로 계속 검증하며 전체 사이트에 대한 Approve 판정은 아직 하지 않는다.

## 배송 관리자 로그인·미사용 안내 창 정리

위험도: release(배포). 로그인 창의 접근성·초점·중복 제출·화면 이력을 변경한다. 실제 비밀번호 검증·권한·낙찰·배송·결제 저장·알림 전송 API는 유지한다. 기존 Vanilla HTML/JS/CSS와 `CHECKOUT_DESIGN.md`의 색·16px 입력·44px 버튼 기준을 따른다. `better-interface` 여섯 도메인과 `emil-design-eng`를 적용했다.

| 분야 | 확인한 증거 | 결과 |
| --- | --- | --- |
| Accessibility | 실제 PC/320px AX, Tab, Escape, 취소 및 초점 복귀 | 기본 dialog, 이름·설명·오류 연결, 배경 초점 차단 |
| Layout | 320px 일반·필수·오류 상태, PC 필수 로그인 | 입력·로그인·취소/운영 홈 버튼 전체 표시 |
| Writing | 비밀번호 오류와 재시도, 로그인 중 상태 | 실패 후 다음 행동과 진행 중 상태 표시 |
| Typography | 320px 계산 스타일 | 설명·버튼 14px, 입력 16px, 오류 12px |
| Colors | 실제 계산 스타일 #71717a/white, #fff/#2563eb, #52525b/white | 기존 대비를 유지하며 불투명도 변경 없음 |
| UI | 중복 열기/제출, 취소·재시도·성공 후 업체 선택 | 44px 버튼, 모션 추가 없음, 성공 후 새 업체 창을 닫는 이력 경쟁 방지 |

| 심각도 | 분야 | 위치 | Before | After | Why |
| --- | --- | --- | --- | --- | --- |
| HIGH | Accessibility | `public/shipping.html:2169`, `:2382` | 로그인 창에서 Tab이 배경 운영 홈으로 빠지고 Escape·취소 경로가 없음 | 이름 있는 기본 dialog, 선택적 로그인 취소/초점 복귀, 필수 로그인은 운영 홈 링크 | 키보드로 작업을 끝내거나 안전하게 나갈 수 있음 |
| HIGH | Accessibility | `public/shipping.html:2434` | native dialog로 바꾸는 첫 구현에서 초기 필수 로그인에 Escape를 누르면 닫힘 | keydown 기본 동작 방지와 required 검사, 실제 재확인 | 초기 로그인에서 의도하지 않은 배경 복귀 방지 |
| MEDIUM | UI | `public/shipping.html:2443` | 로그인 중 추가 제출 가능, 성공 후 모바일 이력에 로그인 상태가 남음 | 요청 중복 억제, 성공 후 이력 정리→업체 선택 순서 | 중복 요청·늦은 화면 닫힘 방지 |
| MEDIUM | Typography | `public/shipping.html:2061` | 설명 11px·오류 10px·42px 버튼 | 설명/버튼 14px·오류 12px·44px 조작 | 좁은 화면에서 읽고 누르기 쉬움 |

- 저장소 참조 검색에서 `openMessagePreview`는 선언만 있었고 사용처가 없었다. 관련 CSS·숨김 마크업·모바일 이력 분기·전용 복사 함수를 제거했다. 실제 ‘배송 안내/안내 다시 보내기’는 `sendBuyerShippingLinkSms`에 연결되어 있으며 이 경로는 수정하지 않았다.
- 집중: `node --test test/shipping-admin-dialog.test.js test/shipping-interaction.test.js test/shipping-vendor-settings.test.js test/shipping-refresh.test.js` 18개 통과. 마지막 Escape 보완 후 앞의 3개 파일 12개를 재실행해 통과했다. 반복 열기·취소/Back 중복 닫힘·필수 접근 제한·중복 제출·실패 후 재시도·늦은 실패·성공 후 초기화 순서를 검사했다.
- 최종 `npm test` 1,409개, `npm run check`, PC `python -m unittest discover -p "test*.py"` 270개 통과. 로그: `site-shipping-admin-tests.log`, `site-shipping-admin-check.log`, 상위 `scratch/site-shipping-admin-desktop.log`.
- 실제 PC: Tab이 배경 링크로 빠지지 않고 로그인 조작 사이로 복귀, Escape 후 업체변경 버튼 초점 확인. 320px: 취소 후 업체변경 복귀, 필수 로그인 Escape 유지, 가상 오답 오류/입력 초점→정답 재시도→업체 선택 창 확인. 별도 localhost 프록시의 가상 인증만 사용했으며 실제 자격 증명·운영 기록·알림은 사용하지 않았다.
- 그림: 상위 `scratch/national-session-20261019/site-shipping-admin-320.png`, `site-shipping-admin-error-320.png`. 실제 휴대폰/Safari·200% 확대·스크린리더 음성·실제 관리자 인증은 Not verified. 전체 낙찰/정산 기능의 검증 완료로 확대하지 않는다.

- `a1133a8e5c3027d61a83e4169518913aa735cb15` / Render `dep-dbb91c8ae00c73feju50`는 06:52:08 KST Live. 운영 GET 검사에서 health·송출 200, 정적 23개 파일 일치, 비교 채널의 식별자·낙찰합계 불변이었다. 현재 34개/34개 배송, 이전 38개/36개 배송과 두 회차의 미결제 조회 200/readOnly=false를 유지했다. 자료: `site-shipping-admin-before.json`/`site-shipping-admin-after.json`.

판정: 이번 로그인 창 범위는 Approve. 전체 사이트 점검은 첫 표대로 계속한다.

## 총정산 회차 표시·엑셀·오류 복구

- 로컬 가상 `settlement-report.html?channel=national-cre`의 화면에 ‘채널 누적’, ‘입금 잔액은 업체별 누적 기준’이 나온다(`public/settlement-report.html:10`, `:17`). 현재 3개체의 수수료 60,000원·배송비 지원 0원·업체 미입금 93,000원이 표시됐다. 서버는 `OperationRounds.scopedWorkspace`로 조회한다(`platform-api.js:4129`). 회차 격리와 설명이 어긋나는 HIGH Writing 항목이다.
- 기존 `settlement-report.js:114`는 항상 `scope: 'channel'`을 반환했다. 이제 조회에 사용한 회차 식별값·보관 회차 제목·확인 가능한 방송일을 응답에 포함하고 화면과 엑셀 네 시트 및 파일명이 같은 이름을 사용한다. 원래 금액 계산과 기록은 변경하지 않는다. 여러 날짜를 가진 옛 회차는 날짜를 추측하지 않고 보관 제목으로 표시한다.
- 이전 회차가 활성 채널 안에 보관된 경우에도 현재 회원 명부를 조회하던 경로를 재현했다. 보관 회차의 빠진 번호는 현재 회원 정보로 보충하지 않고 확인 필요로 남긴다. 등록된 번호는 계속 표시되며 실제 원본 기록에 쓰지 않는다.
- 가상 503 오류를 주입해 새로고침하면 이전 금액이 남던 상태를 수정했다. 로딩/실패/회차 불일치에는 이전 표·제목·내보내기를 사용할 수 없으며 재시도 성공 때만 다시 표시한다. 새로고침은 중복 요청을 억제하면서 키보드 초점을 유지한다.

위험도: release. 조회 응답의 회차 메타데이터와 엑셀 표시를 변경한다. `AGENTS.md`, `LIVE_RELIABILITY_CHECKLIST.md`, 기존 총정산 색·Vanilla HTML/JS/CSS 구조를 따랐다. `better-interface`의 여섯 도메인과 `emil-design-eng`를 적용했다. 범위는 총정산 조회·탭·회차명·엑셀 생성·입금 관리로의 링크이며 입금 쓰기 화면 자체의 전체 승인은 아니다.

| 분야 | 확인한 증거 | 결과 |
| --- | --- | --- |
| Accessibility | PC/320px AX·새로고침 Enter·입금 내역 탭·링크 | 입력 이름/탭 선택 상태 유지, 오류 alert, 새로고침 초점 유지 |
| Layout | PC 현재 회차·320px 이전/준비 회차·오류/복구 | 제목과 합계 전체 표시, 표 스크롤 영역 유지 |
| Writing | 실제 ‘채널 누적’ 문구, 네 시트 A2/A3/문서 제목 | 선택한 회차명으로 통일, 중복 누적 설명 제거 |
| Typography | 실제 320px 회차명/금액/본문 | 기존 크기·서체·줄바꿈 유지, 값 생략 없음 |
| Colors | 기존 총정산 색 토큰과 실제 PC/모바일 렌더 | 색·대비 변경 없음, 새 의미를 색에만 맡기지 않음 |
| UI | 실제 모바일 입금 관리 링크, 재시도 조작 | 링크 44px, 불필요한 모션 없음 |

| 심각도 | 분야 | 위치 | Before | After | Why |
| --- | --- | --- | --- | --- | --- |
| HIGH | Writing | `public/settlement-report.html:10`, `public/settlement-workbook.js:33` | 회차별 금액에 ‘채널 누적’ 표기 | 조회 회차 이름을 화면·네 시트·파일명에 적용 | 다른 회차와 합산한 금액으로 오해하지 않음 |
| HIGH | Writing | `public/settlement-report-page.js:20` | 실패 후 이전 금액 잔류 | 표/내보내기 숨김·재시도 안내·채널/보관 ID 검증 | 오래된 결과를 현재 성공 결과로 취급하지 않음 |
| MEDIUM | UI | `public/settlement-report.css:3` | 모바일 입금 관리 링크 높이 축소 | 최소 44px | 작은 링크를 누르기 어려운 문제 보완 |

- 집중 `node --test test/settlement-report-page.test.js test/settlement-report.test.js test/operation-rounds.test.js`: 22개 통과. 현재/이전/빈 회차의 응답·입금 분리·조회 반복/동시성·재시작·회원 명부 격리·복구/부분 렌더 실패를 포함한다. 엑셀 생성 후 다시 읽어 네 시트 제목·금액·수식·앞자리 0·문자열 안전성도 확인했다.
- 실제 가상 자료: 현재 1개체/미입금 29,000원과 이전 3개체/미입금 55,000원, 각각 입금 1,000원/5,000원이 분리됐다. 이전 회차 총정산→입금 확인 관리 링크를 실제 눌렀을 때 archive 주소와 55,000원/확인 입금 5,000원이 유지됐다. 준비 회차는 0원과 빈 내역으로 표시됐다. 운영 자료·실제 발송·결제는 사용하지 않았다.
- ‘총정산 엑셀’ 클릭 후 앱의 저장 안내는 확인했지만 브라우저 도구가 다운로드 완료 이벤트를 받지 못했다. 실제 다운로드 파일 회수는 Not verified이며 앱 자체 실패라고 단정하지 않는다. 생성된 XLSX의 별도 roundtrip 검사는 통과했다.
- 1차 전체 `npm test` 1,415개·`npm run check` 및 PC `python -m unittest discover -p "test*.py"` 270개 통과. 원격 main에 홍보물 변경 3건이 추가되어 `ecebbe5`까지 fast-forward한 뒤 통합 코드의 `npm test` 1,415개와 `npm run check`를 다시 통과했다. 원격 홍보물 수정은 그대로 보존했다. 로그: `site-settlement-round-integrated-tests.log`, `site-settlement-round-integrated-check.log`, 상위 `scratch/site-settlement-round-desktop.log`.
- 그림: 상위 `scratch/national-session-20261019/site-settlement-current-desktop.png`, `site-settlement-archive-320.png`. 실제 휴대폰/Safari·200% 확대·스크린리더 음성은 Not verified.

- `e1f5ba3ca91b2dbf005b86f2222e3c5d045032a7` / Render `dep-dbbnei1srm7s738f21u0`는 23:16:28 KST Live. 운영 GET 검사에서 health·송출 200, 정적 27개 파일 일치, 7개 운영 회차의 총정산 scope/회차 ID/개체 집합 일치를 확인했다. 현재 전크자 34개/34개 배송, 이전 38개/36개 배송 및 양쪽 미결제 조회 200/readOnly=false를 유지했다. 모든 비교 채널의 개체·배송 식별자·낙찰합계는 배포 전과 같았다. 자료: `site-settlement-round-before.json`/`site-settlement-round-after.json`.

판정: 확인한 총정산 범위는 Approve. 주관사 입금 관리로의 연결은 맞지만, 해당 화면 제목에는 보관 회차명이 보이지 않으므로 다음 점검에서 표시와 조작 흐름을 함께 확인한다(`public/organizer-shipping.js:81`의 채널명 표시). 전체 사이트 목표는 진행 중이다.

## 업체 방송 신청: 첫 5개 권역으로 제한

사용자 요청에 따라 주관사 입금 관리 점검보다 먼저 신청 달력 범위를 수정했다. 기존 `national-broadcast.js`는 오늘부터 370일 뒤까지 월·수 순환 일정을 생성하여 2회차 이후도 표시했고, 2주 전이면 자동으로 신청 가능해졌다.

- 신규 신청은 2026-10-14 서울·인천, 10-19 경기, 10-21 전라·충청, 10-26 대구·경북, 10-28 부산·울산·경남으로 한정한다. 이후 날짜는 화면에 없는 직접 API 요청도 거부한다. 날짜 경과·재시작·중복/동시 요청으로 다음 순회가 열리지 않는다.
- 이미 존재하는 예약과 개체는 삭제하지 않는다. 범위 밖이라도 본인 예약/기존 출품 날짜는 계속 표시하고 저장·조회 경로를 유지한다. 다른 업체의 이후 예약은 해당 업체의 달력에 노출하지 않는다. 관리자에는 기존 예약 관리가 남는다.
- 달력의 이전/다음 달 버튼은 실제 기록이 있는 달로만 이동한다. 첫 순회만 있으면 10월 양쪽 이동 버튼을 비활성화하며, 기존 다른 달 기록이 있으면 접근할 수 있다. 새로고침으로 선택한 달이 없어졌을 때는 첫 순회 달로 복귀한다.

위험도: release. 서버 신청 자격/공개 응답·배포 변경이며 회차 정산·결제 계산은 수정하지 않는다. 기존 `better-interface` 여섯 도메인 기준으로 검토했다.

| 분야 | 확인한 증거 | 결과 |
| --- | --- | --- |
| Accessibility | 실제 PC/320px 이전·다음 달 disabled, 날짜 이름 | 가능한 조작 범위와 버튼 이름 일치 |
| Layout | 실제 PC 달력/신청 창, 320px 달력 | 첫 5개 날짜 유지, 모바일 달력 폭/scrollWidth 모두 273px |
| Writing | 이후 날짜 직접 신청 거부 사유 | 아직 신청을 받지 않는 방송임을 표시 |
| Typography | 320px 권역명 줄바꿈 | 기존 표기 유지, 서울·인천/전라·충청/대구·경북/부울경 표시 |
| Colors | 기존 방송/내 권역/등록 필요 표현 | 색 변경 없음, 날짜 접근 이름에도 권역·등록 필요 포함 |
| UI | 빈 달 이동 억제, 기존 기록 달 이동/새로고침 | 의미 없는 이동 제한, 기존 기록 접근 유지 |

| 심각도 | 분야 | 위치 | Before | After | Why |
| --- | --- | --- | --- | --- | --- |
| HIGH | UI | `national-broadcast.js` 날짜/신청 자격 | 370일간 순환 및 2주 전 자동 개방 | 첫 5개 권역만 신규 신청 가능 | 승인하지 않은 2회차 접수 방지 |
| MEDIUM | UI | `public/vendor-broadcast.js` 달 이동 | 이동할 날짜가 없어도 활성 버튼 표시 | 실제 기록 월을 기준으로 이동/비활성화 | 빈 달로 이동할 것 같은 혼란 방지 |

- 집중 `node --test test/national-broadcast.test.js test/vendor-broadcast-calendar.test.js test/broadcast-booking.test.js test/broadcast-booking-api.test.js test/vendor-entry-landing.test.js`: 50개 통과. 신규 6개 회귀 테스트는 첫 5개 권역 실제 신청/중복/재시작, 이후 순회 거부/쓰기 없음, 본인 기존 예약 보존/저장/타 업체 격리, 예약 없는 기존 출품 접근, 달 이동 경계/새로고침을 검사한다. 기존 저장 실패/원자성/일반 예약 경로도 통과했다.
- 최종 `npm test`: 1,421개 통과. `npm run check` 및 PC `python -m unittest discover -p "test*.py"`: 270개 통과. `git diff --check`, 변경 코드의 strict UTF-8/U+FFFD 검사 통과. 로그: `site-first-cycle-focused.log`, `site-first-cycle-tests.log`, `site-first-cycle-check.log`, 상위 `scratch/site-first-cycle-desktop.log`.
- 실제 화면은 localhost:4377의 임시 SQLite/가상 업체/가상 알림만 사용했다. 첫 5개 날짜와 양쪽 달 이동 비활성화, 10/21 신청→4마리 입력 화면 진입을 확인했다. 320px 그림: 상위 `scratch/national-session-20261019/site-first-cycle-320.png`. 실제 휴대폰/Safari 및 운영 업체의 신청 쓰기는 Not verified.

판정: 첫 순회 신청 제한의 로컬 검증은 Approve. 운영 배포 후 GET으로 기존 접수 보존·실제 일정 범위·정적 파일·회차별 기록을 확인한다. 전체 사이트 점검과 주관사 입금 관리 후속 작업은 남아 있다.

- `ba848da5ac727a7cf3deb6e60d3919bb4c41dad9` / Render `dep-dbbnoo6i0phs738oli2g`는 2026-10-20 23:37:48 KST Live. 운영 GET에서 일정 108개→5개, 이후 순회 103개→0개, 기존 접수 24건의 식별값·날짜·수량·상태·버전·개체 연결 해시 불변을 확인했다. 달력 HTML/JS 배포 파일도 일치했다.
- health·송출 200, 정적 27개 파일 일치, 전크자 현재 34개/34개 배송·이전 38개/36개 배송과 다른 비교 채널 기록 불변, 양쪽 미결제 조회 200/readOnly=false 유지. 자료: 상위 `site-first-cycle-bookings-before.json`/`-after.json`, `site-first-cycle-before.json`/`-after.json`. 첫 순회 신청 제한 운영 검증도 Approve.

## 주관사 입금 관리의 회차 표시

총정산→입금 관리에서 필터는 이전 회차를 유지하지만 제목이 채널명으로만 표시되는 문제를 수정했다. 서버의 실제 조회 회차를 응답에 포함하고 화면 상단과 입금 확인 창에 같은 회차 이름/날짜를 표시한다. 채널·보관 회차가 요청과 다른 응답은 기존 표·입금 창을 지우고 재시도를 안내하며, 확인 전에는 입금 쓰기를 시작할 수 없다. 금액 산식과 기록 저장 경로는 그대로 사용한다.

위험도: release. `better-interface`의 Accessibility(기존 dialog/입력 접근 이름), Layout(PC 및 320px 회차명), Writing(회차 이름과 날짜), Typography(기존 글꼴/줄바꿈), Colors(기존 토큰 유지), UI(재조회 실패→입금 비활성→성공 복구) 범위로 확인했다. 불필요한 모션은 추가하지 않았다.

| 심각도 | 분야 | 위치 | Before | After | Why |
| --- | --- | --- | --- | --- | --- |
| HIGH | Writing | `public/organizer-shipping.js` 화면/입금 창 | 현재·이전 모두 채널명만 표시 | 실제 조회 회차명과 날짜 표시 | 입금을 어느 회차에 처리하는지 확인 가능 |
| HIGH | UI | 입금 관리 조회 응답 | 회차 메타데이터 확인 없음 | URL과 응답의 채널/보관 회차 검증 | 다른 회차 응답에서 입금 조작 방지 |

- 집중 `node --test test/organizer-recovery-ui.test.js test/organizer-bank-ui.test.js test/organizer-receipts.test.js test/operation-rounds.test.js`: 34개 통과. 제목의 문자 그대로 표시, 회차 불일치/누락과 복구, 접근 상실/늦은 응답, 중복·동시 입금/재시작/저장 실패·현재/이전 입금 격리를 확인했다.
- 최종 `npm test`: 1,423개, `npm run check`, PC `python -m unittest discover -p "test*.py"`: 270개 통과. `git diff --check`와 strict UTF-8/U+FFFD 확인 통과. 로그: `site-organizer-round-focused.log`, `site-organizer-round-tests.log`, `site-organizer-round-check.log`, 상위 `scratch/site-organizer-round-desktop.log`.
- 실제 가상 PC/320px: 현재 회차 미입금 29,000원·입금 1,000원, 이전 회차 미입금 55,000원·입금 5,000원 분리. 이전 업체 A의 입금 창에는 10/14 회차명과 35,000원만 표시됐다. 가상 503→입금 버튼 비활성→최신 내역 재조회 후 같은 회차로 복구를 실제 조작했다. 이전 낙찰 탭은 해당 회차의 3개체/300,000원을 유지했다.
- 그림: 상위 `scratch/national-session-20261019/site-organizer-round-320.png`. 임시 SQLite·읽기 전용 화면으로 확인했다. 실제 운영 입금 저장, 실제 휴대폰/Safari, 스크린리더 음성은 Not verified. 기존 입금 쓰기는 가상 자동 테스트로 검사했다.

판정: 확인한 주관사 회차 표시/조회/복구 범위는 로컬 Approve. 배포 후 운영 GET으로 회차 응답과 기존 기록을 검증한다. 전체 사이트 점검은 첫 표의 남은 범위까지 완료된 것이 아니다.
