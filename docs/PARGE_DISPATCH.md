# Parge dispatch

Open `/parge-dispatch.html?channel=national-cre` from shipping or print management. Administrator authentication is required. Choose the auction date and handover date; paid Parge deliveries default to selected. Other carriers, pickup, dispatched entries, and incomplete destinations are excluded. Each recipient/destination gets one row with summed animal count and auction prices.

## One-time Chrome setup

Download `/downloads/creo-parge-helper.zip`, extract it, and load the extracted folder in Chrome's extension management developer mode. Open the CREO dispatch page and exactly one logged-in `https://parge.co.kr/booking` tab in that Chrome profile. Reload the CREO page after installation. The helper uses only CREO dispatch and Parge page access, does not store passwords, and never confirms payment or accepts booking terms.

The current in-app browser cannot load this Chrome extension. Its real cart workflow was tested through visible browser controls; extension logic was tested separately against an isolated DOM fixture. A Chrome integration check after installation remains necessary.

## Tracking and recovery

- Server history records `checking`, `cart`, `booked`, or `released`. Creating a record is atomic and rejects duplicate item IDs and stale shipment data.
- The extension reserves hashes before attempting cart submission. Unknown outcomes require checking the Parge cart and reservations before retrying.
- Parge's cart was observed to disappear on reload. `cart` means last verified in cart, not a durable booking. Do not refresh the Parge tab before reviewing it.
- Only mark a booking complete after seeing its actual reservation in Parge. This does not mark CREO payment or shipment complete.
- Late deliveries for new recipients can be added. Extra animals for an already recorded recipient/destination are flagged for manual consolidation; automatic editing of an existing Parge order is not supported.
- To rebuild a batch, first verify its items are absent from both the Parge cart and reservations, then use `장바구니 비워짐`. History remains for audit. Never release a completed booking to force a duplicate.
- Unknown or renamed shops require an operator to verify the real destination; the helper does not guess replacements.

## Validation

Focused 52 tests, full server 1,301 tests and desktop 261 tests passed with isolated data. Real browser cart test: three shipments / five animals, 2026-10-24 handover, origin 크레오 대구본점, memo 전크자; count and declared-price totals verified. No payment or reservation was confirmed. Private evidence lives in root `scratch/parge-dispatch-20261019` and must not be committed.

Rebuild the extension after any bundled source change: `python tools/build-parge-helper.py`.
