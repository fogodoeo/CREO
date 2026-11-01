# November studio designs — 2026-11-02 (revision 2)

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
