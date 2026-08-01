# CREO

CREO 멀티 경매 운영 허브와 CREWARTS 설문 서비스입니다.

## 멀티 경매 운영

- `/` — 채널 중심 운영 허브
- `/channel-manager.html` — 신규 경매 채널 생성·복제·디자인 설정
- `/channel-workspace.html?channel=<id>` — 채널별 업체·개체·배송 관리
- `/auction-control.html?channel=<id>` — 통합 방송 제어
- `/broadcast-router.html?page=1` — 방송 프로그램에 등록할 공용 송출 URL

신규 채널 데이터는 `creo_v2::<channel_id>::...` 이름공간으로 분리됩니다. 자세한 설계와 운영 절차는 [멀티 경매 플랫폼 설계](docs/platform-architecture.md)를 참고하세요.

운영 데이터의 기본 저장소는 SQLite입니다. Render Persistent Disk가 연결된 환경에서는 SQLite와 outbox가 영구 보존됩니다. 현재처럼 Disk가 없는 환경에서는 SQLite를 빠른 실행 캐시로 사용하고, 각 변경을 응답 전에 Supabase 미러로 즉시 전송 시도합니다. 성공한 변경은 재배포 뒤 채널·업체·개체·배송·방송 상태·브랜드 자산까지 미러에서 다시 복구되며, 실패한 전송은 `/health`의 `platform.outboxPending`과 `platform.mirrorError`에서 확인할 수 있습니다. `platform.durable`로 실제 Disk 연결 여부를 확인할 수 있습니다.

## 기존 공개 화면

- `/crewart-survey.html` — CREWARTS 성향 테스트
- `/cdcup-index.html` — CDCUP 기존 관리 화면
- `/shipping.html` — 기존 배송 관리 화면
- `/api/band-membership/*` — 전화번호 기반 BAND 회원 명단 확인
- `/api/crewart-survey/*` — 버전이 맞는 문항과 비식별 집계 조회, 회원 확인 후 익명 응답 저장
- `/api/band-oauth/*` — NAVER BAND OAuth 브리지
- `/health` — Render 상태와 플랫폼 저장소 확인

`public/`의 이미지와 영상은 브라우저 캐시와 HTTP Range 요청을 지원합니다.

## 실행

```bash
npm install
npm test
npm start
```

## Render

- Runtime: Node
- Build command: `npm install`
- Start command: `npm start`
- Health check: `/health`
- Public URL: `https://creok.onrender.com`

환경변수는 `.env.example`을 기준으로 설정합니다. BAND client secret, session secret, `CREO_ADMIN_SECRET`, Supabase service-role 키는 Render Environment에만 저장하고 Git에 커밋하지 않습니다.

## CREWARTS BAND 회원 확인

설문 결과는 전화번호가 Supabase의 활성 BAND 회원 명단과 일치할 때 열립니다. 전화번호 조회는 서버에서만 수행하며, 브라우저에는 원번호가 없는 무작위 단기 인증 토큰만 저장됩니다. 같은 전화번호를 다시 확인해도 새로운 무작위 식별자를 발급하므로 설문 결과와 전화번호를 연결하지 않습니다. 설문 응답에도 전화번호를 넣지 않습니다.

1. Supabase SQL Editor에서 `supabase/band-members.sql`을 실행합니다.
2. 기존 `config` 공개 정책에서 개인별 설문 행을 제외하려면 `supabase/protect-crewart-survey-responses.sql`을 실행합니다.
3. 회원 전화번호는 하이픈 없이 `band_members.phone_normalized`에 입력합니다.
4. Render Environment에 `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, 32자 이상의 `BAND_MEMBER_SESSION_SECRET`을 설정합니다.
5. 기존 회원 테이블을 쓸 때는 `BAND_MEMBER_TABLE`, `BAND_MEMBER_PHONE_COLUMN`, `BAND_MEMBER_ACTIVE_COLUMN`을 실제 이름에 맞춥니다.

브라우저용 Supabase anon 키로는 회원 명단을 조회할 수 없게 RLS를 유지해야 합니다. 미가입자는 `BAND_MEMBER_TARGET_BAND_URL`로 이동합니다.
테스트 중 확인 횟수 제한을 끄려면 `BAND_MEMBER_RATE_LIMIT_ATTEMPTS=0`으로 설정합니다. 이 값은 Render에서도 명시적인 무제한 설정으로 적용됩니다. 공개 운영을 시작하기 전에는 `120`처럼 유한한 값으로 되돌리세요. `/api/band-membership/config`의 `rateLimitDisabled`로 실제 적용 여부를 확인할 수 있습니다.

승인 프로그램은 `이름 / 전화번호` 형식의 프로필을 확인합니다. `BAND 폰 인증 필수` 옵션은 독립적으로 켜거나 끌 수 있습니다. 공개된 BAND 인증번호와 프로필 번호가 달라도 가입을 승인하며, 로컬 승인 UI에는 두 번호와 `불일치` 상태를 따로 표시합니다. 승인 뒤에는 두 번호를 같은 회원의 별칭으로 명단에 등록해 어느 번호로도 CREWARTS 결과를 열 수 있게 합니다.

설문 브라우저는 Supabase `config` 전체를 직접 읽지 않습니다. 공개 bootstrap API에는 현재 문항 버전과 기숙사별 인원·응답시간 집계만 포함되며, 이름·전화번호·개별 답변은 반환하지 않습니다. 응답 저장은 유효한 BAND 회원 세션이 있을 때만 허용되고 전화번호와 프로필명은 저장하지 않습니다.

등록할 BAND Redirect URI:

`https://creok.onrender.com/api/band-oauth/callback`
