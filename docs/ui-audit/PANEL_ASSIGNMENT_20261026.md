# Dated panel participation — 2026-10-26

Risk: release (persistent assignment, vendor membership, entry approval defaults).

- Organizer `panel-assignment` command binds a vendor and quantity to a broadcast date. It preserves the vendor's region and ordinary four-entry reservation. Assignment and round membership commit atomically, with revision checks and a durable request journal.
- Vendor pages show assigned cross-region panel dates separately, allow parent information, and enforce the configured panel entry count. Existing ordinary entry classification cannot be changed through the panel route.
- A mixed batch uses A/B for ordinary entries and consecutive E numbers for panel entries. Existing assigned numbers are preserved. Single-entry review defaults panels to E; operator renumbering remains supported.
- Settlement continues to use the item's event classification, not the vendor's panel participation: only that item has zero entry fee and commission.

Verification:

- `node --test test/national-broadcast.test.js test/vendor-broadcast-calendar.test.js test/vendor-entries.test.js`: 69 passed. State suite rerun with round membership assertion: 38 passed.
- `npm run check`: passed.
- `npm test`: 1,865 passed.
- Desktop `python -m unittest discover -p "test*.py"`: 285 passed.
- Regression coverage: assignment authorization/CAS/failure, duplicate requests, concurrent cap enforcement, restart, date boundary, ordinary registration retained, mixed fee calculation, E numbering, and cross-region mobile entry path.
- Actual browser check at 320px in an isolated fixture: separate panel card, one draft row, hidden additional-entry action at cap, photo and parent name controls, and route back to the list. Screenshot: `outputs/panel-assignment-mobile.png`.

Limits: screenshot uses a browser iframe rather than a physical phone. Existing manual numbering remains an operator override. Production assignment and post-deployment checks are recorded separately after deployment.
