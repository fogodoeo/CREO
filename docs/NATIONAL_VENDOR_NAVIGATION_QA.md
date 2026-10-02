# National vendor navigation verification — 2026-10-02

Risk: release (public vendor UI). No payment, auction, account permission, or storage mutations.

## Fixes

- Broadcast, settlement, and company profile share navigation icons, labels, selected states, typography, dimensions, and content width.
- Checkout now forwards the server's booking summary to navigation. Previously a national vendor could see the general-auction entries menu instead of Broadcast.
- Checkout initializes navigation after the required DOM and before starting its data load. Repeated local navigation reproduced a race where fast data arrived before the deferred navigation script.
- Stable scrollbar space prevents horizontal movement between short and long pages.
- The local 4343 prototype uses the same navigation assets. Its embedded settlement expands to content height using origin/source-checked messages, removing nested scrolling. Prototype-only files are not part of the production release.

## Verification

- `node --test --test-isolation=none test/vendor-navigation-summary.test.js`: 3 focused regressions passed, including initialization order and general-auction mode.
- `npm run check` and `node --check public/vendor-portal-shell.js`: passed.
- `npm test`: 912 passed (includes local prototype tests present in this worktree).
- Desktop `python -m unittest discover -p "test*.py"`: 203 passed.
- CUA rendered checks: actual isolated national fixture at 4346, prototype at 4343/4345, general auction fixture at 4344.
- At 320 × 740, all three actual national pages have the same navigation rectangle: x=0, y=672, width=305, height=68 (15px desktop scrollbar gutter). No horizontal overflow. Repeated Broadcast → Settlement navigation keeps Broadcast visible and the correct active item.
- At 390 × 844, prototype screens share x=0, y=776, width=375, height=68. Settlement frame expands to 438px without nested scrolling after content loads.
- Desktop settlement navigation is centered at max-width 720px. General auction remains `출품 개체 / 낙찰·정산 / 업체 정보` without national shell styling.

## Limits

Browser emulation on Windows was used; no physical iOS/Android device check. Payment sending/confirmation was not exercised because this change does not modify payment behavior. Auction-date partitioning is outside this navigation fix.
