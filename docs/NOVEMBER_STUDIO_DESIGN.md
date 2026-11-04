# November studio designs

## Current C·LAB revision — 2026-11-04: metal plates

The existing `clab-gallery` ID now displays as **씨랩 메탈**, preserving saved channel selection. This supersedes all porcelain/sage C·LAB descriptions below. Jjunine remains unchanged.

- P1 host/event/ticker plates, P2 lot/progress/bids/price/notice/parent captions and P3 summary use a dark machined steel surface, restrained static grain, thin silver bevel and shallow mount shadow. No new animation or raster text.
- Surface stops: `#20262e`, `#303944`, `#242b34`, `#1b2129`; body `#f2f4f7`, muted `#bfc8d2`, silver accent `#d1dce7`. Leader surface `#415263` → `#4b5d70` → `#354657`; bright text remains on the leader. The P3 unit uses the brighter silver accent on the leader.
- Name first, smaller role below. Existing placements, font scaling, dynamic number formatting, ranking order, camera transparency and record state stay shared. The CREYON spectrum remains a small masthead decoration only.
- Conservative contrast checks against the brightest textured plate bound `#333c47`: body 10.15:1, muted 6.61:1. Leader body against `#4b5d70`: 6.15:1. The silver rank tab uses dark `#151b23` text: 12.45:1.
- Real local browser inspection: P1/P2/P3 at the 1920×1080 inner canvas, P2 editor extra panels, and Jjunine P1 regression. The all-slots editor deliberately shows existing overlapping optional slots; no saved positions were changed. Screenshots are in `Desktop/씨랩/방송소스/메탈UI/P1.png` through `P3.png` using fictional preview data.
- Focused theme/layout/bid/summary tests: 28 passed. `npm run check` passed. Full suite after incorporating upstream main: `node --test --test-concurrency=4`, 1,965 passed. An initial unrestricted run had one unrelated buyer-library UI wait failure; its isolated eight tests and the bounded full rerun passed without source changes. Production camera keying and on-air PRISM capture are not verified.

## Previous revision: color Instagram icons and broadcast notices


Only the Instagram icon gets a pink/purple/orange/yellow gradient tile and a white camera outline; handles stay dark and readable. This brand accent does not encode auction state. The host layout, names and state are unchanged.

Two static 1920×1080 PNG assets are provided under `public/assets/jjunine/`: `opening-1920x1080.png` and `standby-1920x1080.png`. Editable source: `broadcast-notice.html` (`?scene=opening` selects the opening copy). They use the original logo, local Pretendard font, white/silver plate system and black event panel. PNGs were captured directly from the browser at native size, with no resampling. These are manually selectable broadcast images; no automatic P1/P2 switch behavior is added.

Copy distinguishes pickup locations (대구 크레오 / 광주 쭌이네) from carrier origins (광주 쭌이네 → 도도시, 대구 크레오 → 파르게). Quiz copy advertises chicken, coffee and other prizes without implying every participant wins. Opening title: 잠시 후, 방송이 시작됩니다. Intermission title: 잠시 후, 방송이 이어집니다. Both versions were visually inspected at 1920×1080. No new motion.

## Previous revision: Instagram host identities

Revision 4 uses the generated `쭌이네_인스타_태그_레퍼런스.png` reference. The first host is **이승준 / @jjunes_9**, the second **크레초아 / @cre.coa05**, as supplied by the user. The existing host-role field holds the handle. In the Jjunine theme only, a valid @handle renders with a monochrome Instagram outline icon and an accessible Instagram label. Plain roles and other themes keep their existing rendering. Handles remain escaped display text, with no external requests or navigation.

Host plates now have two lines: bold name, then icon + handle at 52% of the name's font size. The previous mascot, JJUNINE overline and LIVE endcap are removed from host plates. The original mascot remains in the masthead. The item tag also uses the simpler black side stripe. Silver seams, 6px outer / 4px inner corner tokens, a shallow black bottom edge and a 12px left stripe unify the host, event, item, ticker and ranking plates. Bid leader remains black with white text. No new animation.

