# Existing vendor first-login setup

Risk: release (authentication, durable ownership, public onboarding and deployment).

An active vendor could exist in the national directory without an access-company
record. Search displayed it, but selection only told the representative to contact
the operator; registering the same company was correctly rejected as a duplicate.

## Flow

- Brand-new companies keep immediate self-registration: verify a phone, enter the
  company name and region, and receive owner access without operator approval. The
  review queue below is only for connecting an existing directory record whose
  representative cannot be verified through its stored business contact.
- `/vendor-access.html`: authenticate, select region and existing company, then
  choose **대표 번호 연결하기**. `?company=<existing-id>` leads to the same screen
  after authentication, including a Kakao return through session storage.
- When the current verified phone matches the existing business contact, explicit
  confirmation creates the owner membership on that existing vendor ID.
- Missing or different business contacts require an operator review. An authenticated
  applicant supplies a representative name; the server uses the session's verified
  phone, never a submitted phone or actor ID.
- `/main` → 업체 관리 → 업체 접속 관리 displays pending requests first. Approval
  requires confirming the displayed company and verified number. No automatic
  operator SMS or Kakao message is sent by this feature.
- Approval initializes an empty business contact, including an existing shared
  profile, in the same transaction as ownership. An existing contact is preserved.
- Pending, cancellation and rejected/superseded results survive reload. Approved
  representatives proceed to their original company profile and existing memberships.

## Boundaries

This flow never merges companies by name, replaces an established representative,
creates a second vendor, imports auction items, activates a round, or rewrites money,
shipping or parent-photo records. A stored representative login number retains the
existing claim/staff workflow. A business-contact change is not a login-number reset.

Requests and decisions use the encrypted access directory, atomic CAS and the same
channel/profile locks used by profile edits. Duplicate submissions/approvals have one
durable effect. Competing applicants cannot both become owner. A changed identity,
contact, region or bank record invalidates a pending approval; membership-only round
preparation does not. The operator must reject a stale request and have it resubmitted.

This fixes first-login initialization for existing companies. It does not add automatic
membership to rounds prepared before a newly created company joins.

## Verification (2026-10-23)

- Focused: `node --test test/vendor-owner-setup.test.js test/vendor-access-landing.test.js test/vendor-access-back.test.js test/vendor-self-registration.test.js test/vendor-preregistration.test.js test/national-round-intake.test.js test/vendor-channel-access.test.js` — 44 passed.
- `npm run check` — passed.
- `npm test -- --test-concurrency=4` — 1,515 passed (normal loopback permissions).
- Desktop: `python -m unittest discover -p "test*.py"` — 270 passed.
- Initial sandbox-only full runs were blocked by loopback/temp-directory permissions;
  the UI harness also needed its new request/storage dependencies supplied. Both were
  resolved and the complete suites above passed.
- Local real-screen exercise used `tools/vendor-owner-setup-preview.cjs`, isolated
  SQLite and fake SMS. Region selection, immediate matching-phone connection,
  company deep link, missing-phone request, admin approval and return to the existing
  company profile all completed. The 320px viewport had no horizontal overflow.
- No real OTP, real representative claim or real operator approval was used for tests.
  Real-device SMS delivery and real Kakao consent were not re-exercised.
