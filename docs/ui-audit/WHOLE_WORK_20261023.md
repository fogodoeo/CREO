# One administrator workspace and whole-round settlement

Risk: Release. This batch changes derived API metadata, vendor remittance eligibility, past-entry editing and broadcast presentation. No migration or production record rewrite.

## Result

- One outer toolbar shows work title and selected round. The round selector opens on demand on desktop and mobile; tools/log out sit in More. The existing left folder menu remains.
- Embedded finance/status pages omit repeated page titles and navigation. Shipping uses the full content width until a winner is selected; opening and closing the editor keeps the existing task flow.
- Ended broadcasts prioritize financial work. Admin and vendor navigation distinguish the active page from numeric attention badges. Vendor landing includes authorized dated child rounds, with read-only derived counts and exact-round targets.
- Vendor past entries become read-only. New single, bulk and parent-photo edits fail after the date boundary; already committed matching requests replay safely after restart.
- Organizer remittance waits for broadcast completion, every sold item's destination and buyer payment, and pending shipping reviews. The UI then offers the entire remaining round amount. Prior partial receipts and pending reports remain intact; the server still validates the current account, amount and request identity.
- Dice video controls, compression and playback removed at the owner's request. Numeric result preserved; legacy stored video assets untouched.

## Verification

- `npm run check`: pass.
- `npm test -- --test-concurrency=4`: **1816 passed, 0 failed** (`whole-work-server-release.log`). Initial full run exposed two outdated extracted-function mocks and an unpinned historical test clock; corrected and rerun. An additional date-boundary retry regression then prompted moving the new edit guard after the durable receipt lookup; final full run includes that fix.
- Desktop `python -m unittest discover -p "test*.py"`: **279 passed** (`whole-work-desktop.log`). No desktop source changes or running-app restart.
- Dedicated focused coverage: whole remittance readiness and residual amounts, preserved receipts, duplicates/concurrency/restart, failed preparation without notifications, foreign winner/vendor records, archive scope, authorization, reordered badge responses, retry states, selection retention, previous-day reads and blocked new writes.
- Strict UTF-8 and changed inline/standalone JS parse: pass; `git diff --check`: pass. Changes remain focused, without bulk encoding/line-ending rewrites.
- CUA local real browser, isolated SQLite and fake contacts/accounts only: desktop 1280px and actual 320px iframe; one toolbar, collapsed round selector, open/close round selection, keyboard Tab, More menu, full-width winner list, editor open/close, organizer list and retained account/confirmation controls. No payment or notification sent to real users.
- Vendor 320px: automatically opens buyer payment with one pending buyer; organizer tab shows 40,000 won estimate, reason and disabled report without bank. Marking the synthetic remaining buyer paid switches to organizer work, displays the same full 40,000 won and account, enables whole-amount report. Reload preserves the scope and attention count.
- Layout, progressive disclosure, accessible labels/current-page state, clear action copy, existing type scale, semantic count colors and 44px controls reviewed using better-interface and its domain skills. No new animation.

Evidence under `scratch/admin-home-review-20261022/`: `one-toolbar-admin-320.png`, `whole-remittance-preparing-320.png`, final desktop screenshot and release before/after snapshots. Production verification is recorded after deployment.

Production `250d660`: authenticated `/main` shows the single toolbar and collapsed round chooser (`one-toolbar-organizer-live.png`). Read-only checks at 2026-10-23 14:36 UTC confirm durable healthy storage, no outbox backlog, 72 vendors, and unchanged item/shipment/broadcast hashes in all four sampled channels. Public static checks match the commit; unauthenticated `/index.html` correctly redirects to `/main` and serves `operator-login.html`, so its login gate was compared instead of incorrectly treating it as the authenticated HTML. The 10/21 settlement response changed since the earlier 10:05 UTC baseline: two existing vendor reports were confirmed at 10:21 UTC (311,000 and 248,000 won). Other settlement hashes are unchanged. No financial mutation was performed by this release verification.

## Limits

200% zoom, full keyboard and screen-reader journeys across every page remain unverified. Bank transfers still occur externally; the product controls the amount/instructions/report, not the user's banking app. Separate Parge dispatch continues its existing top-level window requirement for the installed extension. Broad UX work remains in progress.
