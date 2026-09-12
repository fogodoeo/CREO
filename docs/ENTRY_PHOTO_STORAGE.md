# 출품 사진 저장 — 로컬 구현 상태

2026-09-12. 위험도 release: 인증·새 파일 저장·공개 응답에 영향을 준다. 운영 배포/버킷 생성/실제 고객 자료 업로드는 하지 않았다. 실제 업체 작성 화면을 아래 HTTP 경로에 연결했고, 원격 Supabase 연결은 아직 검증하지 않았다. 기존 IndexedDB 디자인 예시는 별도로 유지한다.

## 저장과 열람

- `POST /api/platform/vendor-entries/photos`: 기존 업체 전용 `code`, 참가 `event`, 사진 UUID `id`, 압축 이미지의 `image`(Base64 또는 JPG/PNG/WebP data URL)를 받는다. 응답은 `{media}`다. 임의 업체 ID·외부 이미지 URL로 소유자를 정할 수 없다. 구매자 링크는 사용할 수 없다.
- 입력은 최대 400,000바이트, 요청 전체는 600,000바이트. 서버에서 파일을 실제 디코딩하고 방향 보정·메타데이터 제거·WebP 변환을 수행한다. 큰 보기 최대 1600px/400KB, 미리보기 최대 320px/60KB. 원본 파일은 보관하지 않는다. JPG/PNG/WebP의 정지 사진만 허용한다.
- 디코딩 1개, 저장 대기 포함 업로드 2개로 제한한다. 초과 시 429와 재시도 문구를 반환한다. 이미지 처리·원격 저장은 경매 변경 잠금을 잡지 않는다. 처리 후 저장 직전에 업체/경매 접근을 다시 확인한다.
- 파일 경로는 업체 UUID/사진 UUID/내용 해시/용도다. 덮어쓰기를 허용하지 않는다. 파일 두 개가 저장된 뒤 메타데이터를 기록한다. 동일 ID·입력 사진의 재시도는 기존 등록을 반환하며 새 개체나 중복 사진을 만들지 않는다. 코덱 업데이트 뒤에도 원본 입력 해시로 같은 업로드를 식별한다.
- DB에는 영속 경로·크기·치수·입력 해시만 저장한다. Base64와 만료되는 서명 주소는 저장하지 않는다. 같은 부모 사진은 같은 미디어 ID를 참조한다. 부모 수정은 최신 자료로 조회하지만 낙찰·결제 행을 바꾸지 않는다.
- 권한이 확인된 구매자/업체/운영자 응답에만 짧게 유효한 이미지 접근 주소를 발급한다. 이 단계에는 Storage 네트워크 호출이 없다. 사진을 실제로 열 때 접근 서명을 검증하고 Supabase 서명 URL로 307 이동한다. 이미지 바이트는 브라우저가 Storage에서 직접 받는다. Render는 이미지 바이트를 중계하지 않는다.
- 서버 내부 경로만으로 사진을 읽을 수 없다. 방송 공개 DTO에는 새 비공개 사진 경로를 내보내지 않는다. 기존 공개 사진은 그대로 유지한다. 사진 접근 주소와 Storage 서명 URL은 각각 최대 1시간이며, 이미 받은 URL/캐시의 즉시 철회를 의미하지 않는다.

## 운영 연결 전 필요한 설정

`server.js`는 기존 `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`를 읽는다. 키를 브라우저에 주지 않는다. `CREO_ENTRY_PHOTO_BUCKET` 기본값은 `auction-entry-photos`다. 해당 **비공개** 버킷을 미리 준비해야 한다. 버킷이 없거나 공개이면 업로드를 거부한다. 기존 버킷의 공개 여부를 자동 변경하거나 버킷을 자동 생성하지 않는다.

현재 운영 연결은 `*.supabase.co` HTTPS 주소만 지원한다. 설정이 없다고 Render 임시 디스크로 저장하지 않는다. 로컬 파일 저장은 테스트/미리보기에서 `localDir`와 서명 비밀을 명시해서만 사용한다. `CREO_ADMIN_SECRET`은 재시작해도 동일하게 유지되어야 기존 개인 링크 및 사진 접근 주소가 유지된다.

업체별 등록 사진 한도 기본값은 100,000,000바이트이며 `CREO_ENTRY_PHOTO_VENDOR_MAX_BYTES`로 조정한다. 이는 과도한 업로드를 막는 구현상의 한도이며 요금제/프로젝트 전체 용량 보장이나 사용자 확정 보관 정책이 아니다. `state.mediaUsage`로 등록 용량과 한도를 반환한다. 파일이 일부 저장된 뒤 DB 기록에 실패한 고아 파일은 이 합계에 포함되지 않는다. 불확실한 저장 결과를 되돌리다가 정상 파일을 지우지 않도록 자동 삭제를 하지 않았다. 전체 사용량 대조와 고아 파일 정리 절차는 후속 작업이다.

