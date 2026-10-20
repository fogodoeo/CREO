# National pinball candidates and finishers

Scope: national-theme broadcast and its operator preview. Risk: medium presentation change, release checks for deployment. Applied better-interface (accessibility, layout, writing, typography, colors, UI) and emil-design-eng interaction guidance.

| Finding | Before | After | Verification |
| --- | --- | --- | --- |
| Finisher visibility | National theme skipped all rankings | Right column shows arrival order, name and finished/total ball count | Actual painter regression; isolated 1920×1080 broadcast |
| Last-five draw visibility | No indication of five current candidates | Gold ring and gold name chip with a star, recalculated from current standings | Reordering, first/rank/last modes, weighted identities and empty/end states |
| Overlap | Initial right column covered long ball labels | Shared layout reserves the right column in both scene and full-resolution label transforms | Transform regression and second real-screen pass |
| Privacy/readability | Running labels already omitted phone suffixes | Candidates and finishers retain name-only labels; final award retains suffixes | Actual label painters and real five-winner completion |
| Long lists | Removed list had no usable finish history | Follow latest arrival, bounded wheel scrolling, reset on next draw | 60 arrivals, wheel extremes, delayed update and next-draw regression |

Gold indicates current position, not a computed statistical probability or a guaranteed winner. For weighted entries, one representative ball per person occupies a candidate place, matching existing unique-person winner rules. Full identity including phone suffix remains the deduplication key. No physics, winner decision, session API, polling frequency or persistence behavior changes.

The left chat reserve, logo, top event title, roster introduction and final sponsor layout remain intact. Candidate changes are immediate, with no flashing or extra animation. Gold is accompanied by a star so color is not the sole cue. Charcoal rows use light names and numeric order. The list is a visual canvas overlay; screen-reader announcements and native PRISM composition are not verified.

Validation:

- `node --test test/pinball-candidate-display.test.js test/pinball-import-display.test.js test/pinball-winners.test.js test/marble-roulette.test.js`: 33/33, including eight new deterministic regression cases. Repeated after the final overlap correction.
- `npm --prefix roulette-app run check` and `npm --prefix roulette-app run build`: passed after final correction. JavaScript bundle 157.39 kB; CSS unchanged at 40.64 kB.
- `npm run check`: passed.
- `npm test`: 1464/1464. Initial restricted run could not connect to isolated localhost fixtures (`EACCES`); rerun with localhost access passed. The final subsequent change only reserves presentation space and was checked by the focused suite and browser.
- Desktop `python -m unittest discover -p "test*.py"`: 270/270.
- Browser: isolated fake 13-person draw, last five, ready → running → complete; gold/star labels, arrival list, final five names/suffixes. Production records were not used for tests.

Local evidence is stored under `scratch/national-session-20261019/pinball-candidates-*` in the desktop workspace. Release baseline: existing national session complete/revision 32, next session idle/revision 0. Deployment verification uses GET-only snapshots and byte/static comparisons; those results are recorded separately in the release evidence logs.
