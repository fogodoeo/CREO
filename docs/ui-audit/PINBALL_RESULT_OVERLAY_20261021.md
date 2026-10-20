# National pinball result overlay

Scope: the transition from a running national draw to its result card, including restored results and narrow-screen access. Medium presentation risk; release verification applies to deployment. Uses better-interface and its six domain skills, with emil-design-eng motion guidance. Repository guidance: AGENTS.md and LIVE_RELIABILITY_CHECKLIST.md.

| Severity / owner | Finding | Before | After and evidence |
| --- | --- | --- | --- |
| Medium / layout | Completion looked like a different screen | Opaque result surface replaced the visible playfield | Transparent wrapper, centered translucent card, retained finish scene (`roulette-app/assets/national.scss:118`; `roulette-app/src/rouletteRenderer.ts:238`) |
| Medium / UI | Exposing the playfield could reveal a second canvas award | Canvas recording award exists underneath the DOM result | A single frame is copied before the recording award is painted; repeated renders cannot copy the award into the backdrop. Regression exercises both rendering paths (`roulette-app/src/rouletteRenderer.ts:226`). |
| Medium / typography | Ball labels compete with the result through transparent glass | Running labels remain visible at the finish | 82% charcoal card with 6px backdrop blur; final names and suffixes remain crisp. Browser screenshot verifies five winners (`roulette-app/assets/national.scss:124`). |
| Medium / accessibility | Long results need reachable scrolling | Large result content was sized for the entire field | Named, keyboard-focusable result region, visible focus ring and bounded scrolling. At 320px, End reaches both partner logos and the final winner (`roulette-app/index.html:40`; `roulette-app/assets/national.scss:133`). |
| Low / UI | Sudden appearance breaks visual continuity | Short opacity-only reveal over an opaque scene | 260ms opacity/8px entrance with custom ease-out; only enabled for no-preference motion settings. The playfield does not move (`roulette-app/assets/national.scss:269`). |

Coverage: layout, typography, visual polish and focus inspected at 1920×1080 and 320×800; five and twenty winners; ready/running/complete and restored complete. Copy remains unchanged. Worst-case text contrast over a white underlying scene: names 8.94:1, supporting text 4.92:1, gold 5.52:1. Reduced-motion behavior checked in CSS and existing stage tests; OS preference toggling, speech output, 200% browser zoom and native PRISM were not directly verified.

Verification:

- `npm --prefix roulette-app run check`: passed.
- `npm --prefix roulette-app run build`: passed; JS 157.94 kB, CSS 41.61 kB.
- Focused candidate/import/stage/roster/static tests: 44/44. Static bundle checks repeated after the final build: 12/12.
- `npm run check`: passed.
- `npm test`: 1466/1466 with isolated localhost fixtures.
- Desktop `python -m unittest discover -p "test*.py"`: 270/270.
- Subsequent cosmetic adjustments (blur, card width and focus markup) received another build, focused checks and browser inspection; no state logic changed after the full suite.
- New regressions cover one capture per winner, reset/new draw, unchanged other themes, frame capture before the recording award, missing/failed canvas contexts and no repeated frame-loop retry.
- UTF-8 and `git diff --check`: passed.

The frame is presentation-only and stays in page memory. A full reload restores the saved winners without replaying the draw; it does not reconstruct the prior physical positions. The recording canvas still renders its own translucent award. No auction state, draw decision, API polling or server persistence changed.

Evidence: desktop workspace `scratch/national-session-20261019/pinball-overlay-*`. Deployment checks use GET-only snapshots of both pinball sessions and all six auction/shipping scopes. Production baseline: national complete/revision 38; next session idle/revision 0.

Verdict: approve within the inspected browser scope.
