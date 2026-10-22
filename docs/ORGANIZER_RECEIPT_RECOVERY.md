# Legacy organizer receipt recovery (2026-10-23)

The organizer page previously blocked every vendor's deposit whenever any legacy
receipt in the channel lacked item IDs. The page exposed only a count, leaving no
way to classify the record. This is independent of confirming a bank deposit.

The organizer-only response now lists unresolved receipt amounts, dates, statuses
and candidate rounds. The operator explicitly selects a round. Assignment preserves
the existing record, amount and status; a pending report remains pending. No bank
transaction, buyer payment, message or refund is performed. Unknown records are not
assigned from dates or matching names automatically.

Only the affected vendor's new deposit waits for classification. Unrelated deposits
and cancellation of already scoped receipts remain available. The older review
endpoint now also checks the selected round and cannot bypass classification.
Assignment holds the channel mutation lock and checks the receipt amount/status and
exact vendor item set. Duplicate assignments are harmless; competing destinations,
stale targets and storage failures do not move or duplicate a receipt.

Risk: release (persistent receipt scope and private organizer payload).

- Focused API/UI tests: 139 passed.
- `npm run check` passed; complete `npm test`: 1,494 passed, 0 failed.
- Desktop `python -m unittest discover -p "test*.py"`: 270 passed.
- Synthetic local UI: affected vendor blocked with an explicit recovery button;
  archived round assignment; other unresolved vendor retained; newly unblocked
  vendor deposit saved and balance refreshed. Narrow 320px layout checked.
- The label refinement identifying a provisional balance received the focused UI
  suite after the full run. UTF-8, syntax and diff checks run before commit.
- Local preview: `node tools/organizer-receipt-scope-preview.cjs`, port 4371.

Production verification must use read-only requests after deployment. Actual legacy
receipt classification requires identifying the correct round; the release does not
silently classify the 12 records observed on the production `national-cre` channel.
