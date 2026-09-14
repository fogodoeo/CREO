# Vendor navigation and auction participation — 2026-09-14

## Scope

- Bottom navigation uses a red dot for incomplete entries/profile. No visible registration text; accessible link names retain the status. Entry/profile copyright is centered.
- Entry-list refresh retains the last confirmed profile state while the next request is pending or fails. Obsolete responses cannot overwrite a newer profile response/save.
- Operators can explicitly link an existing participation record to the common vendor profile. Same-name matches only suggest an operator action; they never grant access automatically.
- Existing vendor IDs, auction items, payments, shipments and links remain valid. The default is the newest active participating auction; an explicit auction selection takes precedence.

## Risk and boundaries

High/release: common vendor membership controls access across auctions. The endpoint requires operator authorization and expected revisions/target identity. A directory document commits membership and the previous-profile audit together. Per-channel and owner locks prevent an in-flight entry/photo write from being retired during linking.

Linking refuses conflicting contact/payment details, a target already connected to several auctions, and any target with saved entries, parents, photos, request history or unreadable owner data. Populated independent profiles require a separate migration; they are not silently merged. Creyon branch identity is explicit and remains separate for each branch. 오늘도마뱀 is not linked to 쭌이네.

## Verification

- `node --test test/vendor-directory.test.js`: 6/6. Persistence failure/retry, concurrency, restart, idempotency, identity/revision conflicts, information preservation and owner-data boundaries.
- `node --test --test-name-pattern="participation" test/platform-api.test.js`: 2/2. Existing bearer links, auction selection/default, unrelated same-name vendor denial, item isolation, and locking around a concurrent owner write.
- `npm run check`: passed.
- `npm test`: 664/664 in the current working tree (650 tracked tests and 14 pre-existing unrelated local Dodosi tests).
- Desktop `python -m unittest discover -p "test*.py"`: 189/189.
- `tools/check-vendor-registration-ui.cjs` exports a browser regression using an injected isolated loopback fixture and Playwright runtime. The local runner is `scratch/checkout-redesign/vendor-history-ui-run.cjs` in the desktop workspace. It exercises 320/390/520px, dot-only navigation, accessibility labels, aligned touch areas, centered copyright, delayed/failed profile refresh, profile registration, entry submission, settlement navigation, auction switching, reload and intake closure. No browser JavaScript errors.
- The same browser test with `--before` (the `b000cec` entry app) fails at `incomplete card must remain visible during refresh`; the updated app passes. Empty/completed screenshots were visually inspected.

Production verification and the explicit five-branch configuration link are recorded locally after deployment. No production auction records are used for regression tests; no vendor/buyer notification is sent by these tests.
