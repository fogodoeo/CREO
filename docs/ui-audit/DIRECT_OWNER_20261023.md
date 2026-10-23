# First representative connection

Risk: Release (authenticated ownership state and shared vendor contact persistence).

## Result

An existing directory company without an established login account connects immediately after phone verification and representative consent. An empty or different trade contact no longer creates an administrator approval request. Existing login numbers and claimed companies cannot be overwritten. A missing contact is initialized in the same transaction across shared memberships; an existing contact, bank account, entries and company identity are retained.

Legacy pending applicants can complete their own request using “이 번호로 연결하기”. The page never grants access merely on load. Cancelled/rejected requests are not revived on retry. Staff membership continues to require its representative's approval. A successful connection enters required account setup or the company's normal work page.

## Verification

- `node --test test/vendor-owner-setup.test.js test/vendor-access.test.js test/vendor-access-landing.test.js test/vendor-access-back.test.js test/vendor-self-registration.test.js test/vendor-preregistration.test.js test/vendor-required-setup.test.js`: 49 passed.
- `node --test test/vendor-owner-setup.test.js test/vendor-owner-setup-ui.test.js`: 12 passed. Covers repeated and concurrent submission, competing representatives, restart, failed transaction rollback, same-request retry, established-owner/login protection, verified session/CSRF/consent, legacy pending completion and superseded applicants, legacy admin review, cancelled/rejected/inactive boundaries, contact and bank preservation.
- `npm test`: **1819 passed, 0 failed**. Initial sandbox run had 11 loopback HTTP permission/readiness failures; the full suite passed with normal local networking.
- Desktop `python -m unittest discover -p "test*.py"`: **279 passed**. Initial sandbox run failed temporary-folder access; the same full suite passed outside the sandbox. No desktop source change or running desktop restart.
- `npm run check`: passed. Final label-only adjustment (secondary pending status button) followed by UI/landing tests: 10 passed.
- Actual CUA 320px isolated browser: first connection; one injected HTTP 503 retains consent and actionable retry; retry reaches own account setup with initialized contact; legacy pending request connects directly. All fixture accounts, SMS and storage are isolated. No production onboarding test or notification sent.
- better-interface review applied to this complete connection flow using its six domain skills: one primary connection action, visible company and phone, labelled native consent, readable existing type/color tokens, visible recovery, no motion introduced. No claim of a full-portal or 200% zoom review.

Evidence: `scratch/admin-home-review-20261022/direct-owner-{server-release,desktop-release,check}.log`, `direct-owner-{error,connected,pending}-320.png`, and release before/after snapshots. Production verification follows deployment.

## Limits

As requested, first-company ownership relies on verified phone possession plus representative declaration; there is no independent business ownership review. Established account transfers remain guarded. The broader UI refresh remains in progress.
