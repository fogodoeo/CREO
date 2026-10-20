# 전국크레자랑 핀볼 개편 검증

## 범위와 위험도

위험도 **Release**. `roulette-app`의 national 테마, 장식 영상, 완료 결과 표시, 송출 바로가기, 송출 최초 명단 격리 및 빌드 산출물을 변경한다. 추첨 물리·난수·서버 명령·낙찰/배송 데이터는 변경하지 않는다. 기존 `AGENTS.md`, `docs/LIVE_RELIABILITY_CHECKLIST.md`와 better-interface의 여섯 영역, emil-design-eng의 모션 지침을 적용했다.

## 대안 조사

- [LazyGyu roulette](https://github.com/lazygyu/roulette): 현재 설치된 엔진의 원본. MIT 소스, TypeScript/Box2D WASM.
- [Pinball Roulette Maker](https://github.com/muttalkkag/pinball-roulette-maker): 네온 스타일, 맵 편집, 공 이미지, MIT. 소스의 로컬 저장·임의 초기 배치를 확인했으나 현재 서버의 회차별 명령/결과 연동을 대체하는 구현은 확인하지 못했다.
- [Dexkopf marble-race](https://github.com/Dexkopf/marble-race): 공식 데모에서 가상 참가자 네 명으로 실제 경기 진입. 맵 편집·순위·시상식은 참고할 만하나 기본 경기의 이름이 작고 최대 48명이며 저장소에 명시적인 라이선스를 확인하지 못했다.
- [Zemanzo web-marbles](https://github.com/Zemanzo/web-marbles): 3D 대안이나 2023-09-25 보관 처리되었고 개발 중단이 명시돼 있다.

이번 작업은 현재의 회차별 송출 연동을 유지하고 전크자 자료에 맞춰 화면을 재구성한다. 다른 저장소의 코드는 도입하지 않았다.

## 영역별 확인

| 영역 | 확인 자료 | 결과 |
| --- | --- | --- |
| Accessibility | 실제 관리자 키보드 Tab, 버튼 비활성화, 모바일 조작 화면, DOM 결과, 장식 SVG/video | 초점 표시, 이름 텍스트, 44px 주요 조작 영역, reduced-motion 영상 생략 |
| Layout | 1920×1080 송출, 1276px 관리자, 360px iframe 송출/관리자 | 무대·조작 영역 분리, 긴 행사명과 추첨판 겹침 없음 |
| Writing | 행사명, 회차명, 상태 및 송출 링크 | 경품·회차는 실제 설정값, 영상 내부 원본의 권역명은 사용하지 않음 |
| Typography | 로컬 Pretendard, 한글 참가자 12명, 긴 행사명, 당첨자 | 큰 당첨자, 줄바꿈, 숫자 고정 폭 확인 |
| Colors | 실제 불투명 카드/헤더/컨트롤 배경의 색상 쌍 | 흰색/파랑 7.82:1, 남색/노랑 10.09:1, 남색/카드 12.76:1, 보조 글자/패널 9.33:1 |
| UI | 배치→시작→완료→새로고침, 관리자와 송출 두 창 | 시작 스팅어 1회, 자동 종료, 결과 전달 및 완료 복원 |

## 수정한 주요 사항

| 심각도 | 영역 | 위치 | 이전 | 수정 | 이유 |
| --- | --- | --- | --- | --- | --- |
| MEDIUM | UI | `roulette-app/assets/app.scss`, `src/config.ts` | 행사 자료와 다른 크림/금색 프레임 | 제공 무대 배경, 파랑·노랑·초록, 입체 장애물, 별도 경품/후원 영역 | 전크자 방송의 시각적 정체성 |
| MEDIUM | Layout | `roulette-app/index.html`, `src/nationalStage.js` | 작은 캔버스 당첨 카드, 완료 새로고침 시 재현되지 않는 표시 | 크게 읽히는 DOM 당첨 카드와 완료 세션 복원 | 방송에서 결과를 계속 확인 가능 |
| MEDIUM | UI | `src/nationalStage.js` | 시작 연출 없음 | 4초 원본 스팅어, 중복/재연결 억제, 4.5초 최대 표시 | 영상 실패가 추첨을 막지 않음 |
| MEDIUM | Accessibility | `assets/app.scss` | 압축 HTML에서 기본 text type이 생략돼 입력란 테마 누락 | 기본 type 생략도 포함하는 입력 선택자 | 실제 배포 빌드에서 입력란과 초점을 읽기 쉽게 유지 |
| LOW | UI | `index.html`, `src/app.ts` | 송출 주소를 직접 복사해 열어야 함 | 회차·행사명을 유지하는 새 창 링크 | 관리자 조작과 송출 화면을 쉽게 구분 |
| LOW | UI | `assets/app.scss` | 단독 모드의 hidden 송출 설정이 grid 규칙으로 노출됨 | hidden 상태에 명시적으로 display:none | 단독 실행에 불필요한 송출 조작을 표시하지 않음 |
| HIGH | UI | `src/app.ts`, `src/remoteControls.js` | 송출 재접속 직후 브라우저 공용 저장소의 다른 명단을 먼저 표시 | 송출은 빈 명단으로 시작하고 회차 서버 세션만 적용, 관리자 초안 저장소에 쓰지 않음 | 이전 회차/다른 탭 명단의 잠깐 노출도 방지 |

## 검증

통과:

- `roulette-app`: `npm run check`, `npm run build`.
- `node --test test/pinball-national-stage.test.js test/pinball-remote-controls.test.js`: **18/18**, 최종 명단 격리 회귀 검사 포함.
- 서버 `npm run check`.
- 서버 `npm test`: **1,432/1,432**, 실패·취소·건너뜀 0.
- 데스크톱 `python -m unittest discover -p "test*.py"`: **270/270**. 최초 샌드박스 실행은 임시 폴더 권한 오류였고, 정상 임시 폴더 권한으로 재실행했다.
- 격리 SQLite와 가짜 SMS 제공자만 사용하는 `tools/pinball-preview.cjs`에서 가상 참가자 12명으로 배치/시작/완료. 관리자와 1080p 송출 결과가 `테스트별빛`으로 일치. 최종 빌드의 재검사는 `테스트햇살`로 일치.
- 단독 탭에 TestA/TestB를 저장한 뒤 송출을 새로고침해 서버의 현재 12명·완료 결과를 복원했다. 초기 저장 명단을 아예 읽지 않는 동작은 결정적 회귀 검사로 확인했다.
- 스팅어 재생→종료→움직이는 추첨판 복귀 확인. 완료 상태의 새 송출 창/새로고침은 당첨 결과만 복원.
- 빈 명단에서 배치·시작 모두 비활성화.
- 자동 테스트: 동일 시작·동일 탭 재로드 중복 억제, 새 run 재생, 완료/초기화 시 늦은 영상 무시, play 거절/동기 예외/디코딩 오류/시간 초과, 저장소 차단, reduced-motion 및 다른 테마에서 영상 미요청.
- 캔버스 자동 녹화에도 당첨 이름을 남기는 기존 경로 유지.
- `git diff --check`, 수정 파일의 strict UTF-8 및 U+FFFD 검사 통과.
- 최종 산출물: `roulette-app.21782fa0.js`, `roulette-app.87f2c70c.css`. 선택 테마의 원본 PNG/WebM은 별도 자산으로 제공한다.

최초 전체 검사의 정적 파일 용량 실패는 선택 테마 이미지를 공통 번들에 중복 포함한 원인으로, 선택 테마 전용 자산 참조로 수정했다. 원본 영상은 관리자 창에서는 내려받지 않으며 national 송출/단독 화면에서만 준비한다.

미검증/한계:

- PRISM 앱 내부의 실제 GPU·오디오 출력은 이번 로컬 브라우저 검사에 포함되지 않는다. 스팅어는 자동 재생 실패와 중복 소리를 피하려고 **무음**이며 기존 방송 오디오를 사용한다.
- 자동 녹화는 캔버스만 캡처하므로 DOM 외곽 무대와 스팅어가 포함되지 않는다. 전체 화면 연출은 PRISM 브라우저 소스에 표시된다.
- 500명 실시간 성능을 이번 화면 개편에서 새로 보증하지 않는다. 기존 물리와 공 개수 제한을 유지한다.
- 전체 사이트의 별도 배송·정산 감사 범위까지 완료했다는 판정은 아니다.

## 판정

**Approve** — 위 화면/동작 범위에서 남은 HIGH 인터페이스 문제 없음. 배포는 전체 검사와 운영 읽기 검증이 통과한 버전에 한한다.
