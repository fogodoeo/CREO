# Pinball import choices and running labels

Risk: **Release** for deployment; implementation changes are limited to participant import and presentation. Physics, winner identity, persisted session/result schema and existing prize selection are unchanged.

## Scope and coverage

National pinball operator import flow and broadcast labels, using the existing vanilla TypeScript/SCSS application. Applied `better-interface` with its accessibility, layout, writing, typography, colors and UI domains. Repository guidance: `AGENTS.md` and `docs/LIVE_RELIABILITY_CHECKLIST.md`.

| Area | Before | Verified result |
| --- | --- | --- |
| Import choices — `roulette-app/index.html:137` | One amount-weighted import action | Separate “일반 불러오기 / 1명당 공 1개” and “금액별 불러오기 / 10만 원당 공 1개” buttons |
| Import identity — `roulette-app/src/auctionEntries.js:31` | Below-threshold buyers excluded | Person mode includes each named sold buyer once regardless of amount; amount mode retains aggregate thresholds; existing automatic imports retain amount mode |
| Running labels — `roulette-app/src/participantDisplay.js:4` | Names and phone suffixes competed for limited canvas space | Only running presentation omits trailing phone suffixes; ball, candidate and rank labels use the short name |
| Results | Full labels identified winners | Full labels remain in selection, final awards, copy/export and stored results; same-name people with different suffixes remain distinct |

Accessibility/layout: two native buttons, reachable in order by Tab, visible 2px focus outline, observed 148×58px hit area. Actual controller renders checked at 1280×720 and 320×800 with no clipped import controls. Descriptive sublabels remain readable and distinguish the actions without color.

Typography/color/UI: existing Pretendard and national tokens. Actual computed button foreground/background were `rgb(255,255,255)` / `rgb(23,60,116)` (10.85:1); helper text `rgb(193,209,235)` / same background (7.02:1). No new animation or primary-action emphasis. Empty/error messages identify the selected import rule; those states and disabled/loading interlock were exercised deterministically rather than visually fault-injected.

## Verification

- `npm --prefix roulette-app run check` — pass.
- `npm --prefix roulette-app run build` — pass.
- `node --test test/pinball-import-display.test.js test/pinball-winners.test.js test/pinball-national-stage.test.js test/marble-roulette.test.js` — 33/33 pass during iteration.
- `npm run check` and `npm test` — **1,449/1,449 pass** on the final build.
- Desktop: `python -m unittest discover -p "test*.py"` — **270/270 pass**.
- New deterministic coverage: duplicate buyers and low/zero amounts; preserved weighted thresholds and house filters; simultaneous imports cannot race; failure preserves the existing list and enables retry; mode-specific empty messages; actual ball/candidate/rank painters hide suffixes; actual final canvas award retains every suffix; same-name identities stay distinct.
- Isolated real-screen fixture: person import 13 people / 13 balls including a 50,000-won buyer; amount import 12 people / 13 balls; archived buyer excluded. Last-five result displays all suffixes. A person-mode run visibly shows names only on balls, candidate header and rank list.
- Screenshots in the parent workspace: `scratch/national-session-20261019/pinball-import-{admin,small,running,result}.png`.
- Production before/after checks use GET requests only and the evidence label `pinball-import`; preserve auction/shipment records and both existing pinball sessions, and compare deployed static assets.

Verdict: **Approve** for the inspected flow. Real PRISM application capture is not verified; browser rendering and actual canvas methods were checked. Phone removal is a display rule, not a change to stored participant identity. No production prize draw commands or notifications are sent by this verification.
