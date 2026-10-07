# 홍보 원고 배너 수정 · 2026-10-07

## 대표 이미지 서울·인천 수정

- 후속 글자 수정: `hero-seoul-incheon-v3.png`가 최종본이다. v2의 '울' 획 겹침을 사용자 피드백으로 확인했다. `tools/render-promo-hero-label.cjs`로 기존 문구 영역의 배경만 복구하고 **Gmarket Sans TTF Bold, 36px** 실서체로 `EP 01. 서울, 인천`을 합성한다. 사진과 그 밖의 픽셀은 보존하며 생성 모델로 글자를 다시 그리지 않는다. 기존 v2와 원본은 보존한다.
- v3 검증: 확대된 문구와 500px 본문 실제 화면 확인. 원본 대비 글자 수정 영역 밖 RGB 변경 0. 이미지 해석·복사·중복 방지 집중 3개와 전체 1,022개, 구문 검사 통과. 썸네일 선택 방식은 이전과 동일하다.

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

## 2026-10-08 추가 원고 3종의 사진

- 방식: built-in image_gen 기본 생성, 참조 이미지 없음, 불투명 배경.
- `taste-v6.jpg`: 서로 다른 취향을 보여주는 크레 3마리의 사진 스트립. 실제 출품 개체나 특정 모프의 과학적 자료로 소개하지 않는다.
- `tour-v6.jpg`: 얼굴이 보이지 않는 샵 방문 분위기. 실제 매장·출연자 촬영으로 소개하지 않는다.
- `prep-v6.jpg`: 작은 크레를 카메라 앞에서 소개하는 준비 장면. 실제 방송 장비나 모든 참여업체의 절차를 보장하는 이미지로 쓰지 않는다.
- 가로 500px 본문 사이에 배치, 새 사진이 썸네일에 사용된다. 사람 얼굴·휴대폰/카메라의 가짜 UI·생성 한글은 사용하지 않는다. 고해상도 생성 PNG 원본은 `.codex/generated_images`에 보존하고 공개 자산은 JPEG quality 95로 저장한다.
- 전달본: `C:/Users/5600x/Desktop/전크자/output/promo-center/추가원고3종_20261008`.

### taste-v6.jpg

```text
Use case: ads-marketing.
Asset type: landscape 2:1 photographic banner embedded at 500 CSS pixels in a Korean crested-gecko breeder community article about discovering one's taste.
Primary request: a sophisticated photorealistic three-panel photographic strip of THREE DIFFERENT realistically small adult crested geckos, one individual in each panel, photographed with the same neutral warm ivory studio background and coherent natural light. Left a rich warm rust-orange and cream gecko; center a chocolate brown gecko with prominent cream-white side pattern; right a lighter tan gecko with fine natural speckles. These are realistic naturally occurring crested-gecko color patterns, NOT supernatural or oversaturated.
Composition: evenly balanced three seamless vertical panels, each gecko in side profile standing safely on a slender natural branch, entire body and much of tail visible, each individual appears a small reptile and not a giant head. The three animals are separate and not interacting. Natural anatomy, realistic eyes and toe pads. Modern breeder editorial photography, sharp clean subjects, soft background, restrained color, no film grain, no noisy AI texture. Adult hobbyist audience, no cute mascot treatment.
Text: none. No captions, no logos, no watermarks, no readable text, no people. High resolution, clean commercial photography.
```

### tour-v6.jpg

```text
Use case: photorealistic-natural.
Asset type: landscape 2:1 editorial banner for a Korean crested-gecko community article inviting readers to visit different breeders through a live broadcast.
Scene: a tasteful, clean professional reptile breeder shop. Wide horizontal camera view across a pale oak consultation table, softly lit glass vivariums with green plants along the wall behind it, no visible shop sign or writing. A Korean adult shopkeeper in a simple charcoal shirt is shown strictly from chest down at the right, gently presenting one SMALL realistic crested gecko on a white cotton-gloved palm above the tabletop. The animal's body is around 9 cm long, tail slender, normal anatomy. On the left, an adult visitor is shown only as a cropped shoulder and relaxed hand at table edge, listening. The shopkeeper's presenting gesture communicates a welcoming shop tour. No faces anywhere, no identifiable individual, no whole-body human caricature.
Style: authentic adult hobbyist documentary photography, quiet warm white and soft forest green, natural daylight, excellent clean detail, no childish props, no cinematic grain, no hyperreal exaggerated animal size, no cartoon or CGI look.
Text: none. No logos, no readable labels, no watermarks. Leave a little calm breathing room above table. High resolution.
```

### prep-v6.jpg

```text
Use case: photorealistic-natural.
Asset type: landscape 2:1 editorial photograph for a Korean breeder community article about preparing a crested-gecko live broadcast.
Scene: an intimate behind-the-scenes view of a neat modern tabletop filming setup. A black DSLR camera on a short tripod in the left foreground aims toward the right-center where two human WHITE COTTON GLOVED hands gently support ONE SMALL crested gecko over an ivory tabletop. Natural warm brown and cream pattern, normal slender tail and small reptile anatomy, about 9 cm body length. The person's charcoal sleeves are cropped at the forearms; no face or head visible. A modest softbox edge and out-of-focus potted green plant hint at a professional but approachable live studio. The camera's rear LCD must be dark and unreadable; no invented UI. No animal shipping box or packaging.
Composition: camera and hands form an elegant diagonal, the animal is small within the scene, varied from straight-on product hero photographs. Soft neutral daylight, ivory-gray palette with restrained plant green, natural photographic details, no grain, no noisy AI textures, no toy rendering. Contemporary adult breeder editorial quality.
Text: none. No logos, no watermarks, no readable text. High resolution.
```

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
