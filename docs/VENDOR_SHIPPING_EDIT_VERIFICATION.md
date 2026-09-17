# Vendor shipping edit — 2026-09-18

Risk: release (authenticated payload, shipping/payment state and persistence).

## Scope

- Vendor checkout has a `수령 정보 / 수정` entry. The native dialog shows current destination, optional shared note and the resulting shipping fee/payment total.
- Existing pickup locations represent direct handoff, including a buyer-arranged courier collecting there. No new delivery enum or carrier was introduced.
- Before payment report/confirmation or dispatch, a vendor may change the destination for a buyer whose auction items all belong to that vendor. Cross-vendor combined deliveries remain operator-managed; one vendor cannot reprice or change another vendor's shipments.
- Notes remain editable for already registered shipments, including paid/dispatched records, while the event is active. Notes are shared with the buyer, organizer auction details and operator shipping list; no empty note placeholder is shown.
- Destination changes reuse buyer fee allocation and old-card invalidation. An amount-changing card request is removed from active guidance; the vendor must confirm cancellation in the external payment app before replacing it. The site does not cancel external requests.
- Note-only edits preserve all address, quote, payment/report/confirmation and card-guide fields. No new messages are sent on vendor edits.
- Vendor credentials, current version and displayed total are checked under the channel mutation lock. Shipments, saved destination and durable action receipt/audit snapshot commit together. Repeated requests survive restart; late retries cannot overwrite a newer guide.

## Verification

- `node --test test/vendor-shipping-editor.test.js test/checkout-notification-atomicity.test.js test/checkout-change-requests.test.js test/vendor-checkout-flow.test.js`: 65 passed.
- `npm run check`: passed. New editor script and changed HTML inline scripts also compiled independently.
- `npm test`: 803 passed, zero failures.
- Desktop `python -m unittest discover -p "test*.py"`: 203 passed.
- `git diff --check` and UTF-8/U+FFFD checks: passed.
- Regression cases: linked/external card replacement, shipping allocation and organizer total, concurrent duplicate requests, durable restart/late retry, stale buyer/version/quote, wrong vendor/event/credential, invalid/overlong input, paid/reported/partly confirmed/dispatched locks, archive, atomic write failure, confirmation race, saved-price preservation and escaped notes.
- Isolated real HTTP/SQLite browser fixture on port 18862, synthetic records only: 640,000 -> 600,000, shipping settlement reduced by 40,000, card cancellation gate, refresh, paid memo-only save, buyer and organizer note display, operator list note display, Escape/backdrop close and restored focus.
- Mobile 320/390px: no horizontal overflow in the editor, input font 16px, native labels/keyboard operation, 48px dialog buttons. Measured primary text/background: white on rgb(37,99,235), contrast 5.17:1. No new animations.

Limitations: combined multi-vendor destination changes and reported/paid/dispatched destination changes require the operator. Real financial cancellation/payment and real Kakao/SMS delivery were not executed. Physical mobile Safari and screen-reader speech output were not tested. Production record changes were not part of this feature rollout.

Production verification is recorded separately after deployment; passing local tests is not a production-delivery claim.