## 검증

- `node --test test/entry-photo-storage.test.js`: 7개. 실제 래스터 변환/방향/메타데이터/용량, 처리 동시성, 비공개 파일과 만료·경로 조작 거부, 저장소 재시작, 원격 API 계약과 악성 서명 URL 거부, 부분 업로드 재시도, DB 응답 유실 후 중복 방지, 소유권·한도 검증.
- `node --test --test-name-pattern="entry photo|vendor entry API|operator entry approvals" test/platform-api.test.js`: 5개. 그중 신규 사진 HTTP 경로 3개. 인증·초과 입력·다른 업체/구매자 격리, 운영 편성과 구매자 사진 조회, 공개 송출에 비공개 경로 없음, 저장 지연 중 경매 변경 성공, 대기 수 제한, 처리 중 경매 보관 전환 검증.
- `node scratch/checkout-redesign/entry-integration-check.cjs` (PC 저장소): 실제 HTTP 업로드+임시 SQLite+비공개 로컬 파일, 실제 구매자·업체 HTML에서 이미지 디코딩, 부모 재사용/수정, DB/API 재시작 후 조회, 중복 업로드 1건 유지 확인. 가상 사진·가상 거래만 사용했다. 390px 화면 캡처 직접 확인.
- `npm run check`, `npm test`: 서버 550개 통과. PC `python -m unittest discover -p "test*.py"`: 189개 통과. 마지막 캐시 헤더 형식 보정은 Storage 집중 테스트에서 다시 확인했다.
- 수정 코드 10개 파일의 strict UTF-8/U+FFFD 검사 및 관련 `git diff --check` 통과. CRLF 안내만 있다.

후속 UI 검증: `vendor-entry-connected-check.cjs`에서 실제 HTTP 사진 저장·실패 후 파일 재선택 없는 재시도·새로고침 복원·SQLite 재시작을 확인했다. `vendor-entry-import-check.cjs`는 가상 피들 응답으로 부모/개체 사진 준비·업로드 실패·새로고침·재시도·중복 억제를 확인했다. 최종 서버 559개·PC 189개 테스트 통과.

미검증: 실제 Supabase 계정 업로드와 버킷 권한, Render Linux의 Sharp 설치/자원 사용, 실기기 Safari, 다중 서버의 동시 메타데이터 갱신. 전체 프로젝트 저장 용량 집계·고아 파일 정리·실운영 보관 정책도 후속 작업이다. 로컬 성공을 원격 저장 성공으로 간주하지 않는다.

보관함 후속: 연결된 낙찰 스냅샷은 기존 비공개 미디어 경로를 참조하며 사진 파일을 복제하지 않는다. 부모는 연결 당시 선택한 부모 ID의 최신 자료를 사용한다. 사진 정리 도구는 업체 출품/부모/승인 자료뿐 아니라 암호화된 `creo_v2::buyer-collection::record::`의 보존 사진까지 참조 대상으로 집계해야 한다. 그 검증과 보관 정책 확정 전에는 자동 삭제하지 않는다.

등록 용량 집계 후속: 운영자 출품 검토에 **사진 저장량**을 추가했다. 공통 파일 중복을 제외하고 출품/부모 이력/보관함/경매 기록의 참조를 집계한다. 읽지 못한 보존 자료를 미사용으로 취급하지 않는다. 이 결과는 등록 메타데이터 기준이며 Storage의 실제 파일 목록, 등록 전 실패한 파일과 다른 버킷은 아직 대조하지 않았다. 상세 API와 검증은 [사진 저장량 감사](ui-audit/PHOTO_USAGE.md)를 따른다.

구현 참고: 이미지 메타데이터 기본 제거/출력 제한은 [Sharp 출력 API](https://sharp.pixelplumbing.com/api-output/), 입력 제한은 [Sharp 생성자](https://sharp.pixelplumbing.com/api-constructor/)를 확인했다. 비공개 열람 방식은 [Supabase Storage 다운로드](https://supabase.com/docs/guides/storage/serving/downloads), 업로드 Cache-Control과 signedURL 응답 계약은 [공식 storage-js 코드](https://github.com/supabase/storage-js/blob/master/src/packages/StorageFileApi.ts)를 기준으로 작성했다. 실제 서비스 호출 성공을 뜻하지 않는다.
