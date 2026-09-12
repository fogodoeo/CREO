# 업체 작성·메뉴 실제 연결 — 로컬 검증

2026-09-12. 위험도 release. 실제 HTML/JS/API, 임시 SQLite, 가상 업체·개체·사진으로 검사했다. better-interface의 배치·접근성·문구·타이포그래피·색·UI 원칙을 기존 흰색/파란색 디자인에 적용했다. 운영 배포 판단은 아니다.

| 중요도 | 위치 | 수정 전 | 수정 후 | 이유 |
| --- | --- | --- | --- | --- |
| HIGH | `platform-api.js` 운영자 출품 GET | 일반 업체 요약이 검토용 팀 필드를 덮음 | 최종 검토 응답에 팀 정보 보존 | 기본 팀 누락으로 잘못 편성되는 경로 방지 |
| MEDIUM | `vendor-entry-api.js` | 늦은 조회가 새 저장 결과를 대체할 수 있음 | 요청 순서·수정 시점·서버 버전 확인 | 저장 후 화면이 이전 정보로 되돌아가지 않게 함 |
| MEDIUM | `vendor-entry-app.js` | 운영자 편성 후 업체 화면 복귀 시 목록 상태 유지 | 안전한 목록 상태에서 재조회·표시, 포커스 복귀 | 현재 처리 상태 인지 |
| MEDIUM | `vendor-entry-app.js`, `vendor-entry-api.js` | 연결 실패·새로고침 시 사진/부모 입력 복구 미연결 | 실패 파일·입력 복구와 같은 요청 재시도 | 중복 등록과 입력 반복 감소 |

## 확인한 흐름

- 출품 개체 / 낙찰·정산 / 업체 정보. 메뉴 이동과 경매 전환에 업체 자격증명·참가 경매 유지, 다른 경매 개체 분리. 편집 중 메뉴 숨김과 고정 저장 버튼.
- 피들 가져오기 흰 버튼 / 직접 추가 파란 버튼. 정보 미등록 최초 안내, 나중에·임시 저장 허용, 검토 요청 전 필수 등록, 저장 실패 시 입력 보존.
- 직접 추가·부모 신규/수정·사진 실패와 재전송·연속 새로고침·저장 응답 유실·검토 요청·운영 편성 후 상태 확인.
- 피들 가상 공개 자료 가져오기, 사진 준비 후 실패, 재시작 재사용, 동일 링크 중복 등록 억제. 업체가 이미 수정한 부모 정보는 유지.
- 낙찰 전 기본 출품 화면, 낙찰 기록 후 기본 정산 화면. 기존 buyer 내 개체 / 배송·결제와 운영자 검토·공통 사진 뷰어 인접 회귀.

## 증거

- `vendor-entry-connected-check.cjs`, `vendor-entry-import-check.cjs`, `vendor-profile-connected-check.cjs`, `buyer-navigation-check.cjs`, `entry-review-check.cjs`, `entry-integration-check.cjs`: 통과. PC 저장소 `scratch/checkout-redesign`에 코드·결과·캡처 보관.
- 업체/구매자 320/390/520px, 업체 입력과 목록 200% CSS 확대, 운영자 320/390/800px. 검사한 입력 16px 이상, 가로 넘침·JS 예외 없음. 최초 등록 창/구매자 목록/피들 입력 캡처 직접 확인. 앱 브라우저에서도 실제 업체 페이지 메뉴 확인.
- `npm run check`, 최종 `npm test`: 559개 통과. PC `python -m unittest discover -p "test*.py"`: 189개 통과. 기존 SQLite 리소스/Pillow 사용 중단 경고는 별도 남음.

Not verified: 실제 Supabase 계정·Render Linux Sharp·모바일 Safari·스크린리더·RTL·운영 `/w` 실서비스 접속·다중 서버 쓰기. 기기 내 서로 다른 여러 탭의 미저장 초안 보존, 장기 구매자 소유권/전체 사이트 UX는 남은 범위다.

Approve — 위 로컬 검사 범위. 운영 배포·전체 목표 완료를 뜻하지 않는다.
