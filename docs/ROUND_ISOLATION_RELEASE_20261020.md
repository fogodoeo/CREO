# Round isolation and ongoing checkout

Risk: release. Operators choose a channel and round from `/main`; auction, shipping, print, settlement, capture and pinball links retain that scope. Viewing a prepared round does not switch the broadcast. National intake remains shared; preparing a dated child round imports only unstarted entries atomically and prevents their source copies from being auctioned twice.

Buyer and vendor financial pages keep unpaid and unsettled history available after auction closure. Amounts, confirmation writes, receipt ledgers and access revocation remain scoped to the selected round. A single round opens directly; the selector appears only for multiple rounds, without explanatory text below it. Existing receipts whose round cannot be established are flagged rather than assigned automatically.

Validation on 2026-10-20:

- `npm run check`: passed.
- `npm test`: 1,369 passed, 0 failed. Includes duplicate/concurrent preparation, atomic failure, restart, stale writes, historical payment/remittance, independent link revocation and reordered UI responses.
- `python -m unittest discover -p "test*.py"` in the desktop repository: 270 passed, 0 failed. Tests were rerun outside sandbox temp-file and loopback restrictions.
- `npm run check:roulette`: passed. The round-scoped roulette bundle was built during implementation.
- Added files and changed inline JavaScript checked for syntax; strict UTF-8, replacement-character scan and `git diff --check` passed.
- Synthetic browser verification: previous-round shipping shows only OLD01; current and prepared menus remain separate; old unpaid buyer/vendor pages remain usable; one-round selector hidden; explanatory text absent.

This deployment does not prepare/activate a production round or migrate customer data. Production read-only pre/post evidence is recorded in the local release report. Real payment-provider completion and physical PRISM capture are outside these synthetic checks.

The Page2 countdown overlay and server endpoint remain retired. The desktop change removes its remaining display heartbeat; chat countdown remains. Shared lock/revision traffic was observed in the former implementation, but the original outage cause was not conclusively established. Applying the local desktop change requires its next normal restart.
