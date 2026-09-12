# 구매자 보관함 — 로컬 검증

2026-09-12. 위험도 release: 새 인증·암호화 영속 데이터·공개 응답·낙찰 식별 메타데이터. 실제 고객/운영 자료는 사용하지 않았다.

## 범위와 판단

첫 등록은 수령지 → 결제방법을 유지한다. 등록 후 `내 개체 / 배송·결제` 하단 메뉴로 조회와 거래를 나눈다. 장기 보관함은 로그인 후 경매별로 명시적으로 연결한 낙찰 기록을 조회하는 별도 진입점이다. 현재 전화번호가 같다는 사실만으로 과거 거래를 가져오지 않는다.

| 중요도 | 위치 | 발견과 처리 | 효과 |
| --- | --- | --- | --- |
| 높음 | `buyer-collection.js` 상세 조회 | 현재 개체 행이 없어지거나 재사용되면 이전 연결도 사라짐 → 연결 당시 표시 자료를 독립 보존 | 예전 거래가 새 낙찰자의 금액/사진으로 바뀌지 않음 |
| 높음 | `public/buyer-library.js` 재로그인 | 기존 세션이 유효하고 연결 인증만 오래됐을 때 로그인 폼에 돌아가지 못함 → 문서 이동으로 로그인 화면과 받은 링크 복원 | 실제 재인증 후 연결 가능 |
| 중간 | `vendor-entries.js` 보관함 부모 조회 | 현재 출품의 부모 선택을 따라가면 재사용 시 다른 부모가 붙음 → 최초 부모 ID의 최신 자료만 조회 | 부모 수정 반영과 원래 부·모 관계를 함께 유지 |
| 중간 | `public/buyer-library.js` 사진 | 작은 사진 오류에 깨진 이미지가 남음 → 작은 사진 숨김, 상세의 재시도 유지 | 실패가 목록을 망가뜨리지 않음 |
| 낮음 | `checkout-item-data.js` 표시 번호 | 레거시 A01/B15 이름 앞에 순서 번호 중복 → 명시 번호가 없을 때 이름의 식별번호 사용 | 원장 순서는 유지하고 화면에서 한 번만 표시 |
| 낮음 | `public/buyer-library.css` 상태 위치 | 긴 업체명과 거래 변경 상태가 같은 줄에 붙음 → 업체명 아래 상태 표시 | 좁은 화면에서 의미 분리 |

## 증거

- `node --test test/buyer-account.test.js`: 14개. 임시 SQLite + 가짜 Kakao. state/PKCE/브라우저 결합/재사용 거부, CSRF/소유권/다른 계정, 응답 유실·동시 연결·저장 실패 원자성·재시작, 링크 만료/회전/중지, 재경매, 기록 삭제/채널 삭제, 부모 ID 고정·최신 정보·영속 사진 경로, 조회 중 폐기, 15분 재인증 경계를 확인했다.
- `node --test test/checkout-item-data.test.js test/checkout-item-view.test.js test/buyer-account.test.js`: 25개 통과. 새 레거시 식별번호 회귀 포함.
- `scratch/checkout-redesign/buyer-library-check.cjs` (PC 저장소): 실제 HTML/API, 임시 SQLite와 가짜 공급자. 네이티브 로그인 폼/콜백/쿠키, 링크 확인·명시 연결, 저장 응답 유실 동일 요청 재시도, 320/390/800px, 재낙찰·삭제 후 기존 표시 유지, 깨진 이미지/상세 재시도, 200% CSS 확대, 재인증 후 링크 복원, 재시작·로그아웃 통과.
- 위 실화면에서 재인증 오류를 재현하고 고쳤다. 이미지 실패 검사는 이미 디코딩된 이미지 재사용을 피하도록 별도 주소를 사용했다. 가상 사진과 공급자 응답을 실제 원격 사진/카카오 성공으로 간주하지 않는다.
- `entry-integration-check.cjs`: 실제 업로드/편성/구매자·업체 HTML의 부모 수정과 재시작 인접 흐름 통과. `buyer-navigation-check.cjs`: 최초 등록·수정·추가 낙찰·보관 경매·사진·메뉴 인접 흐름 통과.
- 최신 모바일 캡처 `buyer-library-retained.png`, `buyer-library-connect-320.png`, `buyer-library-detail-390.png`를 직접 확인했다. 표에 적힌 화면/상태 범위에서 로컬 검토 가능하다.
- `npm run check`, 최종 서버 `npm test` **590개**, PC `python -m unittest discover -p "test*.py"` **189개** 통과. 기존 PC 경고는 남아 있다. 서버/PC 전체 로그는 PC 저장소 `scratch/checkout-redesign/buyer-library-{server,desktop}-tests.log`다.

실제 Kakao/Render/Supabase, Safari·스크린리더, 운영 배포와 데이터 이관은 미검증이다. 인증 활성화 전 필요한 조치는 [구매자 보관함](../BUYER_COLLECTION.md)에 별도로 명시했다. 소스 목록 50개를 생성했지만 전체 페이지가 실화면 검토를 통과했다는 뜻은 아니다.
