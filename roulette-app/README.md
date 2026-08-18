# MARBLE DRAW

어떤 행사·채널에서도 단독으로 열어 사용할 수 있는 브라우저 기반 마블 추첨 페이지입니다.
`lazygyu/roulette`의 MIT 라이선스 물리 엔진과 맵을 기반으로 하며 광고, 분석 스크립트,
외부 키워드 이미지 API를 제거했습니다. 참가자와 추첨 기록은 현재 브라우저의
`localStorage`에만 저장됩니다.

- 원본 저장소: `https://github.com/lazygyu/roulette`
- 이식 기준 커밋: `6650acd9a21ec2ba71277ab84181a087f43261ef`

## 개발과 빌드

```sh
npm install
npm run check
npm run build
```

빌드 결과는 서버가 정적으로 제공하는 `../public/roulette/`에 생성됩니다.

## 자주 바꾸는 위치

- 기본 문구·맵·속도·테마: `src/config.ts`
- 조작 화면과 기록 로직: `src/app.ts`
- 반응형 UI: `assets/app.scss`
- 물리 맵: `src/data/maps.ts`
- 구슬·물리 파라미터: `src/marble.ts`, `src/physics-box2d.ts`
- 공개 임베딩 API: `window.CreoMarbleRoulette`

## 참가자 입력 형식

- `홍길동`: 공 1개
- `홍길동*3`: 같은 이름의 공 3개
- `홍길동/5`: 물리 가중치 5
- 쉼표 또는 줄바꿈으로 구분

## 다른 채널에서 제어하기

같은 출처의 다른 페이지나 방송 오버레이는 다음 API를 사용할 수 있습니다.

```js
window.CreoMarbleRoulette.configure({
  eventTitle: '여름 라이브 경매',
  channelName: 'BAND LIVE',
  themePreset: 'arena',
});
window.CreoMarbleRoulette.setEntries(['참가자 A*3', '참가자 B', '참가자 C']);
await window.CreoMarbleRoulette.prepare();
await window.CreoMarbleRoulette.start();
```

추첨 시작 시 `creo:roulette:start`, 완료 시 `creo:roulette:result` 이벤트가 `window`에
발생합니다. 설정 패널의 JSON 내보내기/가져오기로 행사별 프리셋도 이동할 수 있습니다.

링크만으로 초기 화면을 구성할 때는 `title`, `channel`, `entries`, `map`, `speed`,
`mode`, `rank`, `theme`, `accent` 쿼리 파라미터를 사용할 수 있습니다. 예:

```text
/roulette/?title=여름%20라이브&channel=BAND%20LIVE&entries=A*2,B,C&theme=arena&speed=1.5
```

## 추첨 기록과 재현

각 라운드는 암호학적으로 생성한 128비트 시드, 참가자 목록 SHA-256, 맵, 속도,
당첨 순위, 결과와 시간을 저장합니다. 물리 난수는 시드 기반으로 동작하므로 같은 환경에서
`같은 시드로 재현`할 수 있습니다. 브라우저·Box2D 런타임 차이까지 법적 수준으로 동일한
결과를 보장하는 시스템은 아니므로, 규제 대상 추첨에는 별도 서버 추첨·감사 절차가 필요합니다.

## 라이선스

원본 저작권 및 MIT 전문은 `LICENSE`와 공개 결과물의 `LICENSE.txt`에 유지합니다.
