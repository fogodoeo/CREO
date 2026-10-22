# Administrator navigation and Parge cost preview

The `/main` administrator entry now groups work in an expandable left navigation.
Existing task pages remain responsible for their own forms, validation and writes.
The shell holds the selected program, channel and archive in its URL. Choosing a
work round does not activate the live broadcast channel.

## Scope

- Global: shared vendor directory, vendor access administration, national promotion
  planning, shipping rates.
- Selected round: intake review, participating vendors, item ordering, broadcast
  studio, pinball, captures, checkout, shipping, change approvals and settlement.
- Archived rounds retain the existing financial routes with `archive` preserved.
  Unsupported operations show an unavailable state rather than another round.
- National intake routes use the common reception channel plus the selected
  broadcast date. CLAB intake keeps its own channel.
- Shared vendor identity comes only from recorded directory memberships. Equal
  names or numbers are not merged. The global endpoint is administrator-only and
  read-only, includes archived participation, and bounds concurrent catalog reads
  to four channels.

## Page integration

The shell uses a same-origin task frame, preserving each page's implementation.
An opt-in bridge removes duplicate navigation and forwards known administration
links to the shell. Messages are checked against the exact frame and origin.
Standalone tools and public broadcast links open separately. Broadcast activation
remains an explicit studio action. Form edits are guarded on menu/round changes and
browser back navigation. Buyer/vendor entry URLs are unchanged.

Parge dispatch remains a top-level page, with the same navigation added around its
existing document. The installed extension matches that top-level URL and does not
inject into iframes; keeping the document native preserves its current contract.
The extension, its permissions and dispatch manifest are unchanged.

## Partner fee preview

For each existing recipient/destination group:

`round(base shipping fee × 0.5) + (animal count − 1) × 7,000 KRW`

Base fees come from the current shipping rate catalog for the Daegu CREO origin.
The preview lists newly selected groups, checking/cart groups, and their combined
estimate. Booked and released batches are excluded from the pending payment total.
Missing, invalid or ambiguous rates are flagged and never silently counted as zero.
Historical batch amounts are explicitly current-rate estimates, not payment receipts.
Buyer shipping charges, actual payment records and declared animal sale values are
not changed by this preview. Dispatch reads `workspace?scope=round` and rejects an
archive query rather than falling back to the current round.

## Validation (2026-10-23)

Risk classification: **release**, because this changes common operational navigation
and is being deployed. Auction/payment mutation handlers and broadcast protocols are unchanged.

- `npm run check`: passed.
- `npm test`: final run **1,487 passed, 0 failed**. An earlier sandboxed run had 11
  localhost connection failures; those 11 passed with local-network permission, and
  the final complete run passed with that permission.
- `node --test test/operator-shell.test.js`: 4 passed after the final CLAB intake
  route refinement.
- `node --test test/parge-dispatch-ui.test.js`: 2 passed after hiding a redundant
  single-date picker.
- Desktop `python -m unittest discover -p "test*.py"`: 270 passed. The initial
  sandbox run could not write temporary files; the permitted rerun passed.
- Changed JavaScript syntax checks, strict UTF-8 decoding, U+FFFD scan and
  `git diff --check`: passed.
- Deterministic checks cover explicit/archived scope, stale loads, global vendor
  identity, admin access, read-only navigation, foreign-frame messages, unsaved form
  navigation, standalone links, partner discounts, missing rates, cart/booked totals,
  failed reloads and archive rejection. Existing dispatch idempotency, concurrency,
  storage failure and restart tests passed in the full suite.
- CUA rendered checks used only synthetic local data: global vendor list → exact
  membership editor, national → CLAB selection, broadcast studio, Parge selection
  totals, desktop navigation, and 320px mobile menus/fee cards without horizontal
  page overflow.

Preview: `node tools/national-round-preview.cjs`, then
`http://127.0.0.1:4369/main?channel=national-cre`.

Deployment was authorized on 2026-10-23 after local validation. Production health,
static assets, authentication and read-only round data must be verified after rollout.
The preview was not used to place a real transport reservation or make a payment.
Final partner charges still depend on Parge's checkout.

## Settlement entry correction (2026-10-23)

The home previously called the print page "정산·인쇄", while the actual organizer
receipt page was absent from the sidebar. The fourth home action now opens
**업체 정산·입금 확인**. The finance group distinguishes buyer payments, vendor
remittances, shipping, approvals, carrier dispatch, settlement exports and printing.
The same receipt route is available from the native Parge sidebar and standalone
platform-page navigation. Current and archived links retain both `channel` and
`archive`; closed financial rounds remain accessible while other broadcasts run.

### Navigation inventory

| Group | Required destinations |
| --- | --- |
| 업체 관리 | Global vendor directory, shared vendor access administration |
| 방송 일정 | Round preparation/activation, bookings, promotion management |
| 경매 운영 | Entry review, item order, participating vendors |
| 방송 도구 | Studio and layout controls, pinball, captures, capture setup |
| 낙찰·배송·정산 | Buyer payments, organizer receipts, delivery status, change approvals, Parge, settlement export, print |
| 설정 | Channel settings, shipping rates, BAND monitor, archived results |

