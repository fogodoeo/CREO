# Outstanding financial rounds first

Observed production case: 크레용 대구본점, a generic vendor link with `event=national-cre`, opened the completed 10/19 round. Its catalogue already contained 10/26, with a 308,000 KRW remittance report awaiting confirmation. The populated old landing was intentionally excluded by the former empty-only redirect.

Generic vendor entry now uses the first authorized priority round once. Vendor home task targets and round catalogues share ordering: outstanding balances/unpaid buyers/reconciliation work, pending reports, completed rounds; newest date breaks ties. Buyer checkout groups put unpaid rounds before reported/paid rounds, preserving anchored sale links and explicit history.

No balances, receipts, payment flags, item ownership, notification methods or permission boundaries are changed. Separately, the requested production broadcast was switched through the existing operator dialog to 2026-10-28 부산·울산·경남. That prepared channel currently contains zero auction items.

Verification:

- `npm run check`: passed.
- `npm test -- --test-concurrency=4`: 1,841 passed, zero failed.
- Integrated current `origin/main` (R2/capture/panel changes) before release. Final `npm run check` passed; `npm test -- --test-concurrency=2`: 1,880 passed. One initial concurrent run timed out in the unchanged buyer-library-entry test's UI wait; that file passed 8/8 in isolation and the final full run passed. No unrelated test change was made.
- New regressions: populated old vendor entry, explicit history/reload, draft retention, failure/retry, one-time automatic routing, unpaid older buyer round vs paid newer round, anchored-link isolation, concurrent reads and restart with unchanged stored shipments.
- Local real browser: `node tools/vendor-settlement-landing-preview.cjs --populated`; generic 10/19 entry automatically selects outstanding 10/21; selecting 10/19 manually works. Labeled native selector and existing keyboard focus retained. No visual redesign.
- Production verification and release evidence are saved separately under the task output directory; no production payment writes or messages are used as tests.
