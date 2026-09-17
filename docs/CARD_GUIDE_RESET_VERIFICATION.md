# Vendor card guide reset — 2026-09-18

Scope: an existing vendor checkout can return an unpaid card guide (URL or external delivery) to registration pending. This does not cancel a transaction at the external payment provider. The vendor explicitly confirms cancellation/blocking and nonpayment first. Existing delivery information, sold items, and previously confirmed items remain intact.

Risk: release (persistent payment state and deployment). User authorization: add the ability to return the sent guide to pending. No production buyer record was reset for testing and no real message was sent by tests.

## Behavior and invariants

- `reset-card-guide` authenticates the vendor/event and uses the channel mutation lock, required edit version and amount.
- The affected unpaid shipments and the action receipt commit atomically. The receipt retains the previous shipment snapshots for audit.
- Duplicate/restarted retries return the latest payload without repeating the reset, including after a new guide was registered.
- Paid, partially confirmed, dispatched, archived, other-vendor and other-channel records are protected. Previously paid items in a mixed bundle are preserved.
- Buyer reports can only be cleared after explicit cancellation/nonpayment confirmation; their old values remain in the receipt.
- Reset does not enqueue a notification. A replacement URL follows the existing buyer notification path; external delivery remains silent. Superseded queued card-guide notices are checked before sending and expire.
- An already delivered or in-flight provider message cannot be recalled. The vendor must cancel or block the external payment request separately.

## Checks

- `node --test test/checkout-notification-atomicity.test.js test/vendor-checkout-flow.test.js`: 29 passed.
- `npm run check`: passed. New JS and HTML inline scripts also compiled separately.
- `npm test`: 788 passed, 0 failed. Initial run exposed an old source-string assertion for the print parser; it now checks shared identity usage while the focused parser tests verify actual behavior.
- `python -m unittest discover -p "test*.py"`: 203 passed.
- `git diff --check`, strict UTF-8 decoding and U+FFFD scan: passed.
- Prior print correction included: `node --test test/print-winner-phone.test.js test/print-shipping-summary.test.js test/print-label-bundles.test.js`: 16 passed; separate phone fields reach print identity and label payloads.
- Real local API/SQLite with invented records, no external sends: external guide → pending → external guide, reload persistence, link and paid example states. At 320px and 390px, dialog actions remain reachable. Escape, outside click, disabled-until-confirmed action, and focus restoration verified. An accepted reset focuses the new URL field.

## Interface review

Stack: native HTML/dialog, existing checkout CSS and font, small scoped CSS. Conventions: AGENTS.md; installed better-interface and its six domain guides. Scope excludes unrelated vendor screens. No animation added.

| Domain | Evidence inspected | Result |
| --- | --- | --- |
| Accessibility | Native dialog naming, checkbox, disabled submit, Escape, outside click, restored focus, 44–48px targets | Clear in inspected states; screen reader and 200% zoom not verified |
| Layout | 320px/390px screenshots, dialog bounds, real reset/re-entry flow | Clear; RTL not verified |
| Writing | Action, acknowledgement, recovery errors | Explicit external cancellation; concise pending action |
| Typography | Existing font, 15–16px controls, narrow-width headings | Long initial heading shortened |
| Color | Reused palette; enabled submit computed #2563eb with #ffffff | Contrast approximately 5.17:1; disabled control remains legible |
| UI | Secondary change action, native modal, mobile button wrap | Clear after short-label adjustment |

| Severity | Domain | Location | Before | After | Why |
| --- | --- | --- | --- | --- | --- |
| HIGH | Layout | public/vendor-checkout.html | No path to replace a sent guide | Card guide change action and confirmation | Vendor can correct an unpaid request |
| MEDIUM | Typography | public/vendor-card-reset.js | Long heading/button wrapped awkwardly at narrow widths | Short title/action, stacked buttons at 360px and below | Action remains readable |

Verdict: Approve for the inspected flow. External cancellation is vendor-confirmed, never inferred from a local reset.
