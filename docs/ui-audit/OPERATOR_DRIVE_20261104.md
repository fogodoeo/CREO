# 운영자 공용 파일함 — 2026-11-04

Risk: Release (new private persistent file management, isolated from auction records).

## Scope

Global operator-shell navigation, folder tree, multipart uploads, downloads with original filenames, safe media previews, rename/move, trash/restore/permanent deletion. Private R2 namespace and a separate CAS metadata row. No migration or modification of existing media/auction records.

## Evidence before deployment

- `npm run check`: passed.
- `npm test -- --test-concurrency=2`: 1,974 passed, zero failed. Two additional signing/persistence tests added afterward; focused suite below passed.
- `node --test test/operator-drive.test.js test/operator-shell.test.js`: 18 passed, zero failed.
- `python -m unittest discover -s tests -p "test*.py"`: 110 passed.
- `node tools/check-operator-drive-ui.cjs`: real headless Chrome, isolated temporary SQLite and mock object storage. 9MB multipart upload; exact download size; folder creation; rename/move; trash/restore; reload; permanent deletion; Escape/focus return; 1440/720/390/320px reflow; zero page errors.
- Screenshots: `outputs/operator-drive/desktop.png`, `width-320.png`, `delete-confirmation.png`. Desktop/mobile renders inspected. Shared operator palette retained; no new motion or autoplay. Keyboard names, native dialog and focus return checked. Full screen-reader testing and physical mobile browsers not verified.
- Live preflight `/health` confirms durable SQLite and R2 media backend. Production feature validation follows deployment, not established by the local mock.

## Practical limits

- File max 20GiB, metadata index max 20,000 entries. Huge-file/end-to-end 20GiB transport not load-tested; local transport verified at 9MiB across two parts.
- One deployed writer process; durable CAS prevents lost metadata updates. In-process per-file sequencing protects uploads/completion/deletion. Multi-instance writers need distributed operation leases before scaling.
- Closing a tab does not resume uploads automatically. Pending rows remain cancelable; cancellation aborts multipart chunks. No automatic orphan sweep/lifecycle policy is installed.
- R2 signed downloads last five minutes; existing links may remain valid until expiry after moving to trash. Permanent deletion removes the object.
- Drive usage reports completed drive files including trash; excludes existing auction media and incomplete multipart chunks. R2 billing is account-wide.
- Individual file bytes never go through SQLite; only bounded 8MiB chunks pass through the web process (two concurrent chunks maximum). No new dependencies or public bucket access.
