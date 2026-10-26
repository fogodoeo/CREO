# Vendor panel registration — 2026-10-26

Risk: release (persisted entry classification and organizer settlement).

## Behavior

- National vendors register panels separately from the four ordinary reservation slots. Generic vendor entry pages also provide a panel entry action.
- Panel classification is stored on the entry and submission/approval snapshots, then copied to the auction item's existing `attributes.auctionKind = event` exemption.
- Both the entry fee (including the 10,000 KRW policy) and sold-price commission are zero. Shipping policy is not changed.
- Editing and renumbering preserve classification. A regular entry cannot silently become exempt by changing a vendor form field. Operators see the exemption in the review list.
- Normal registration completion excludes panel items. Entry ownership, broadcast date, stale versions, atomic batches, and lifecycle checks remain enforced.

## Verification

- `node --test test/national-broadcast.test.js test/vendor-entries.test.js test/vendor-broadcast-calendar.test.js`: 65 passed.
- `test/national-round-intake.test.js` also passed in the earlier focused run and full suite.
- `npm run check`: passed.
- `npm test`: 1,861 passed, zero failed/skipped.
- Desktop `python -m unittest discover -p "test*.py"`: 285 passed.
- Full suites first hit sandbox socket/temp-file restrictions; reran with normal local access and passed.
- Regression coverage: concurrent duplicate requests, stale concurrent edits, atomic invalid batches/storage failures, restart and date-boundary replay, soft-delete replay/tombstone, foreign dates/regular IDs, approval/renumber, ordinary fees unchanged, panel exemption through waiting/live/sold/passed, generic vendor reviewed revisions, normal four-entry UI unaffected.
- Actual browser: national desktop registration/submission; 320px iframe layout; generic CLAB 320px registration/submission; operator list exemption. Found and fixed a panel delete button wrapping into a narrow grid column, with a deterministic layout rule regression assertion.
- Korean files checked as strict UTF-8; targeted diff has no wholesale encoding/line-ending rewrite.

Screenshots: `outputs/panel-registration-20261026.png` (isolated synthetic vendor).

Not verified: physical mobile devices and screen reader speech. Browser tests used isolated SQLite/fake notifications, never production auction records.

Production deployment verification is recorded after release.
