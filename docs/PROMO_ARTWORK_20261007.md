# 홍보 원고 배너 수정 · 2026-10-07

## 대표 이미지 서울·인천 수정

- 자산: `public/promo-assets/hero-seoul-incheon-v2.png`
- 입력: 기존 `public/promo-assets/hero.jpg`. 원본 파일은 보존한다.
- built-in image_gen으로 회차를 `EP 01. 서울, 인천`으로 수정. 기존 검정·민트, 장갑 위 크레, 날짜·방송시간 구성은 유지한다. 결과의 회차 문구를 눈으로 확인한 뒤 원고의 500px 표시로 검수한다.
- 모든 원고 본문에는 공통 대표 이미지를 맨 앞에 한 번만 표시한다. 목록 썸네일은 이 공통 이미지를 제외한 해당 원고의 첫 이미지로 선택한다.

```text
Precisely edit the attached Korean live broadcast hero poster. This is a localized text correction only. In the upper right corner inside the outlined photograph frame, replace the existing text 'EP.01 서울' with exactly 'EP 01. 서울, 인천'. The new text must be correctly typeset in clean white Korean sans-serif, right aligned in the same position, reduced slightly in size or extended to the left only if needed to fit comfortably. Preserve ALL other content and composition: the black green background, giant white 전국크레자랑 heading, small live auction heading, Naver Band logo, mint LIVE label, small orange crested gecko on white gloved hands, frame, 10.14 date, 첫 방송 badge, 수요일 밤 8시, and bottom 매주 월·수 밤 8시 strip. Do not add anything. Preserve the original aspect ratio and sharp professional typography. No changes to any other wording. No new texture, noise, distortions, decorative elements, or added illustrations. Highest available image quality.
```

## 배포 자산

- `public/promo-assets/weekly-v2.png`, `weekly-v2.thumb.webp`: 전크자 로고를 사용한 매주 월·수 밤 8시 배너. built-in image_gen 생성 및 글자 대비 보정.
- `public/promo-assets/easy-v2.png`, `easy-v2.thumb.webp`, `easy-v2.svg`: 카카오톡 안내. 기존 편집 가능한 SVG를 대체하는 네이티브 그래픽. 실제 아이콘과 Gmarket Sans TTF Bold/Medium을 사용해 `tools/render-promo-easy.cjs`로 생성.
- `public/promo-assets/kakaotalk-symbol.png`: 사용자 프로젝트 `라이브커머스컨셉영상/타이포_작업/v4/kakaotalk_symbol.png`의 원본 그대로. 아이콘은 생성 모델로 재현하지 않았다.
- 종전 easy/weekly 파일은 보존한다. 기존 원고에는 클라이언트의 이미지 주소 해석을 통해 버전 자산을 제공한다.

## 디자인 기준

가로 500px에서 읽는 카페 본문용. 핵심 문장만 넣고 반복되는 자세한 설명은 본문에 둔다. 흰 배경이 본문에 자연스럽게 이어지고, 브랜드 로고와 큰 검정 글자에 집중한다. 장식용 민트는 전크자 로고 외곽선과 구분점에만 사용하고 정보 글자는 검정 또는 짙은 초록으로 표시한다. 카카오톡의 노란색과 심볼 형태는 그대로 유지한다.

네이티브 알림 이미지의 흰 배경 대비는 본문 #101719 18.12:1, 보조 #485153 8.15:1, 브랜드 #007443 5.87:1이다. 생성 배너는 프롬프트 색상 지정만으로 정확한 픽셀 대비를 보장하지 않으며 실제 축소 렌더링으로 함께 확인한다.

## 생성 프롬프트

입력 참조: `C:/Users/5600x/Desktop/전크자/전크자조선/전크자로고.png`. 로고 정체성 참조이며 해당 파일을 변경하지 않았다.

```text
Create ONE finished, premium Korean campaign banner for a Naver Cafe article for 전국크레자랑. Use the attached original 전국 크레자랑 logo as the exact brand identity reference; preserve its distinctive Korean glyph shapes and stacked arrangement. WIDE 3:1 horizontal composition, high resolution, sharp clean edges. It will be displayed at only 500px wide, so use very little text and bold large type. Art direction: expertly art-directed contemporary Korean broadcast identity, editorial graphic design, extremely clean nearly-white background, rich near-black typography and one fresh mint-green accent (#39EDA5). No photos, no characters, no reptile, no calendars, no decorative cards, no generic flowchart, no soft gradient, no grain, no fake 3D plastic objects. Reinterpret the supplied logo in FLAT near-black with subtle off-white inline and mint outer outline, no bronze and no metallic effects. Place this logo prominently on the left half, optically centered. Right half: small top line exactly '매주 두 번', then huge confident typesetting exactly '월 · 수', then bold subline exactly '밤 8시 LIVE'. A very thin black vertical rule can divide the two areas. Bottom margin optional understated tiny label exactly '네이버 밴드'. Build rhythm through generous whitespace and exact alignment. All text must be spelled correctly in Korean, particularly 월 (ㅇ + ㅝ + ㄹ) and 수. Do not add any other words. Must feel like a real designed brand banner, crisp restrained 2D graphic, not an AI illustration. Use full bleed horizontal canvas with generous safe margins.
```

후속 보정 (앞서 생성한 배너를 편집 대상으로 사용):

```text
Precise small edit of the attached completed 3:1 banner. Keep exactly the same layout, canvas aspect ratio, logo, Korean text, all letterforms, placements, proportions and background. Change ONLY the color of the English word LIVE at bottom right from bright mint to deep dark forest green #007443 so it reads sharply against white. The mint outline around the 전국크레자랑 logo and the mint separator dot between 월 and 수 must remain mint. Keep all Korean words EXACTLY: 전국 크레자랑 / 매주 두 번 / 월 · 수 / 밤 8시 / 네이버 밴드. No additions, no decorative new elements, no texture, no distortion. Preserve the crisp premium flat graphic design. The one intentional edit is the darker LIVE text for accessibility.
```
