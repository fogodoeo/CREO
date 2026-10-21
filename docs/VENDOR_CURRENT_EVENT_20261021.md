# Vendor current event presentation — 2026-10-21

The common national channel and today's regional round both appeared as operating auctions. New vendor portal visits now open the vendor's latest active dated national round. The common channel is available through `이전 낙찰·결제 내역 보기`, rather than a second operating choice. A single current event needs no event selector.

Scope: vendor settlement navigation only. The root channel stays enabled for intake, parent photos, old payments, shipping and settlement. No catalog, auction, payment, link authority or notification records are changed by this release. Explicit financial round links retain their scope. The active dated target must already be in the authenticated vendor's event list.

Risk: medium (client navigation between existing authorized financial views). Regression coverage includes new portal landing, explicit historical links, direct sale links, no current membership, future draft rounds, stale responses, initial fetch failure/retry, and returning to past records after initial selection. Existing continuity tests cover prior unpaid payments, settlement, restart and stale cross-round writes.

Verification:

- `node --test test/vendor-event-view.test.js test/checkout-round-picker.test.js test/checkout-round-continuity.test.js`: 22 passed.
- `node --test test/vendor-checkout-flow.test.js test/vendor-event-view.test.js`: 15 passed.
- `npm.cmd run check`: passed.
- `node --test`: 1,476 passed, zero failures. The first run exposed an obsolete VM test dependency; updated its DOM fixture and reran.
- UTF-8 decoding, replacement-character scan, `git diff --check`: passed.
- Local real browser with isolated in-memory records: 320px vendor view defaults to the current 200,000 won record; keyboard activation opens the old 100,000 won record; direct historical link retains its date; current-round return works. The normal selector is hidden. Root intake link remains on the root. No real messages or production test data.

Interface review (`better-interface` domain skills): native labeled button, 44px hit area, no animation, wrapped heading and button at 320px. Rendered button colors are #222 on #fff (15.91:1). No actionable findings in the changed controls. Actual assistive-technology output, RTL and 200% browser zoom were not verified. Unchanged surrounding page UI is outside this review.

Residual limitation: the default uses the latest active dated national event in the vendor's authorized events. A saved explicit historical URL deliberately remains historical. Users need to reload an already-open page to receive new static assets.