Actual P1/P2/P3 renderings were inspected. Both handles fit without truncation; at the saved 80% host scale, the 31.2px declared handle text renders at about 25px on a 1080p canvas. Saved screenshots: `쭌이네_인스타_P1.jpg` through `P3.jpg`. The background is the earlier room asset. C·LAB rules and auction logic are unchanged.

## Previous revision: Jjunine monochrome

Revision 3 supersedes the Jjunine brass-plaque specification below. The user's official identity is a white surface with a black character. Generated reference: `Desktop/전크자/output/november_broadcast_design/쭌이네_모노크롬_태그_레퍼런스.png`. This reference guided real HTML/CSS components; no generated text is baked into live names or amounts. C·LAB retains revision 2.

- White lacquer faces (`#ffffff`), ink text/accent (`#101114`), muted text (`#52565e`), cool silver rules (`#d1d4d9`) and frame (`#b6bbc2`). Corners are 3px outer / 1px inner. A narrow black bottom edge gives the plates depth.
- Original logo copied unchanged to `public/assets/jjunine/official-logo.png`. Native image elements keep the outline clear at small sizes. Host and item logos are decorative; the masthead logo has the shop name as alt text.
- Host plate: official logo at left, small JJUNINE kicker, bold name, smaller role, black LIVE endcap. Event plate has a black date endcap. Ticker uses a short black rule and black endcap.
- P2 leader: black face, white text, white rank tab. Second bid: white face, black text. P3 uses a white board, quiet gray leader row and aligned tabular amounts.
- Existing placements, Pretendard, price formatting, channel state and motion remain unchanged. Theme ID remains `jjun-boutique`, so saved channel selections continue working.
- P1/P2/P3 rendered locally at a 1920×1080 inner canvas. Saved monochrome screenshots use example names and bids. The warm room shown behind the overlays is the earlier background asset, not a newly generated room.

Revision 2 was deployed before this revision. Historical preview/deployment statements below describe that earlier design phase only.

## Scope and status

Design preview for the November 3 Jjunine broadcast and November 5 CREYON C·LAB recessive-morph special. Two selectable visual themes, `jjun-boutique` and `clab-gallery`, restyle the existing shared P1/P2/P3 renderer. Every rule in `public/broadcast-studio-premium.css` is scoped to these two theme IDs. No auction rules, renderer structure, production channel configuration, historic records, shipping promises or notifications change. The local preview uses a disposable SQLite database with fictional names and amounts. Nothing is deployed.

Revision 2 replaces the shared "same cards, two colours" look with two distinct identities that come from each background.

## Visual system

Values are hex, derived in OKLCH. Contrast is WCAG 2, measured on the surface each pair actually renders on.

| Role token | Jjunine boutique | C·LAB gallery |
| --- | --- | --- |
| `--studio-panel` | `#23160e` espresso | `#f8f8f5` porcelain |
| `--studio-text` | `#faf3e6` (15.96:1) | `#151d1a` (16.14:1) |
| `--studio-text-muted` | `#ccbba5` (9.41:1) | `#4d5c56` (6.62:1) |
| `--studio-accent` | `#e1ba82` champagne bronze (9.68:1) | `#224f3e` deep sage (8.75:1) |
| `--studio-row` (rank 1) | `#372619` | `#e1ede6` |
| `--studio-rule` | champagne at 28% | `#d1d8d3` |
| Corners | 10px outer, 4px inner | 3px outer, 2px inner |

**Jjunine — brass plaques.** Each plaque has a champagne hairline inset 6px from its edge (inset box-shadow rings, so the corners stay concentric at 10 → 4px). This echoes the raised bronze sign and walnut niches. Host captions, ticker and P3 heading are centred like shop signage. Lozenge marks (◆) act as the hallmark. The leading bid is a champagne plate with a dark inner hairline.

**C·LAB — museum wall labels.** Porcelain labels on brushed steel with square corners, a crisp mount shadow, ink type and left-aligned captions led by a short sage rule. The six CREYON ring colours (sampled from the wall logo: `#e04038 #f08444 #f0c434 #749c42 #3884bc #8460a4`) appear once, as a small swatch in the masthead. They are decoration only and never mark state. The leading bid is a solid sage plate. On P3 the leader's rank sits in a sage square under an ink rule.

