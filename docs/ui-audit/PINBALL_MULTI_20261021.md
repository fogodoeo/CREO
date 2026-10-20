# National pinball: operator layout and multiple winners

Risk: **Release** (winner selection, persisted result contract and deployment). Scope is pinball only. No auction, payment, shipment, notification or settlement records are mutated.

## Behavior

- The operator can choose first arrivals or last survivors and 1–20 winning people. Rank selection remains a single winner.
- Weighted balls are preserved; the same participant label receives only one winning place. Last-survivor results are an unordered set, displayed in name order.
- National auction import uses the authenticated current-round workspace. Public entries contain the display name and phone suffix only; missing numbers are explicitly marked.
- Server validation recomputes the winner set and verifies ball multiplicity, finished-order prefix, run ID and command ID before persisting. Duplicate completion remains idempotent.
- Completed results retain all winners through reload/restart. A new preparation clears the visible old result, without deleting history.
- Imported identity is the display name plus phone suffix. Manually entered duplicate labels are treated as the same person; operators must distinguish any identical labels before drawing.

## Interface review

Applied `better-interface` and its accessibility, layout, writing, typography, colors and UI domain skills; supplementary `emil-design-eng` motion guidance.

| Before | After |
| --- | --- |
| Narrow overlaid controller competed with the broadcast artwork | Persistent wide operator panel; participants and draw settings side by side; single column at narrow widths |
| URL and secondary settings consumed the top of the screen | Direct broadcast-open action; PRISM address/settings in a disclosure |
| Single winner presentation | Explicit winner count and rule; all winners in result, copy, export and restored view |
| Left partner banner cropped from the background | Removed; owner-supplied national, Silktree and Parge logos in the masthead |
| Long winner lists could require scrolling on a passive display | Two balanced columns above five winners; 20-name broadcast checked |

- Accessibility: native labels, radio controls and disclosures; 44px controls; visible keyboard focus; reduced motion still bypasses the decorative clip.
- Layout: controller 1280×720 and 360×800; broadcast 1920×1080 fitted into the review viewport without overflow.
- Writing: “마지막 생존”, “당첨 인원”, “마지막까지 남은 5명”; completed count shown instead of implying one representative winner.
- Typography/color: existing Pretendard; readable name/last-four pairs; national blue, yellow and supplied logos; input errors include text.
- Interaction: changes invalidate the prepared fingerprint; invalid/impossible counts disable starting. Stinger never gates physics, commands or result persistence.

## Verification

All runtime tests use isolated fixtures, fake people/phones and fake notification services.

- `npm --prefix roulette-app run check` — pass.
- `npm --prefix roulette-app run build` — pass; regenerated fingerprinted static assets.
- `node --test test/pinball-winners.test.js test/pinball-national-stage.test.js test/pinball-remote-controls.test.js test/pinball-preview.test.js test/marble-roulette.test.js` — 37/37 pass during iteration.
- `node --test --test-name-pattern=pinball test/platform-api.test.js` — 4/4 pass during iteration.
- `npm run check` and `npm test` — **1,441/1,441 pass** on the final code.
- Desktop: `python -m unittest discover -p "test*.py"` — **270/270 pass**.
- Invariants: weighted duplicates; same-frame exits; multiple first/last winners; invalid counts/results; duplicate/concurrent prepare/start/complete; stale completion; persisted reload; next preparation; channel isolation; legacy single-winner compatibility.
- Real browser: import 12 current-round people / 13 balls with suffixes while excluding an archived fixture; last-five draw matches administrator and broadcast; reload retains the five names without replay; last-20 draw shows all names in two columns; new preparation clears prior winner card; mobile controls and persistent footer verified.
- Screenshots retained in the parent workspace `scratch/national-session-20261019/pinball-multi-{admin,winners,twenty,mobile}.png`.

Production release checks are GET-only. They compare auction/shipment record identifiers and totals, pinball session state, and deployed static hashes. Legacy default winner-count/result-list fields are normalized before comparing session hashes.

Residual limits: real PRISM rendering and video recording were not exercised in PRISM itself. Long custom display names remain an operator input constraint (40 characters). Tests establish the exercised behavior; they do not guarantee every external browser/network condition.
