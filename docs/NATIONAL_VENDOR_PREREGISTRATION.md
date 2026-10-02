# National vendor preregistration

Risk: release (authorization, encrypted persistence and deployed onboarding).

- Common national onboarding defaults to operator preregistration. The legacy
  self-registration route is disabled unless the private channel setting
  vendor-access-policy explicitly selects self-registration-v1 (legacy fixtures).
- Administrators use national-vendors.html, linked from the national workspace
  and broadcast management page. Register name, one of five regions and owner
  login phone. Existing national vendors retain their IDs and financial records.
- Login phone is encrypted in the access directory. It never appears in public
  vendor records or the authenticated vendor search response. Initial contact
  equals login phone for new vendors; subsequent contact changes do not grant
  or transfer membership.
- The current session must contain the verified SMS/Kakao phone to claim the
  preregistered company. Claims and approvals use directory CAS. A claimed
  company's login number cannot be overwritten through preregistration.
- Staff select a company and request owner approval. The owner must connect
  first. Approval requests use the existing vendor_join_requested notification
  configuration; no new outbound transport or template is configured here.
- Existing connected vendors continue to enter their calendar. General auction
  direct links and general phone matching are unchanged.

Verification: vendor-preregistration.test.js covers admin/CSRF boundaries,
number mismatch, Kakao and SMS ownership, missing phone, duplicate/concurrent
writes, restart, staff approval, contact separation, inactive vendors, existing
record preservation, revoked sessions, and atomic storage failure.
The isolated browser fixture is tools/national-vendor-preview.cjs (port 4347);
it uses fake numbers and an isolated database, with no outgoing real messages.

2026-10-02 verification: npm run check passed; focused access/landing/channel
tests passed 14/14; npm test passed 900/900 (including the eight pre-existing
untracked local prototype tests); desktop unittest discovery passed 203/203.
Rendered checks at 390px and 320px covered owner selection into the calendar,
staff request and owner approval, and administrator registration/save. At 320px,
document scroll width equaled viewport width. Only isolated fixtures were used
for write tests. Production had zero national vendors/reservations before deploy.

Separate pending work: national auction/settlement data still uses the shared
national-cre channel. A date picker alone cannot isolate payments and totals.
The proposed settlement UX is latest participated auction by default, with a
date selector; it must follow actual per-round financial isolation.