Both themes keep Pretendard, existing number formatting, editable placements and state transitions. No new animation. Only the top bidder gets a filled accent.

## Screens

- **Masthead (P1, P3):** one plate at the top left with kicker (shop), event title and date + weekday (`11.03 화요일`). The title comes from `broadcastDefaults.notice` and the date from the round's auction date. Both are escaped. An unparseable date is shown as entered without a weekday, and with no date the block is omitted. Long titles truncate with an ellipsis at 62% of the frame width. It is hidden on P2 and in P3 pinball mode.
- **P1:** two host captions, role above (24px) and name below (48px), centred on 30% and 70%. The ticker stops short of the side shelves.
- **P2:** progress top left; item label top right (lot 56px, traits 42px, morph note 37px in accent, shop 30px muted); two bids bottom left; ticker at the bottom. The central camera area stays clear. Note and shop sizes scale once, through the slot's font-scale zoom. Previously they were scaled twice and the note rendered at 18px.
- **P3:** summary board with aligned amounts. The rank-1 row is tinted and its rank and amount use the accent.

Rendered sizes are measured at the preview placements on a 1920×1080 canvas.

## Preview placements

Exported from `tools/november-studio-preview.cjs` for deliberate channel setup. The theme never overwrites a saved layout.

| Slot | x, y, w, h (%) | Font scale |
| --- | --- | --- |
| `p1-host-1` / `p1-host-2` | 19, 76, 22, 10 / 59, 76, 22, 10 | .8 |
| `p1-ticker`, `p2-ticker` | 14, 90, 72, 6 | .65 |
| `p2-progress` | 4, 5, 7, 8 | .7 |
| `p2-info` | 16, 5, 80, 11 | .7 |
| `p2-bidders` | 4, 66, 28, 19 | 1 |
| `p2-parents` | 78, 65, 18, 20 | .7 |
| `p3-board` | 22, 20, 56, 66 | .8 |

The P1 example ticker no longer repeats the date, because the masthead now carries it. Unknown host names stay unset in production. Preview names are examples only.

## Background

Jjunine uses its supplied official mascot as the reference for raised bronze signage, warm stone and walnut display niches. Front-facing composition, no table or chairs, calm foreground for two chroma-keyed seated hosts. Generated using the built-in image generation tool; the delivered native image is **1672×941**, not native 4K. Fit it to the 1920×1080 video canvas. The source logo should be visually checked again at final production scale if exact outline fidelity is critical.

The C·LAB review uses the user's supplied existing CREYON wall image. It is only a compositing reference; no new C·LAB room asset was requested or generated.

## Review and use

Run `node tools/november-studio-preview.cjs`, then open `http://127.0.0.1:4411/`. Check code changes on the live-rendered `/screen?channel=jjunine&page=1` (or `clab-1105`, pages 1–3). `/review/` only serves previously saved screenshots from `Desktop/전크자/output/november_broadcast_design`, which still show revision 1. This is a local design fixture, never a live broadcast endpoint. Actual broadcast overlays require deploying the theme source and selecting `jjun-boutique` or `clab-gallery` on the intended channel. Keep the previous October 29 C·LAB round intact.

For compositing: shop image below → keyed host camera → transparent UI above. P2 uses the close-up camera below the same transparent UI. No green is baked into the background image: the camera's green screen is what gets removed.

## Verification (revision 2)

- All six real `/screen` renderings were captured at a 1920×1080 inner canvas, plus 1080p detail crops of the masthead, host captions and item label.
- P2 was also captured in editor mode (`auction-live.html?editor=1`, all P2 elements on) and in the waiting scene. The editor's dashed outlines still show.
- Long-text stress: title, kicker, host name and role, ticker, morph note and shop name were injected into the rendered DOM. Every case truncates or fits inside its plate with no overflow.
- Scope audit: all 71 rules in `broadcast-studio-premium.css` target only the two theme IDs or the masthead element, and no `:is()` contains a pseudo-element.
- `test/broadcast-themes.test.js` and the studio layout, settings and scope tests pass.

Not verified: real host camera lighting and keying, extreme operator placements, the sold-notice state in a live round, and on-air OBS output. Production was not deployed or modified.
