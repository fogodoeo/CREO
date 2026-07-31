# CREO

CREO 멀티 경매 운영 허브와 CREWARTS 설문 서비스입니다.

## 멀티 경매 운영

- `/` — 채널 중심 운영 허브
- `/channel-manager.html` — 신규 경매 채널 생성·복제·디자인 설정
- `/channel-workspace.html?channel=<id>` — 채널별 업체·개체·배송 관리
- `/auction-control.html?channel=<id>` — 통합 방송 제어
- `/broadcast-router.html?page=1` — 방송 프로그램에 등록할 공용 송출 URL

신규 채널 데이터는 `creo_v2::<channel_id>::...` 이름공간으로 분리됩니다. 자세한 설계와 운영 절차는 [멀티 경매 플랫폼 설계](docs/platform-architecture.md)를 참고하세요.

운영 데이터의 기본 저장소는 CREOK 영구 디스크의 SQLite입니다. Supabase가 한도 초과나 장애로 멈춰도 운영은 계속되며, 미러 변경은 outbox에 보관됐다가 복구 후 자동 전송됩니다.

## 기존 공개 화면

- `/crewart-survey.html` — CREWARTS 성향 테스트
- `/cdcup-index.html` — CDCUP 기존 관리 화면
- `/shipping.html` — 기존 배송 관리 화면
- `/api/band-membership/*` — 전화번호 기반 BAND 회원 명단 확인
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

설문 결과는 전화번호가 Supabase의 활성 BAND 회원 명단과 일치할 때 열립니다. 전화번호 조회는 서버에서만 수행하며, 브라우저에는 원번호가 없는 단기 인증 토큰만 저장됩니다. 설문 응답에도 전화번호를 넣지 않습니다.

1. Supabase SQL Editor에서 `supabase/band-members.sql`을 실행합니다.
2. 회원 전화번호는 하이픈 없이 `band_members.phone_normalized`에 입력합니다.
3. Render Environment에 `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, 32자 이상의 `BAND_MEMBER_SESSION_SECRET`을 설정합니다.
4. 기존 회원 테이블을 쓸 때는 `BAND_MEMBER_TABLE`, `BAND_MEMBER_PHONE_COLUMN`, `BAND_MEMBER_ACTIVE_COLUMN`을 실제 이름에 맞춥니다.

브라우저용 Supabase anon 키로는 회원 명단을 조회할 수 없게 RLS를 유지해야 합니다. 미가입자는 `BAND_MEMBER_TARGET_BAND_URL`로 이동합니다.

등록할 BAND Redirect URI:

`https://creok.onrender.com/api/band-oauth/callback`
