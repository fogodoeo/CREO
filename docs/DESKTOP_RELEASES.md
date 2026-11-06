# Band Monitor desktop releases

The Windows application runs locally for BAND Chrome integration and label printing.
CREOK stores immutable installers in the existing private operator file library.
`/monitor-download.html` is the installation and release administration page.

All `/api/desktop-releases/*` endpoints require the existing administrator session or
`X-Creo-Admin`. The registry shares the file library's compare-and-swap row, so publishing
and deleting cannot race to leave a stable release pointing to a trashed file.

1. Build and test a new numeric `major.minor.patch` version in the desktop repository.
2. Upload its EXE through the file library or desktop `tools/publish_monitor.py`.
3. Verify the stored file's SHA-256; the desktop publishing tool does this by downloading
   the uploaded bytes again without forwarding administrator credentials to storage.
4. Register `release-manifest.json` and the uploaded file ID on the installation page,
   or run the desktop publishing tool with `--publish`.
5. Check authenticated `GET /api/desktop-releases/stable` and download integrity.

The API validates metadata and ready file size; the publisher is responsible for verifying
the file hash. The desktop downloader always verifies both size and SHA-256 before offering
installation. Signed storage URLs expire after five minutes. They are issued on demand.

Published files cannot be renamed, moved or trashed; their containing folder cannot be
trashed either. A published version cannot be replaced, and the stable pointer cannot
downgrade. Publish a new corrected version for rollback of a faulty release. Existing
installed version directories and user data stay available on each PC.

Validation: `node --test test/desktop-releases.test.js test/operator-drive.test.js
test/operator-shell.test.js`, full `npm test`, and `node tools/check-monitor-ui.cjs`.
The screen checker uses an isolated fixture server and the locally installed Chrome.
Production auction data must not be used as test fixtures.
