# Pre-auction numbering labels

Risk: release (new authenticated persistence endpoint, desktop print contract and deployment).

## Operator flow

- Main → 경매 운영 → 순서·번호라벨, scoped to explicit channel and broadcast date.
- Default: vendor draw order + total quantity per vendor. Build a round-robin sequence, split the regular total at `ceil(total / 2)`, restart numbering at A01/B01. Optional second-part reverse rebuilds the remaining quantities in reversed vendor order.
- E panels are separate from that split. Advanced settings support independently configured parts, prefixes, starting numbers and quantities.
- Preview → save immutable snapshot → select all, a part, or individual codes → print. Older snapshots remain available when preparing a changed setup.
- No dependency on submitted entries. No item creation, auction assignment, shipment, payment or notification mutation.

## Durability and print safety

`setting/number-label-plan-{requestId}` is append-only. Repeated identical saves reuse one record; changed content under the same request ID fails. Channel/date filtering is explicit. Printer submission freezes the selected saved snapshot, disables competing controls, and never retries an uncertain submission automatically. B1 batches are limited to 120 labels.

The new desktop `numbering` format uses a 30×50 mm portrait corner label with a 35/15 mm fold, handwriting space for weight/notes, and vendor/code on both faces. Existing shipping, auction and identification formats remain independent. Printer transport/feed commands were not changed. The web requires the new desktop capability rather than silently substituting an older layout.

## Verification

- `node --test test/number-label-plans.test.js`: ordering, unequal/zero quantities, invalid input, odd-total split, reverse option, E separation, idempotent/concurrent saves, retained snapshots, channel/date isolation, restart and write failure.
- API regression in `test/platform-api.test.js`: admin-only access, no vendor phone exposure, independent pre-entry save, retry, date/channel isolation and unchanged live item/notifications.
- `npm run check`; `npm test -- --test-concurrency=1` (logs in desktop `outputs/number-labels/`).
- Desktop `python -m unittest discover -p "test*.py"`: 285 passed. Includes actual external-spool routing, monochrome render, existing format compatibility and unchanged auction config.
- `node tools/verify-number-labels.cjs`: isolated local browser, 16-label advanced setup, 12-label automatic split, save/reload, second channel, single print request on double click, 320 px layout, browser print PDF, and actual main-menu iframe integration. Bridge requests were intercepted; no physical print or production write.
- Visual review: desktop/mobile setup and saved list, administrator shell, native raster. Better-interface domains applied; no motion added. Screen-reader runtime testing and physical tear-off/feed position are not verified.

Deployment verification must compare production static assets and health read-only. Operators must reopen the updated local monitor app to enable the new native format.
