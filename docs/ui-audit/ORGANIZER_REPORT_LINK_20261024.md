# Organizer report links and regional participation — 2026-10-24

Risk: Release (notification contract, authenticated report lookup, public UI and deployment).

## Outcome

- New regional vendor signup already commits the common identity and upcoming regional round participation atomically. The existing October 26 path and an added October 28 registration regression cover signup without a separate reservation. Vendor identity stays common; transactional records remain round-scoped.
- Production read-only audit found October 26 had 8/8 regional vendors, October 28 had 4/6. The existing idempotent `national-rounds prepare` operation repaired the two missing October 28 memberships (렙타일숲, 젤리팜코리아). It imported zero items. Final audit: 8/8 and 6/6, matching regional schedules, no extra vendors. Active round remains October 21.
- Organizer settlement report SMS lacked an action link. New reports carry the existing organizer access URL plus a compact reference to that exact report. The complete SMS remains within the provider's 90 UTF-8 byte limit; full vendor identity and amount appear on the page. Shipping Alimtalk's approved dynamic button uses the same report reference.
- Opening a notification resolves the report under the existing organizer credential and validates its vendor, item set and round. It opens the matching pending report's existing receipt dialog. Approval still requires an explicit button press. The link follows the report into an archive. Already processed reports show their status and never open a newer pending report.
- Missing, ambiguous, cross-vendor or mixed-round references fail closed. No new permission is granted by the compact reference. No historical notifications are resent and no real receipt was approved during testing.

## Verification

- `node --test test/organizer-report-link.test.js test/organizer-recovery-ui.test.js test/national-settlement.test.js test/platform-api.test.js test/national-vendor-participation.test.js test/national-round-operations.test.js`: initial 157/158; one test expectation omitted the existing account-holder suffix. Corrected assertion and reran the affected UI/participation suites: 29/29.
- `npm test`: **1,826 passed**, 0 failed, 0 skipped.
- `npm run check`: passed.
- Desktop `python -m unittest discover -p 'test*.py'`: **279 passed**.
- Regression coverage includes duplicate/concurrent signup and report submission, atomic write failure/retry, restart, archival, authorization, wrong-channel references, stale UI responses, explicit approval, processed-link replay and no approval during link opening.
- Real browser: loopback-only fixture with fake accounts and fake delivery provider, 320px viewport. Link immediately displayed the exact vendor, October 14 round and 40,000 won amount. Explicit local approval showed completion; reloading the same link showed already-confirmed status and no approval dialog.
- Screenshot: desktop workspace `scratch/admin-home-review-20261022/report-link-mobile-320.png`.
- Production baseline: healthy durable storage, outbox 0, no live lots, active round October 21; 72/70 root items/shipments, 38/38 October 21, 0/0 October 26 and 28. Post-deploy health/static/data verification recorded separately in the local release audit.

## Remaining external boundary

Provider requests and byte limits are covered by fake transports. No real SMS or Alimtalk was sent for this release, so handset link detection and provider delivery are not claimed as live-tested. Automatic membership does not invent submitted animals: vendors still enter their actual animal details.
