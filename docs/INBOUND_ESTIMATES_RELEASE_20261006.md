# Vendor inbound calendar estimates — 2026-10-06

> Historical release record. The unselected-origin estimate policy below was replaced on 2026-10-09: see `INBOUND_DEADLINE_CORRECTION_20261009.md`. Do not restore the earlier regional deadline fallback.

Risk: **Release** (vendor-facing shipping dates, additive vendor-view fields, deployment).

## Behavior

- A saved departure shop, or a unique matching own shop, remains authoritative.
- Without a chosen departure, use the first verified nearby shop from the vendor's locality recommendations. Show an estimate and its reference shop, including a branch label for duplicate names.
- Without a locality, use a verified regional default where available; otherwise use the earlier preparation deadline among verified regional routes. Label this as a regional estimate.
- Viewing estimates never writes an origin preference or creates a transport booking. Invalid saved origins are not replaced. Known localities without a verified nearby route show the carrier confirmation link rather than borrowing a distant city's timetable.
- DODOSI allows broadcast-day arrival. PARGE retains the previous-day cutoff. Actual departure legs, vacations, unresolved route exclusions and past-deadline status still apply.
- Dates on the calendar, carrier cards and the date dialog share the same calculation. Dates for a following month's broadcast remain visible in the prior month.
- PARGE destination: 대구 크레오 / 010-5002-9163. DODOSI destination: 대구 크레용 / 010-2508-8240. The user supplied these contacts. Cards, deadline dialogs and submitted-entry delivery details expose `tel:` links.

## Verification

- `node --test --test-isolation=none test/broadcast-inbound.test.js test/broadcast-origin.test.js test/broadcast-inbound-estimates.test.js test/broadcast-inbound-ui.test.js test/national-broadcast.test.js`: **48 passed**.
- `npm.cmd run check`: passed.
- `npm.cmd test` with the bundled dependency directory in `NODE_PATH`: **1,003 passed**. Sandbox initially blocked Node child-process creation; rerun with the required execution permission passed.
- Desktop `python -m unittest discover -p "test*.py"`: **203 passed**. Initial sandbox temporary-file access failures disappeared when rerun with execution permission.
- After the final duplicate-branch caption refinement, `node --test --test-isolation=none test/broadcast-inbound-ui.test.js`: **5 passed**.
- UTF-8 fatal decoding and replacement-character scan: passed for all changed JS/HTML/CSS/JSON/test files. `git diff --check`: passed; no bulk encoding rewrites.
- Isolated local preview only: Seoul vendor with neither address nor origin shows both carriers on October 11 for October 14. DODOSI dialog identifies broadcast-day arrival. Incheon locality shows nearby reference shops; selecting the Cheongna departure moves DODOSI to October 12 and survives reload. No browser console errors observed.
- Real-screen checks at 390px and 320px: calendar labels, estimated-state text, contact links, dialog contents and wrapping remain visible; no horizontal overflow. Phone links are 44px high. Enter opens a deadline, Escape closes it and restores the trigger focus.
- Screen evidence: `outputs/inbound-estimates-20261006/seoul-calendar.jpg` and `seoul-deadline-contacts.jpg` in the desktop repository. These use synthetic vendor data.

## Interface review

Scope: the existing national-vendor calendar, shipping deadline cards and dialog, and shared destination contact presentation. Vanilla JS/CSS; existing color and type tokens retained. Rules consulted: repository `AGENTS.md`, `docs/LIVE_RELIABILITY_CHECKLIST.md`, `better-interface` and its six domain skills.

| Domain | Evidence | Result |
| --- | --- | --- |
| Accessibility | Native date buttons, dialog/summary controls, accessible estimated labels and named telephone links; Enter/Escape and focus return | Clear in inspected flow; assistive-technology speech not tested |
| Layout | Actual 390px/320px calendar and dialog; phone targets and long locality captions | Clear; 200% browser zoom and RTL not tested |
| Writing | Short estimate labels, reference shop/region, current same-day arrival notice | Missing/unselected origin no longer hides an otherwise calculable deadline |
| Typography | Existing scale retained, rendered 13px reference captions and 14px telephone links | No clipping in inspected states |
| Colors | Rendered muted text `rgb(98,109,123)` on white | Contrast 5.26:1; estimated meaning also conveyed by text |
| UI | Existing native disclosure/dialog and focus styling retained; 44px telephone targets | Clear in inspected flow; no new motion |

| Severity | Domain | Location | Before | After | Why |
| --- | --- | --- | --- | --- | --- |
| HIGH | Writing | `public/broadcast-inbound.js:23` | Unselected origin skipped calculation and hid all calendar marks | Nearby/regional estimate with explicit basis | Vendors can prepare before selecting a transport shop |
| MEDIUM | Writing | `public/broadcast-inbound.js:63` | Required arrival before the broadcast date for both carriers | DODOSI broadcast-day calculation and before-start notice | Matches the user's latest operational rule |
| MEDIUM | Layout | `public/broadcast-inbound.js:10`, `public/vendor-broadcast.js:17` | Destination had no contact action | Named, touch-sized telephone links | Vendors can contact the receiving shop from the relevant screen |

Verdict: **Approve for the inspected flow**. Loading/error and retry behavior have deterministic renderer coverage; wider portal flows were not reviewed here.

## Limits

Nearby means the existing city/district-based reference location, not an exact street-to-street distance. Timetables are reference data, not a confirmed carrier reservation or guaranteed arrival time. Unverified routes and missing/invalid selected shops still require carrier confirmation.

Deployment evidence is recorded separately after Render reports the release live and public asset hashes match the release files.
