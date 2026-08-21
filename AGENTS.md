# Repository working rules

## Encoding safety

- Treat HTML, JavaScript, and CSS as UTF-8.
- Do not bulk-resave files containing Korean text with PowerShell `Get-Content`/`Set-Content`.
- Use `apply_patch` for focused edits and inspect diffs for encoding or line-ending rewrites.
- Verify suspicious Korean output with `fs.readFileSync(path, 'utf8')`; restore any corrupted file before continuing.

## Risk-based verification

- Read `docs/LIVE_RELIABILITY_CHECKLIST.md` before changing auction, broadcast, persistence, channel, shipping, session, assignment, or queue behavior.
- Use focused tests during iteration; cosmetic changes do not require the full suite.
- Add a deterministic regression test for each reproduced behavioral bug.
- High-risk state changes require relevant duplicate, concurrency/order, reload/restart, failure, and lifecycle-boundary checks plus one full repository suite before commit.
- Cross-repository or deployment changes require both repositories' suites, a local real-screen check, and read-only production verification.
- Never backtest against production auction records.
- Report exact evidence and residual risk; passing tests alone do not justify claiming perfection.
