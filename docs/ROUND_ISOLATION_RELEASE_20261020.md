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

## Preparing the October 21 broadcast

The next national round inherits presentation toggles, font sizes, layout, hosts, shared banner selection, animation preference and bid unit. Its title/date change to the new region; an old weekday-specific delivery announcement is replaced with an instruction to check the delivery page. Delivery estimates use the new auction date and do not inherit old dispatch-date overrides. Sold item, quiz winner and audience-session state are excluded, and re-import preserves later layout edits.

The HTTP route now permits the broadcast studio for a prepared national round while keeping it off-air. The prior static route rejected these previews even though the editor supported them.

Verification: focused preparation/real-HTTP/studio tests 14/14; `npm run check` passed; `npm test` 1,371/1,371; desktop `python -m unittest discover -p "test*.py"` 270/270. A synthetic prepared studio rendered its own editor and preview while identifying the original channel as on-air. UTF-8 and diff checks passed. Production preparation and readback are recorded separately; no production sale data is used for regression testing.

## Organizer account continuity — 2026-10-29

National round preparation now copies the root channel's configured organizer bank, account holder and notification phone when the target round has no account row. These settings are stored separately from the channel document and were previously omitted from channel cloning. The account snapshot is committed in the same atomic transaction as preparation. Existing round accounts take precedence; later root-account changes and repeated preparation do not replace them. Receipt ledgers, received totals and notification records are never copied. Other auction families are not affected.

For rounds prepared before this correction, preparing again fills a missing account only while the normal pre-auction import guards allow it. A completed round must be corrected through its existing organizer-account API, with the expected revision. The October 28 national round was repaired this way using the already configured root account after checking it matched the October 26 round. No bank or phone values are embedded in source code.

Release verification: 32 focused preparation/settlement/receipt tests passed, including the 16 preparation tests with organizer and vendor API account readback, duplicate/concurrent preparation, restart, explicit override, stale revisions, cross-channel isolation and atomic write failure. After integrating the latest public-name privacy fix, `npm run check` and all 1,919 Node tests passed. The CDCUP suite ran 137 tests: 136 passed, with the same pre-existing `niimprint` dependency error in the USB/Bluetooth printer fallback test. Strict UTF-8 and diff checks passed. A synthetic newly prepared round displayed its account fields in the real browser. Production readback confirmed the repaired account matches the existing source and settlement totals and auction items remained unchanged. No production auction was created for testing and no payment or notification was sent.
