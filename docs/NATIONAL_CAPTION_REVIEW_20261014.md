# National broadcast caption review — 2026-10-14

## Scope and coverage

The user supplied a National Singing Contest participant caption: white name area,
grey number disc, teal/blue-to-magenta ribbon, mint edge and restrained lower shadow.
That reference replaces the earlier beige card treatment. Scope: the national-stage
theme on the existing P1 presenter, P2 auction and P3 cash-summary overlays. Existing
HTML render functions, Pretendard, plain CSS, saved layout placements and polling are
retained. No auction, payment, vendor or settlement records are migrated.

Conventions: repository AGENTS.md and docs/LIVE_RELIABILITY_CHECKLIST.md. The
better-interface review used its six domain skills; emil-design-eng was supplementary.
Risk: **medium** (theme-specific rendered markup and CSS). Production verification is
read-only. Camera backgrounds in the evidence are compositing previews; no background
image is baked into the transparent overlay.

| Domain | Evidence inspected | Result |
| --- | --- | --- |
| Accessibility | Escaped names, full long names, text/rank state labels, calculated text contrast, reduced-motion regression tests | Fixed clipping; text pairs meet 4.5:1 even at the ribbon's brightest gradient stop |
| Layout | P1 one/three hosts, actual saved two-host placements; P2 empty/one/two/replaced bids, sold, parent caption; P3 empty/five rows/paging; 1920×1080 and 1280×720 | Fixed missing host height, unplaced price overlap and lower-caption overlap |
| Writing | Name, number, amount and role labels; national sold caption | `낙찰!` replaces the English sold label in this theme; no promotional copy added |
| Typography | Existing Pretendard, variable weights, Korean wrapping, two-line result names, large amounts | Long bidder and summary names remain readable in the checked frames |
| Colors | White name/grey rank/ribbon tokens, opaque surfaces and contrasting borders | Reference palette adopted; camera remains transparent |
| UI polish | Pill edges, shared name/number/amount pattern, native update animation, parent-caption font scale | Same caption language across P1/P2/P3; no new animation |

## Findings addressed

| Severity | Domain | Location | Before | After | Why |
| --- | --- | --- | --- | --- | --- |
| HIGH | Layout | public/broadcast-national.css:10 | Size-contained unplaced extra host cards had no definite height; text computed to 0px | Definite host height, fallback placements, length-based type fitting | Presenters disappeared when multiple host slots were used |
| HIGH | Typography | public/broadcast-national.css:85, public/auction-live.html:185 | Long bidder names were clipped within the new white name section | Render name length as a numeric CSS variable; fit and wrap only national captions | Viewers cannot hover a video to recover missing names |
| HIGH | Typography | public/broadcast-national.css:116 | A long P3 name extended below its row at native 720p | Size query per row, two-line height budget, responsive gaps | Full text must remain inside the visible row |
| MEDIUM | Layout | public/broadcast-national.css:53, public/auction-live.html:191 | A multiline caption at the saved lower position ran into the ticker | Bottom-align lower captions to their saved box; compact vertical spacing; grow upward | Maintains a clear separation between item details and running notices |
| MEDIUM | Layout | public/broadcast-national.css:97 | An unplaced price card occupied the bid-list area | National fallback price placed centrally; explicit saved placements still win | Prevents two amounts from covering each other in the default preview |
| MEDIUM | Colors | public/broadcast-national.css:3 | Beige cards did not match the supplied TV caption | White identity, grey number and teal-to-magenta ribbon tokens | Implements the user's concrete visual reference |

The existing base/pixel layout behavior was not redesigned. Their national-only
wrappers and palette are absent when those themes are selected. Their old fallback
item/price placement can still overlap in the synthetic default layout; this is
outside the requested national theme and is not a new behavior.

## Verification

- `npm run check`: passed. Inline scripts in auction-live.html compiled separately
  with `vm.Script`; preview helper passed `node --check`.
- `node --test test/national-broadcast-panels.test.js test/broadcast-item-notes.test.js test/broadcast-bidders.test.js test/broadcast-bid-motion.test.js test/broadcast-summary.test.js test/broadcast-parent-photos.test.js test/broadcast-themes.test.js`: **31 passed**.
- Final `npm test`: **1,125 passed, 0 failed**.
- Strict UTF-8 decoding and U+FFFD scan: all six changed source/test/helper files passed.
- `git diff --check`: passed. No bulk Korean re-encoding or line-ending rewrite.
- Browser checks used isolated SQLite fixtures and fake SMS. No production auction
  records were used as test records. Only saved geometry and visibility settings were
  read to reproduce the actual production layout.
- P2 live update: one waiting label, then one bidder, then two; a third higher bidder
  replaced the second place without reloading the iframe. Rank and amount regressions,
  same bidder, duplicate amounts, new item and reduced motion passed focused tests.
- 720p summary regression: before, the long name exceeded the row; after, the complete
  name fits. 1080p saved lower-caption regression: long caption top 791px, previous bid
  list bottom 778px; caption bottom 940px, ticker top 972px. No overlap in these states.
- Evidence outside the checkout: `scratch/national-release-20261014/national-caption-p1.png`,
  `national-caption-p2.png`, `national-caption-p3.png`, `caption-full-tests.log` and
  `caption-production-verification.json` (written by the read-only release check).

Not verified: the user's OBS instance and capture hardware. Arbitrary future manual
placement combinations and unbounded text lengths are not guaranteed to fit. This is
a 16:9 broadcast overlay, not a 320px interactive mobile page.

## Verdict

**Approve** for the reviewed national P1/P2/P3 states. No HIGH finding remains in
those states. Release completion additionally requires the deployed static hashes and
health endpoint to pass the read-only production check.
