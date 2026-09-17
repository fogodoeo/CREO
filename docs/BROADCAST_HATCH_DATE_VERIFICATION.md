# Broadcast hatch date — 2026-09-18

Vendor submissions store `attributes.entry_traits.hatchDate`, but P2 reads the legacy checklist's `birth`. The public projection previously dropped the submitted date. A read-only production inspection found hatch dates on all 38 creyon-0917 items and no legacy birth fields.

The public projection now supplies a valid full hatch date as `birth:26.07.14`. The saved ISO date remains unchanged. Explicit operator/legacy birth values retain precedence; missing or invalid dates add nothing. No entry internals or extra personal data are exposed. Both existing P2 rendering paths already support the birth field, so this requires no layout, font, auction-state or desktop changes.

Risk: release (public broadcast projection and deployment). The patch does not write auction records or dispatch notifications.

Verification:

- `node --test test/broadcast-hatch-date.test.js test/broadcast-item-notes.test.js test/platform-core.test.js`: 25 passed during focused iteration.
- `node --test --test-name-pattern="broadcast projects submitted hatch dates" test/platform-api.test.js`: 1 passed during focused iteration.
- `npm run check`: passed.
- Final `npm test`: 808 passed, 0 failed.
- `python -m unittest discover -p "test*.py"` in the desktop repository: 203 passed.
- UTF-8 decoding, replacement-character scan and `git diff --check`: passed.
- Regression coverage: valid/leap/invalid dates, no placeholder, duplicate projection/read, legacy precedence, note toggle, date edit/removal, next-item and channel boundaries, API restart, read-only source preservation and public privacy filtering.
- Local real browser at 1920×1080: base and pixel themes, synthetic female/28g/26.07.14 item, vendor name and second-line note; date fits the current creyon-0917 placement geometry. Missing-date fixture shows only sex and weight. No real auction records were used for backtests.

Limit: visual checks cover the current placement and standard broadcast resolution, not every arbitrarily narrow saved box or physical PRISM source cache. Old operator-entered birth strings keep their original format. A source refresh may be needed for an already-open broadcast. Production verification is recorded separately after deployment.
