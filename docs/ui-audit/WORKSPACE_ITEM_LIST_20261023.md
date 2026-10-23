# Operator item list

The item workspace now provides local search by lot/name, vendor and buyer, plus vendor and auction-status filters. Rows retain the real auction order and record IDs. Empty searches offer a reset that returns keyboard focus to the search field. Filters survive a same-round refresh and reset before displaying another round.

The desktop table groups item/vendor information and omits the group column when no item has one. Mobile rows become cards with order, status, result and the existing record actions. The embedded admin shell uses its existing sidebar instead of duplicating the inner tabs. Vendor directory buttons only appear on the vendor view. Broadcast controls and buyer-contact details use native disclosures; contact attention counts remain visible while collapsed. Opening those disclosures does not write or send anything.

Risk: medium for client-side presentation/filter state; release verification required for deployment. Auction transitions, persistence, fees, payment and notification request bodies remain unchanged. Existing edit forms are not redesigned by this change.

Verification:

- `node --test test/workspace-item-list.test.js test/buyer-contact-manager.test.js test/workspace-vendor-form.test.js test/workspace-status-labels.test.js test/workspace-vendor-table.test.js test/platform-pages.test.js`: 65 passed.
- `npm run check`: passed. `node --check public/workspace-item-list.js`: passed.
- `npm test -- --test-concurrency=4`: 1,727 passed, 0 failed.
- Desktop `python -m unittest discover -p "test*.py"`: 279 passed.
- `git diff --check` and UTF-8 replacement-character scan: passed; no bulk encoding or line-ending rewrite.
- Isolated real browser at 1280px and 320px: search/no-result/reset; B03 edit target and cancel without saving; round change from 10/19 to 10/21 clears the old query and shows the one correct item; contact disclosure opens with Enter and closes with Enter. Mobile inner clientWidth and scrollWidth are both 305px. Existing selected item actions still use their original IDs.
- After final CSS-only spacing/tab changes, repeated actual desktop/mobile rendering. The final full-suite run preceded only those presentation adjustments.
- Screenshots and logs are in `../admin-home-review-20261022/`: `item-list-desktop.png`, `item-list-320.png`, `item-list-focused.log`, `item-list-check.log`, `item-list-server-full.log`, `item-list-desktop-full.log`.

The owner-provided existing password successfully opened the production admin menu. Read-only verification reached 10/21 organizer settlement and found the expected organizer bank and the vendor's pending confirmation. No receipt, amount, message or broadcast state was changed during that verification.

Remaining: the item editor still needs a separate review of unsaved inputs, focus handling, error/retry, initial broadcast date and unknown status preservation. Full keyboard/200% zoom and broader workflow integration are not claimed complete. Production deployment evidence is recorded after the release is live.
