# Buyer library entry and recovery

Scope: personal collection login landing, incoming trade link, link preview/add, list/detail/round navigation, read failures, phone-consent guidance and session changes. Existing vanilla HTML/CSS/JS and native buttons/dialog are retained. The collection stays read-only with respect to payments and shipping; the original trade link returns to its existing checkout page.

## Findings and changes

| Severity | Owning domain | Evidence and result |
| --- | --- | --- |
| High | Accessibility / writing | `public/buyer-library.js` hid retry on opening detail and caught failures with only a top error. It now announces loading, focuses a persistent error and retries the exact requested detail/round or list operation. A 12-second request timeout releases stalled controls. |
| High | Interaction | Actual 320px iframe first login click was consumed by focus-triggered session clearing. Signed-out focus now keeps the existing login form, while authenticated/invalidated sessions retain their privacy revalidation. A regression test and actual one-click login verified the fix. |
| Medium | Layout / writing | Link connection finished at the general list, and a successful connection followed by failed list loading appeared to be a failed addition. The final add action now opens the connected grant; subsequent read failure explicitly says addition succeeded and offers a read-only retry. |
| Medium | Writing | Empty state did not explain where the link comes from. Phone-consent state also told buyers to use a disabled add button. The empty state now names the Kakao notice link, and missing consent shows the re-login action without the unavailable add instructions. |

Preview now shows date, count and amount before the explicit add action. Busy close/submit/input controls are locked; validation is associated with the field and focuses it. API errors focus the persistent dialog error, preview focuses its summary, detail focuses its heading, and returning to the list focuses the originating row. No animations or new dependencies were added. Existing focus, spacing, typography and colors are reused.

Risk: high client authentication/navigation boundary, release verification for deployment. No authentication provider settings, tokens, permission rules, collection storage contracts, auction data, financial calculations or notifications were changed.

## Verification

- `node --test test/buyer-library-entry.test.js test/buyer-library-rounds.test.js test/buyer-account.test.js test/buyer-auth-lifecycle.test.js test/buyer-link-access.test.js test/checkout-round-continuity.test.js test/checkout-round-picker.test.js`: **72 passed**.
- New eight-test full-page DOM harness covers validated return links, no-phone/empty state, first-focus login preservation, validation/preview/final addition, duplicate submit and close locking, lost-response retry with the same receipt, success-followed-by-read-failure without another POST, exact round retry/prior-content preservation, back focus, timeout recovery, and late private responses after sign-out.
- Adjacent auth/collection tests cover owner and CSRF checks, duplicate/concurrent writes, rollback, restart, expiry, revocation, archived rounds and stale/reordered reads.
- `npm run check`, explicit changed JS/CJS parse, strict UTF-8 and `git diff --check`: passed. No bulk encoding/line-ending rewrite.
- `npm test -- --test-concurrency=4`: **1,785 passed**, 0 failed.
- Desktop `python -m unittest discover -p "test*.py"`: **279 passed**.
- Actual CUA synthetic provider + isolated SQLite at 4422: login preserves the incoming link, previews 10/19 two items, injects a lost successful response, retries and opens those two items. Adds 10/21 separately; an injected list failure after success offers read-only retry and opens B03. Exactly three connect requests (two for the first receipt, one for the second), zero notifications. Back returns focus to its date row; sole-round detail has no redundant selector.
- Actual two-tab logout clears the other tab's private items. A different simulated account without a phone has only the consent/re-login next action; reauthentication restores the correct original account's two rounds. Escape closes the link dialog and restores focus. The return link opens the original 10/21 checkout with one item, without saving shipping or payment.
- Actual 320px dialog/list and desktop renders inspected. New instructions fit, errors remain readable, native modal locks background, and Enter/Tab/Escape paths work. Desktop width and scrollWidth both 1280; main action height 52px. Rendered error `#b42318` on white measures **6.57:1**, muted text `#5e6978` **5.57:1**, focus/link `#1d4ed8` **6.70:1**.
- Evidence in `../admin-home-review-20261022`: `buyer-library-focused.log`, `buyer-library-server-full.log`, `buyer-library-desktop.log`, `buyer-library-check.log`, `buyer-library-connect-error-320.png`, `buyer-library-rounds-320.png`, `buyer-library-rounds-desktop.png`.

The provider is deliberately simulated: no real Kakao credentials or production records were used. Actual external Talk-app authorization, 200% browser zoom and a complete screen-reader walk were not verified here. The broad all-role UX objective remains in progress.
