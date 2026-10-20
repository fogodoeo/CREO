# Jeolla/Chungcheong activation and P2 right anchor

Risk: **Release** (round lifecycle and persisted broadcast placement). UI scope: national P2 caption and its desktop placement editor; existing colors, typography, three-row structure and buyer/vendor flows retained. Reviewed with the previously applied better-interface domain guidance; no additional animation.

| Finding | Resolution | Verification |
| --- | --- | --- |
| Empty prepared rounds could not become the operating broadcast | Allow activation before item registration, retaining stale-selection and live-auction guards | Empty activation, duplicate/concurrent request, restart, storage conflict, live-source rejection |
| Activation then prevented approval import | Allow imports to draft/active rounds only while all items are unstarted and there is no shipping/live state | Late import, duplicate retry, reject after bid history, unchanged old checkout |
| P2 caption ignored horizontal edits and stayed 2% inside the screen | Persist `rightEdge` for P2 info; 100% is the right boundary, up to 120% permits deliberate cropping | UI save at 102%, reload, API normalization/persistence, manual/auto width |
| Width must grow toward the left | Anchor both automatic and manual caption width to the right; place resize handle on the left | Rendered short/long text and keyboard/drag geometry checks |

`rightEdge` defaults to the previous 98% for saved layouts that have no value, avoiding a surprise movement of old broadcasts. Today's round is configured separately at 100%. Other themes/slots retain their existing X coordinate. Width follows content when auto width is on; long rows retain the existing fit behavior and note presentation. The position input has an associated label and explains the screen-edge percentage. No color or motion changes.

Validation:
- `node --test test/national-round-operations.test.js test/broadcast-text-layout.test.js test/operator-studio-scope.test.js test/studio-layout-draft.test.js`: **25/25**.
- `npm run check`: passed.
- `npm test`: **1471/1471**.
- `python -m unittest discover -p "test*.py"` in desktop repository: **270/270**.
- Browser: national caption at 100% reached x=1280 on a 1280px viewport; 102% reached x=1305.59. Longer note grew width from 614.77px to 1274.41px while keeping the right edge. Three detail rows stayed visible. Editor uses a 1920x1080 preview; 102% survived save/reload, manual width and auto width checked.
- Isolated fixtures only; no production auction records used in tests.

Production deployment and activation evidence is recorded separately in `scratch/national-session-20261019/jeolla-right-release.md` in the desktop workspace. Native PRISM was not directly inspected. A channel-specific preview URL stays pinned to that channel; actual broadcast-router live URLs follow the operating channel. Today's approved/registered item count was zero at preflight; activation does not fabricate or approve submissions.

Post-deploy visual follow-up: the empty national editor used an unusually long placeholder name/note and no trait row. Replaced only that in-memory editor sample with `A01`, an explicitly labeled example vendor/note, and sample sex/weight/date. This makes the existing three rows and natural width visible before registration; the real broadcast/data are unchanged. At 190% font size the isolated 1920px editor preview visibly shrank the caption to its text. Focused `broadcast-text-layout`, `national-broadcast-panels`, `broadcast-themes`, and `broadcast-standby` tests: **24/24**; inline script syntax and UTF-8 checks passed. Full suites were not repeated for this sample-copy-only adjustment.
