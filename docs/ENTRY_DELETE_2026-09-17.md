# Vendor entry deletion

Vendors can delete saved drafts, submitted entries and change requests before an auction item has been assigned. Intake closure alone does not prevent deletion; paused and archived auctions do. Approved entries and all revisions of an approved entry stay protected.

The server checks vendor/channel ownership, entry version, approval snapshot and auction-item linkage. Deletion and approval use the same owner serialization. A retained tombstone prevents stale writes from recreating an entry and keeps entry numbers reserved. Parent records and media remain intact; automatic storage cleanup is outside this change.

The vendor editor has a Delete action; submitted-entry details have Delete below the information. A native confirmation dialog identifies the entry, defaults focus to Cancel, blocks repeated requests while pending and provides a refresh action for stale versions. Deleted entries disappear from vendor/operator lists and registration counts. Matching browser recovery drafts are cleared, including when another device deleted the entry.

## Verification

- Risk: release (persisted state and deployment).
- Focused Node tests: 35 service/batch tests and 3 client recovery tests passed.
- `npm run check`: passed.
- `npm test`: 767 passed, no failures or skipped tests.
- Desktop `python -m unittest discover -p "test*.py"`: 200 passed.
- `git diff --check` and strict UTF-8/replacement-character scan: passed.
- Real browser, isolated SQLite fixture: 390px and 320px confirmation, cancel/focus restoration, keyboard deletion, pending disabled buttons, stale-version error and refresh, draft deletion and empty list verified. No production entry was deleted.
- Six better-interface domains reviewed for this deletion flow: native dialog and named controls; existing layout and tokens; short action copy; existing 16px buttons; measured white/danger contrast 6.57:1; explicit loading and error states. Final destructive button is red, 52px high, and the 320px layout has no horizontal overflow. No new animation.
- Full screen-reader speech and real device testing not performed. Production verification is read-only after deployment.
