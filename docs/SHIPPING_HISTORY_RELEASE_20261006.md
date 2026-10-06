# Historical buyer destinations — 2026-10-06

Risk: release (authenticated checkout payload, historical storage reader, deployment).

## Change

- Search all native platform channels, including archived channels and operator-entered shipments without `buyerSubmittedAt`.
- Include the old CDCUP `items` table and all indexed `auction_archive_*` snapshots through the existing server-side Supabase repository.
- Match complete phone numbers only. Normalize Korean international phone formatting; reject eight-digit suffix-only records.
- Offer the most recent usable destination. Skip cancelled/refunded records, disabled carriers, closed shops, ambiguous shop names, and another event's pickup location.
- A current shipment remains authoritative over a stale cached preference. Legacy history reads are bounded to five seconds, cached for 30 seconds, coalesced across concurrent requests, and isolated from checkout failures.
- Reuse only the receiving-shop selection. New auction prices and delivery charges remain current; no historical payment state is copied and no destination is auto-submitted.

## Read-only production inventory

Native channel storage contained 45 PARGE rows, including two QA rows. The old CDCUP table contained 12 PARGE rows (11 with complete phone numbers). Four stored legacy round snapshots contained 22 PARGE rows (21 with complete phone numbers). These are raw row counts and overlap; they are not counts of unique buyers. No production data was used as test fixtures or changed by this inventory.

## Verification

- Focused: `node --test test/checkout-preferences.test.js test/buyer-checkout-flow.test.js test/shipping-destination-history.test.js test/platform-repository.test.js` — 52 passed.
- Syntax: `npm.cmd run check`, plus `node --check shipping-destination-history.js` and `node --check tools/shipping-history-preview.cjs` — passed.
- Server: `node --test` with the bundled dependency directory in `NODE_PATH` — 991 passed, zero failures/skips.
- Desktop: `python -m unittest discover -p "test*.py"` — 203 passed.
- Synthetic local preview: `node tools/shipping-history-preview.cjs` on port 4361, mobile viewport 390 × 844. The old archive's receiving shop appeared first. Selecting it showed 100,000 won auction price + the current 20,000 won shipping price. Shipment and notification counts stayed zero before submission. A fresh tab still showed the suggestion; “다른 수령지” opened the ordinary destination chooser. Neither tab logged JavaScript errors.
- Regression coverage includes unauthorized requests, exact phone isolation, stale cache, changed/cancelled source records, malformed archive isolation, restart, repeated/concurrent reads, paging, cache expiry, storage failure/retry, no implicit writes, and existing checkout duplicate/order/transaction behavior.

## Limits

Rows without a complete phone or with an unresolvable/ambiguous receiving-shop label cannot be safely suggested. Carrier/shop availability is checked against the current configured shop list. Legacy source updates may take up to 30 seconds to appear; source failure removes that source's suggestion without blocking checkout.
