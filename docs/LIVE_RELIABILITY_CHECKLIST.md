# Live reliability verification policy

Use risk-based verification so broadcast-critical state receives backtests without running every expensive check for cosmetic work.

## Risk levels

| Risk | Typical changes | Required verification |
| --- | --- | --- |
| Low | copy, color, spacing, static label | syntax check and targeted visual inspection |
| Medium | isolated parser, formatter, one UI control | focused tests plus one adjacent regression path |
| High | bid acceptance, sold/reopen, assignment, queue, session, channel switch, shipping state | focused invariant backtest and `npm run check && npm test` once stable |
| Release | desktop/server contract, public payload, persistence or deployment | high-risk checks, both repository suites, real-screen check, and read-only production verification |

Use the higher level when uncertain.

## Stateful invariant matrix

Exercise only the rows relevant to the changed state machine:

- repeated request produces one durable effect;
- repeated participant keeps one identity and does not repeat assignment, chat, animation, or totals;
- concurrent participants follow the defined order;
- stale or reordered saves cannot overwrite newer authoritative state;
- reload/reconnect does not replay completed effects;
- restart preserves session assignments and frozen sold results;
- timeouts and storage failures fail closed without blocking the auction;
- waiting → live → sold/passed → reopened → archived → next-session boundaries remain valid;
- channels never share data, cache, capture, or broadcast state;
- public output contains no phone number, raw platform member key, or admin data.

Queue changes must also prove FIFO order, duplicate suppression, bounded backlog timing, and non-blocking bid acceptance.

## Resource controls

- Run the focused test first and the full suite only after the implementation stabilizes.
- Rerun the full suite only after material changes.
- Prefer injected clocks, fake repositories, controlled concurrency, and deterministic random input over sleeps.
- Use isolated temporary storage; production checks are read-only unless explicitly authorized.
- Convert every confirmed regression into a focused automated test where deterministic testing is possible.

## Required commands

```text
npm run check
npm test
git diff --check
```

For a desktop/server contract change, also run from the desktop repository:

```text
python -m unittest discover -p "test*.py"
```

Validate changed Korean text files as strict UTF-8 and scan for `U+FFFD` before commit.

## Completion evidence

Report the risk level, invariants exercised, exact test counts, real-screen and production checks when required, and remaining external assumptions.
