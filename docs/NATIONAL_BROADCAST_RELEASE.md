# National broadcast portal

The `national-cre` channel uses a five-region rotation starting on 2026-10-14 (Seoul), every Monday and Wednesday at 20:00 Asia/Seoul. Regions: Seoul, Gyeonggi, Jeolla/Chungcheong, Daegu/Gyeongbuk, Busan/Ulsan/Gyeongnam.

- Each vendor submits exactly five animals. There is no minimum total, fixed number of vendors, default capacity, or legacy 16-animal region cap.
- A per-date capacity is optional (`null` means unlimited). Explicit limits must accommodate existing reservations and use multiples of five. The operator can set reservation and entry deadlines per date.
- Entries use the existing vendor-entry document, version checks, idempotency ledger, operator review queue and atomic approval into ordinary auction items. General auction channels retain their existing flow.
- Sex must be explicitly chosen, including unknown; weight and birth date are required on submission. Drafts may be incomplete.
- Optional sire/dam photos use the existing private photo storage and local upload recovery. The calendar clears the registration alert only when all five entries are submitted or approved.
- Pickup is a persisted before/complete flag. Existing auction settlement and buyer shipping use the approved ordinary items.

## Release and verification

Release risk: storage, authenticated public UI and deployment. Use `npm run check`, `npm test`, and the desktop repository's `python -m unittest discover -p "test*.py"`. Focused regression coverage: `test/national-broadcast.test.js` (rotation, no default cap, fixed slots, ownership, duplicate/restart, concurrent capacity/edits, failures, mandatory fields, deadlines, photos/approval and pickup).

`node tools/national-broadcast-preview.cjs` starts a fully isolated preview on port 4346 with fake SMS and temporary private photo storage. Its fixtures never connect to production. Real-screen checks cover 320px/390px vendor UI, upload/remove/undo, submission/reload, required-field focus, expired login recovery and operator date settings.

After deploying code, `node tools/national-cycle-release.cjs --activate` enables the typed `regional-cycle-v1` setting. Without `--activate`, the script performs read-only checks. It refuses automatic activation when legacy confirmed reservations exist. It reads the local operator credential without printing it. Do not replay fixtures or prototype localStorage into production.

The old local prototype remains separate. New production entries and photos are server-backed; operator approval is still required before auction publication.