`test/operator-finance-navigation.test.js` asserts this independent inventory of
23 required destinations. Merely iterating existing menu entries would miss a
missing feature. Optional survey links continue to follow channel configuration.
Studio-specific editors and banner controls stay in the studio; buyer/vendor
access and public broadcast pages keep their separate entry flows.

The audit also found that the print page set its Parge channel only in an onclick
handler. It now builds the complete link after resolving the channel, so copying
the link or opening a new tab retains its scope. Unsupported and archived dispatch
links have no href. Capture setup and BAND monitor now have explicit menu entries.

### Verification and limits

Risk: **release** (shared navigation deployment). No receipt amounts, confirmation
states, notification actions, authentication permissions or broadcast state
handlers were changed.

- `node --test test/operator-finance-navigation.test.js test/operator-shell.test.js test/operator-home.test.js test/operator-pipeline.test.js test/platform-pages.test.js`: **67 passed**.
- `npm run check`: passed; all changed JavaScript also passed `node --check`.
- `npm test -- --test-concurrency=4`: **1,500 passed, 0 failed**.
  The first unrestricted run caught the old home-label assertion, which was updated
  for the corrected workflow. A subsequent run had a promo image worker exit after
  its assertions passed; its six tests passed in isolation and the final complete
  run passed with four workers. No application assertion remains failing.
- Desktop `python -m unittest discover -p "test*.py"`: **270 passed**.
- Strict UTF-8 decoding, U+FFFD scan and `git diff --check`: passed.
- Deterministic tests cover home/sidebar/native navigation, archived and closed
  rounds, national and CLAB selections, reload, report-to-receipt navigation,
  unsupported channels, frame origin checks, unsaved forms and no live-state writes.
- Local rendered checks used synthetic fixtures: home → receipts, archived report
  → receipts, CLAB selection, draft unavailable state, desktop and 320px mobile
  menus, keyboard Tab/Enter and visible focus, standalone print navigation.
  The home at 320px measured `clientWidth = scrollWidth = 320`; every tile also fit.
- Interface review used better-interface and all six domain skills. Existing
  typography, surfaces and spacing were retained; measured menu/title contrast
  pairs were 16.77:1 (title), 8.44:1 (muted menu), 7.88:1 (selected menu) and
  10.11:1 (focus ring against the page). No motion was introduced. Native anchors
  retain accessible names and keyboard activation. Screen-reader speech and actual
  browser 200% zoom were not separately verified.
- This is a navigation-flow review, not a redesign of every underlying task form.
  The pre-existing print-content toolbar remains dense on narrow screens; the
  changed shared navigation wraps its labels in two columns.
- Production verification is read-only: compare deployed static files, verify
  health and authentication, then check each historical/current receipt endpoint's
  returned channel/archive and unresolved count. No production backtests are used.

## Prepared regional rounds and retired programs (2026-10-23)

Prepared 2026-10-26 Daegu/Gyeongbuk and 2026-10-28 Busan/Ulsan/Gyeongnam through
the existing atomic national-round preparation API. Both remain drafts with no
sales or shipping records. Presentation settings are inherited; the current
broadcast pointer remains on the 2026-10-21 round. Regional vendor memberships
are prepared before entry approval (8 and 4 vendors respectively at preparation).

Programs outside national-cre and the Creyon/CLAB family were archived, retaining
their records and financial links. The routine program picker now omits families
whose channels are all archived. Earlier rounds of an operating family remain in
its round picker. An explicit historical URL still opens its exact program/round;
leaving that program removes it from the routine picker again. Reopening a channel
in channel settings restores its program without data recovery or a code change.

Risk: release (operational configuration plus picker deployment). Existing channel
records were backed up privately before mutation. Read-only comparisons after
preparation/archival verified existing item, shipment, asset, vendor business data
and broadcast preservation. Only shared-directory membership metadata advanced
for newly linked vendors. Existing directory identities were retained.

- Focused navigation, preparation, round scope and checkout-continuity tests:
  `node --test test/operator-program-visibility.test.js test/operator-home.test.js test/operator-shell.test.js test/operator-finance-navigation.test.js test/national-round-operations.test.js test/national-round-intake.test.js test/operation-rounds.test.js test/checkout-round-continuity.test.js` — **50 passed**.
- `npm run check` and changed-file `node --check`: passed.
- `npm test -- --test-concurrency=4`: **1,504 passed, 0 failed**.
- Desktop `python -m unittest discover -p "test*.py"`: **270 passed**.
- Strict UTF-8, U+FFFD scan and `git diff --check`: passed.
- Local browser checks used synthetic data only: both draft dates appear under
  national-cre; only national-cre and CLAB appear in normal selection; an archived
  program's explicit link opens with financial actions; returning to national-cre
  removes the archived program from the picker. Layout and styling are unchanged.
- No production auction was replayed, activated, reset or deleted. Future entry
  approvals still need to be imported through the existing preparation action.
