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
