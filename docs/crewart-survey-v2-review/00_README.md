# CREWARTS 설문 Ver 2 검토 패키지

작성일: 2026-08-14  
운영 URL: https://creok.onrender.com/crewart-survey.html?channel=crewart

## 목적

이 폴더는 CREWARTS 설문 Ver 2의 현재 질문과 결과 콘텐츠를 검토하고 Gemini에게 개선 작업을 전달하기 위한 문서 묶음이다. 실행 데이터의 복사본을 여러 위치에 만들면 수정본이 갈라지므로 JSON 원본은 `public` 아래 한 곳만 유지한다.

## 단일 원본

- 질문 전체 JSON: `../../public/crewart-survey-questions-v28.json`
- 결과 전체 JSON: `../../public/crewart-survey-results-v28.json`
- 질문·채점 엔진: `../../public/crewart-survey-core.js`
- 화면 및 제출 로직: `../../public/crewart-survey.js`
- 설문 API 검증: `../../crewart-survey-api.js`
- 핵심 회귀 테스트: `../../test/crewart-survey-core.test.js`

2026-08-14 확인 결과 운영 서버의 두 JSON과 위 로컬 JSON은 JSON 의미 기준으로 동일하다. 줄바꿈 형식 차이 때문에 파일 바이트와 SHA-256은 다를 수 있다.

## 문서

- `01_QUESTIONS_CURRENT.md`: 현재 운영 질문 12개와 선택지 스냅샷
- `02_RESULTS_CURRENT.md`: 현재 결과 유형 16개 인덱스와 연결 상태
- `03_GEMINI_FEEDBACK.md`: Gemini에게 전달할 구현 피드백 및 완료 조건
- `04_GEMINI_CONTENT_FEEDBACK.md`: Gemini에게 전달할 질문·선택지·결과 문구 점수와 개선 의견
- `05_GEMINI_CONTENT_REVIEW_2.md`: 문장 수정본에 대한 2차 점수와 남은 개선사항
- `06_GEMINI_CONTENT_REVIEW_3.md`: 문장 수정본에 대한 3차 정밀 점수와 유형 간 일관성 검토

## 현재 버전 불일치

- 질문 파일명: `crewart-survey-questions-v28.json`
- 질문 내부 버전: `crewart-tendency-v29.0-psychometric-master`
- 결과 파일명 및 내부 버전: `crewart-survey-results-v28.json`, `crewart-results-v28.0-pasamo-ultimate`
- 화면 버튼 표기: `Ver 2`

따라서 `Ver 2`, `v28`, `v29`가 한 기능 안에 혼재한다. 다음 수정에서는 표시 버전, 파일 버전, 저장 버전, 결과 버전을 하나의 레지스트리로 통일해야 한다.
