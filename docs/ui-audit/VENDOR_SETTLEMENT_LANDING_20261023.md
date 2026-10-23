# Single-round vendor settlement entry

Production read-only verification after the UI batch reproduced an empty landing page for a vendor whose only financial round was the dated 10/21 channel. Its existing program link opened `national-cre / current`; the selector then invented an empty program option alongside the real settlement round.

The picker now resolves an empty, undated landing context to the latest authorized financial round. It does this only when the current context is absent from the financial catalogue, has zero items/buyers, and has no pending edit or operation. A sole real round is shown as a date label without a selector. Explicit dated/archive links, populated rounds and catalogued financial contexts remain untouched.

Read-only navigation failure preserves the original scope and exposes retry. Concurrent refreshes share the same request/switch; reload at the resolved URL stays on that date. No financial records, balances, reports or notification methods change.

Risk: high verification scope because the client selects financial context. No server persistence changes.

Verification:

- `node --test test/vendor-settlement-picker.test.js test/vendor-settlement-rounds.test.js test/vendor-checkout-flow.test.js test/vendor-settlement-status-ui.test.js test/vendor-finance-view.test.js`: 28 passed.
- `npm test -- --test-concurrency=4`: 1,707 passed, 0 failed.
- Changed JS/CJS and inline page scripts parsed; strict UTF-8 verified. The desktop source is unchanged since the same release's 270 passing tests.
- Isolated SQLite fixture `tools/vendor-settlement-landing-preview.cjs`: empty program member + one dated sold item. Actual browser entry at `/` resolves to the dated channel, shows one item and settlement work, and hides the redundant selector.
- Regression tests cover draft preservation, repeated in-flight refresh, failure/retry, explicit dated history, populated/current financial contexts, no-history vendors, and authorized round catalogue boundaries.

Production verification uses the existing vendor link and GET requests only. No production payment confirmation or message is used as a test.
