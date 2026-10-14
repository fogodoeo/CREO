# Vendor parent photos — 2026-10-14

## Scope and risk

National broadcast vendors can add, replace or detach sire/dam pictures on their
assigned auction items, including manually imported items without a reservation.
The existing bulk registration editor remains the entry point for new or partially
approved reservations. Assigned items also remain together in a spreadsheet layout;
their parent photo controls are inline, not a separate item-by-item wizard.

Risk: **release** (persisted item attributes and vendor/public projections).
The action is authenticated to the current vendor, channel locked, owner locked,
revision checked, atomic and idempotent. Only owner-uploaded media IDs are accepted.
Waiting/live/passed items allow parent photo edits; sold/cancelled items and archived
channels are read-only. Sex, weight, birth date, order, bids, price, vendor and fees
are preserved. The approved submission remains a historical record.

An explicit per-item photo override prevents the parent library hydration step from
silently restoring a replaced or detached picture. Saving advances the broadcast
pulse so a visible overlay receives the change through its existing refresh path.
Private image storage, reencoding and temporary viewing URLs are reused.

## Interface review

Used better-interface and its accessibility/layout/writing/typography/colors/UI
domains. No new animation was added. Existing Pretendard, palette and sheet shell
remain in use.

- Accessibility: each upload/remove control names both the lot and parent; controls
  have visible focus treatment and 44px or larger targets; pending work disables
  duplicate actions. Sold rows have a text status and no editable photo controls.
- Layout: a single date sheet lists all lots. Four aligned fact columns precede two
  compact parent-photo controls in each row. New submissions keep their bulk editor.
- Writing: short `부 사진` / `모 사진` labels; no introductory prose or extra steps.
- Typography: tabular numerals, 14px facts, 12px headings; small-screen photo labels
  remain on one line. Existing 16px editable fields are retained.
- Colors/UI: existing blue actions, neutral fields, photo-top-right X and undo.
  Failure retains the uploaded candidate with retry; stale records have refresh.

## Verification

- `npm run check`: passed.
- `npm test`: **1,135 passed, 0 failed**.
- `python -m unittest discover -p "test*.py"`: **203 passed**. The initial sandbox
  run encountered temporary-directory permission failures; the same suite passed
  with normal host temporary-directory access. Existing resource/deprecation
  warnings remain unrelated to this change.
- Focused tests cover import-without-reservation, approved library override,
  duplicate/reordered/concurrent requests, restart, atomic failure, foreign vendor,
  unknown media, stale version, sold/archive boundaries and broadcast pulse refresh.
- UI regression tests keep assigned lots together, preserve the bulk registration
  editor for incomplete approvals and limit photo redraw to its own table.
- Isolated SQLite/fake-SMS browser fixture: real image upload, replacement,
  detach/undo, another lot upload, reload persistence, read-only sold row.
- Rendered 390px mobile and 1280px desktop views; 320px DOM width/overflow check
  and rendered view. A narrow photo-label wrap was corrected after this check.
- The open P2 page received added/removed parent images without a document reload.
  Background tabs deliberately pause polling; this is existing behavior.
- Strict UTF-8/U+FFFD scan and `git diff --check`: passed.
- Test fixtures contain only synthetic records and images. No production records
  were used for backtests. Production release checks are read-only.

Evidence is outside this checkout in
`scratch/national-import-20261014/parent-photo-table-mobile.png` and the release
verification JSON. The user's actual OBS session and physical iOS/Android devices
were not controlled. Deployment completion requires healthy production responses
and matching hashes for the three vendor-broadcast static files.
