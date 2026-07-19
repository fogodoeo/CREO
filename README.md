# CREO

CREO의 경매·운영 허브와 CREWARTS 설문, NAVER BAND OAuth 브리지를 한 서비스에서 제공합니다.

## Public routes

- `/` — CREO 운영 허브
- `/crewart-survey.html` — CREWARTS 성향 테스트
- `/broadcast.html` — 방송 운영 화면
- `/shipping.html` — 배송 관리 화면
- `/api/band-oauth/*` — NAVER BAND OAuth 브리지
- `/health` — Render 상태 확인

`public/`의 정적 파일은 기존 CDCUP Static Site에서 이관했습니다. 동영상 요청은 HTTP Range를 지원하며 HTML/JSON은 재검증하고 이미지·영상·폰트는 장기 캐시합니다.

## Render

- Runtime: Node
- Build command: `npm install`
- Start command: `npm start`
- Health check: `/health`
- Public URL: `https://creok.onrender.com`

Render 환경변수는 `.env.example`을 기준으로 설정합니다. BAND client secret과 session secret은 Render Environment에만 저장하고 Git에 커밋하지 않습니다.

등록할 BAND Redirect URI:

`https://creok.onrender.com/api/band-oauth/callback`

기존 CDCUP 주소를 전환하는 동안에는 `BAND_OAUTH_ALLOWED_RETURN_URLS`에 레거시 설문 주소를 유지합니다. 완전 전환 후 해당 값과 CDCUP 서비스를 정리할 수 있습니다.
