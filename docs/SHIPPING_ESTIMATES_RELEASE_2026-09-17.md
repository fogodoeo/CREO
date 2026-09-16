# Shipping estimates and shared rates

Risk: release (checkout payload, shared storage, deployment).

## Behavior

- P2 no longer renders the separate mystery/next-item popup. Waiting still suppresses stale item information until the auction starts.
- Global shipping rates opens without a channel and returns to `/main`. Admin authentication remains required for updates.
- Shipping screens and checkout now read the same server rate table. Refresh and workbook saves use that store; the old Supabase config copy is no longer a competing read source.
- Dodosi refresh selects the Creyon Daegu origin explicitly; a missing origin fails without overwriting the saved table.
- Operator-entered carrier/address data is reflected in the buyer selection. A unique current destination is preselected; a carrier alone does not invent a destination or mark the buyer's form submitted.
- Print pages show `예상` for unsubmitted buyers with a reusable previous confirmed destination matched by their full phone number. Existing current destinations win. Disabled carriers, removed shops and another auction's pickup locations are excluded.
- Estimates are read-only, remain `미입력`, have no shipping charge allocated and cannot be selected for label printing. The exported settlement table also prefixes the destination with `예상`.
- Print shipping propagation requires a complete matching phone number; matching names or partial numbers cannot borrow another buyer's destination.

## Verification

- `npm run check`: passed.
- `node --test --test-concurrency=2`: 728/728 passed.
- Desktop `python -m unittest discover -p "test*.py"`: 192/192 passed. Existing SQLite/Pillow warnings remain outside this change.
- Focused tests cover repeated/concurrent reads, restart, channel and buyer isolation, current-data precedence, unsupported/obsolete destinations, shared-rate auth and failed refresh preservation, history lookup failure, no notification writes, and exclusion from label output.
- One old source assertion expected a direct return from `loadShippingItems`; updated for the enrichment step and added a behavioral test for canonical item immutability and failed/mismatched history responses.
- Isolated SQLite real-screen review: global rates with no channel, current server table after reload, 390px buyer preselection, print settlement/label estimate exclusion, and P2 standby without the popup. No production auction records were used as test fixtures; no messages or physical labels were sent.
- Strict UTF-8, replacement-character, changed HTML inline-script syntax and `git diff --check`: passed.

External provider availability and destination naming remain dependencies. A refresh failure retains the previous table; an unrecognized historical destination is not guessed.
