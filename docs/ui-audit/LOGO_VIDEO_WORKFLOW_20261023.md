# Logo and video workflow review — 2026-10-23

Scope: broadcast settings → sponsor/vendor logos and BASIC dice videos. Risk: high client workflow; release verification before deployment. Existing asset API, video optimizer, auction protocol and financial persistence are unchanged.

## Findings and implementation

| Severity | Location | Before | After | User impact |
| --- | --- | --- | --- | --- |
| High | auction-control.html asset form | Upload and metadata save were separate; errors were transient toasts and retries could create another record. | One Save uploads and persists, retains input after errors, caches the successful upload and retries with a stable ID. | A failed response does not require choosing the file again or create duplicate entries. |
| High | logo dialog and dice file handlers | Close/reset could discard work; dice input cleared after failure; parent did not receive the round scope. | Native modal, explicit discard, synchronous busy lock, input/draft propagation with channel/page, recoverable explicit dice save. | Keyboard access, navigation and reauthentication preserve the current task. |
| Medium | asset library/form | Registration form, raw URL and optional fields dominated the first view. | Library first; Add/Edit opens the form; URLs/order/links are disclosed separately. | First action is clear and daily controls require less scanning. |
| Medium | 320px rendering | Outer document and dialog both scrolled; checkbox wrapped into an oversized row. | One scrolling dialog body, aligned checkbox and reachable save actions. | The form works at narrow widths. |
| High | inherited primary button color | Rendered white on #3370f5 was 4.40:1. | Scoped existing action token #306bed, measured white contrast 4.72:1. | Button text meets the small-text contrast requirement. |

## Verification

- `node --test test/studio-asset-editor.test.js test/studio-settings-ui.test.js test/platform-pages.test.js`: passed. New focused asset cases: 9.
- New tests cover duplicate and concurrent submission, lost committed response, upload/metadata failures, upload reuse and file replacement, authentication relay, native discard, source/channel checks, late response across rounds, dice replacement, API restart and isolated storage failure. SQLite integration confirms one asset ID, unchanged items/active round, and no cross-channel records.
- `npm run check`: passed. New JS and changed inline scripts parsed separately; strict UTF-8 and diff checks are recorded with the release.
- Final `npm test -- --test-concurrency=4`: 1716 passed, 0 failed. First run: 1713 passed, 2 obsolete HTML-only source assertions failed after extracting asset code; fixtures now read the loaded module.
- Desktop `python -m unittest discover -p "test*.py"`: 270 passed. Desktop source unchanged.
- Actual isolated UI: native Add/Edit/Close, discard/continue, selected image and title preserved after HTTP 503, keyboard retry, and durable reload. Counters after first retry: 1 binary upload, 2 metadata writes, 1 record. All synthetic local data; no production writes or messages.
- Actual 320px layout: document clientWidth = scrollWidth = 320; document overflow hidden while modal open; one body scrollbar. Tab reaches Save with visible focus; error receives focus and retry saves. Final primary measured RGB(48,107,237)/white; error RGB(255,225,225) on RGB(53,30,38) is 12.53:1.
- Production login supplied by owner was used normally. Read-only main inspection confirmed 10/21 organizer scope, switching to 10/19 shows distinct Gyeonggi totals/vendors, and overall directory shows all five broadcast dates and 44 program vendors. Main restored to 10/21. No payment, notification or broadcast switch was performed.

Evidence in `../admin-home-review-20261022/`: `logo-save-retry.png`, `logo-error-320.png`, `logo-library-320-final.png`, `logo-library-desktop-final.png`, `logo-editor-focused.log`, `logo-editor-server-final.log`, `logo-editor-desktop-full.log`, `operator-home-live.png`, `operator-directory-live.png`.

Deployment: commit `36d583d390a427b3ca23e94962cf65e6961c9930`, Render `dep-dbde5qc9v7es73dsco00` Live (1m50s). Read-only production checks: 28 static files match; health/durable storage OK, outboxPending 0, mirrorError null; four national channels preserve exact item/shipment/organizer-settlement/broadcast hashes and active channel stays 10/21. Actual authenticated production studio opens the new library and Add form with the correct 10/21 heading; no asset or configuration was saved. Evidence: `logo-video-release-before.json`, `logo-video-release-after.json`, `logo-library-production.png`, `logo-form-production.png`. Final adjacent tests after the last copy/color polish: 27 passed. Local preview proxy stopped after verification.

## Coverage and verdict

Accessibility, layout, writing, typography, colors and UI reviewed for library, add/edit, busy, error/retry, discard and narrow states. Native modal and normal scrolling used; no new animation. Approve for this scoped workflow after release checks. Actual large-video transcoding, 200% browser zoom, full screen-reader navigation and the rest of the broader product UX goal remain unverified/pending. The existing optimizer is preserved; file-size/type rejection and dice retry are covered deterministically.
