# Vendor back navigation and integrated preview — 2026-10-02

Risk: release for the public login fix; medium for the local preview router/data loading changes.

## Reproduced defects

1. In the real vendor access UI, Phone login → top-left Back threw `Cannot read properties of undefined (reading 'length')`. The old destination object eagerly evaluated `state.companies.length`, even when the destination was simply Login. Anonymous sessions do not include a company list. Explicit branch selection now avoids reading unrelated state and safely handles missing directory lists.
2. The 4343 local prototype mounted checkout in a separate 4345 iframe on every settlement visit. The previous navigation-style fix did not remove this architectural separation. The prototype now renders settlement inside its own main content with one persistent header/navigation and no iframe.

## Scope

- Production: login Back fix and cache version update only. Existing production pages still use their established page URLs; this release does not convert the production financial UI into a single-page application.
- Local 4343: native settlement content, selected navigation state and preserved filters; existing checkout API called against synthetic temporary records on the same origin. The 4345 server is no longer required.
- Local settlement supports viewing and filtering the preview data; no production payment mutation was added. Prototype files remain local and are not published with the login fix.

## Verification

- `node --test --test-isolation=none test/national-cre-preview.test.js test/vendor-access-back.test.js`: 14 passed.
- `npm run check` plus `node --check` for preview app/server/store: passed.
- Full `npm test`: 918 passed, including local-only prototype tests in this worktree.
- Desktop `python -m unittest discover -p "test*.py"`: 203 passed.
- Cache tests: duplicate in-flight requests, fresh snapshot reuse, stale refresh, failure/retry, retaining successful data on refresh failure, company switching, and logout before a late response.
- Actual browser: Phone login → Back returns to Login. Fake-SMS OTP → Back returns to Phone, then Back returns to Login. No real SMS sent.
- Local browser: Broadcast → Settlement → Profile and browser Back keep exactly one selected navigation item; filter selection survives tab navigation; DOM contains zero iframes and one vendor navigation.
- 320px and 390px rendered checks: no horizontal overflow; menu positions and labels stay consistent. Error-state data handling has deterministic tests; network failure was not injected into the rendered browser.
- Strict UTF-8 and replacement-character checks passed for all nine changed code/test files. `git diff --check` passed.

Physical mobile devices and live financial actions were not tested.
