# Organizer account during pending settlement

Read-only production review of the existing vendor link reproduced a missing account after the vendor reported its organizer transfer. The pending branch replaced the account with a waiting message, and the settlement details also omitted the account.

Pending reports now show a `정산 상세·계좌` disclosure containing the current organizer account and the existing copy action. The pending amount, disabled report button and waiting state remain unchanged. Payable accounts remain directly visible. The account is labelled current, rather than claiming it was the account used for the reported transfer.

Scope: vendor organizer-settlement account visibility only. Existing styles, native disclosure and copy behavior are reused. No account settings, financial totals, server contracts, receipts or notification logic changed. Risk: medium UI change, release verification for deployment.

Verification:

- Reproduced the missing account with new failing deterministic tests before the fix. A linkedom disclosure assertion was corrected to inspect the rendered `open` attribute.
- `node --test test/vendor-settlement-status-ui.test.js test/organizer-bank-ui.test.js test/vendor-checkout-flow.test.js test/organizer-receipt-scope.test.js test/vendor-settlement-picker.test.js`: 34 passed.
- Covers pending account availability/copy, disabled duplicate reporting, unchanged amount/data, updated account after refresh, disclosure preservation, escaped text, clipboard failure, missing bank, and normal payable/completed/empty behavior.
- `npm run check`: passed; changed scripts/inline page code parse and strict UTF-8 checks passed. `git diff --check` passed without mass encoding or line-ending rewrites.
- `npm test -- --test-concurrency=4`: 1,777 passed, 0 failed.
- Desktop `python -m unittest discover -p "test*.py"`: 279 passed.
- Actual CUA 320px isolated SQLite/fake-notification fixture: native disclosure opens with Enter; bank/name/account fit the narrow screen; Shift+Tab reaches the account copy button with visible blue focus; Enter reports copy success. Reload retains the pending settlement. Screenshot: `../admin-home-review-20261022/vendor-pending-bank-320.png`.
- Enable fixture with `VENDOR_PAYMENT_PREVIEW_PENDING_SETTLEMENT=1` when running `node tools/vendor-payment-preview.cjs`. Local socket access required running the fixture outside the restricted sandbox; no production data or real notifications were used.

Production check before deployment: operator session remains logged in, main's settlement menu opens the selected 10/21 round, vendor pending amount is 248,000 KRW. Health/durable storage normal, outbox 0, no live items across four national channels. Before/after snapshot prefix: `pending-bank-release` in `../admin-home-review-20261022`.

Not verified in this narrow checkpoint: browser 200% zoom, full screen-reader flow, or unrelated authentication/shipping-change work. The broader UX refresh remains in progress.
