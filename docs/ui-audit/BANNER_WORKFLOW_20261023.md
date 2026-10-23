# Banner selection and registration verification

Scope: saved banners, round-specific selection, image/video registration, upload/metadata retry, draft protection, and the containing broadcast editor. Existing logo and dice-video forms are separate remaining work.

Risk: high client state/lifecycle, release verification for the accumulated UI batch. Existing banner API and persistence contracts are unchanged.

## Changes and observed behavior

- Saved banners come first. Search, selected-only filtering and reset have explicit recovery paths. New registration is a disclosure; an empty library opens it immediately.
- Selection says it immediately affects this round's P1/P2. Other rounds keep their own selection.
- File/name survive upload failure, metadata failure and expired authentication. Metadata retries reuse the uploaded URL; the server's URL-derived ID prevents duplicate records.
- Upload/selection writes lock duplicate input. Closing or clearing an unfinished registration asks before discarding. Successful registration uses the response directly rather than relying on a follow-up read.
- Native confirmation dialogs and visible focus support keyboard recovery. Closing returns to the invoking editor button. Parent controls are inert while the selection window is open.
- Actual desktop and 320px checks exposed nested scrollbars and excessive studio chrome. The banner window now fills the available studio viewport. At 320px, the content clientWidth and scrollWidth both measured 305px, with a single scrollbar and 700px height.
- The primary button's measured white-on-blue contrast was 4.40:1. Its blue was darkened to #306bed; the rendered pair is now 4.72:1. Input text is 16px and controls have at least 44px height.

## Verification

- `node --test test/banner-library-ui.test.js test/studio-settings-ui.test.js test/studio-layout-editor-ui.test.js test/operator-studio-scope.test.js`: 28 passed.
- `npm run check`: passed. Changed JS and inline HTML scripts also parsed; changed files decoded as strict UTF-8 without replacement characters.
- `npm test -- --test-concurrency=4`: 1,703 passed, 0 failed. Includes concurrent same-URL metadata registration, restart, round isolation and storage failure API coverage.
- Desktop `python -m unittest discover -p "test*.py"`: 270 passed.
- Real isolated upload: one file upload, two metadata requests after an injected HTTP 503, one saved banner. File picker/upload was completed once; subsequent verification reused the saved test banner.
- Actual desktop and 320px UI: open, add, close-with-draft, keyboard continue, explicit discard, return focus, selected round label, saved selection, and no horizontal overflow. No production test records or real notifications were created.

Evidence outside the repository: `scratch/admin-home-review-20261022/banner-workflow-error.png`, `banner-studio-final.png`, `banner-studio-320-final.png`, `banner-release-server-final.log`, and `banner-release-desktop-full.log` in the desktop checkout.

Residual work: full 200% browser zoom and screen-reader journey, standalone logo/video forms, and the broader role-by-role integration audit remain open. Passing these checks does not complete the overall UX goal.
