# CREO

CREO 멀티 경매 운영 허브, CREWARTS 설문, NAVER BAND OAuth 브리지입니다.

## 멀티 경매 운영

- `/` — 채널 중심 운영 허브
- `/channel-manager.html` — 신규 경매 채널 생성·복제·디자인 설정
- `/channel-workspace.html?channel=<id>` — 채널별 업체·개체·배송 관리
- `/auction-control.html?channel=<id>` — 통합 방송 제어
- `/broadcast-router.html?page=1` — 방송 프로그램에 등록할 공용 송출 URL

신규 채널 데이터는 `creo_v2::<channel_id>::...` 이름공간으로 분리됩니다. 자세한 설계와 운영 절차는 [멀티 경매 플랫폼 설계](docs/platform-architecture.md)를 참고하세요.

## 기존 공개 화면

- `/crewart-survey.html` — CREWARTS 성향 테스트
- `/cdcup-index.html` — CDCUP 기존 관리 화면
- `/shipping.html` — 기존 배송 관리 화면
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

등록할 BAND Redirect URI:

`https://creok.onrender.com/api/band-oauth/callback`
