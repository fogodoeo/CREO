# Organizer shipping remittance

The organizer configures bank details and a notification phone per channel at `organizer-shipping.html?channel=...`. Only an authenticated operator can edit these fields or confirm receipt. The notification phone is excluded from vendor payloads.

Vendor flow: outstanding shipping fees → copy bank account → “배송비 입금했어요” → confirm amount → pending organizer review. The full shipping fee includes buyer payments still pending. Reporting a transfer does not confirm a bank transaction. The organizer reviews a fixed amount and the bank account snapshot, then confirms receipt or marks it unpaid. Confirmed amounts reduce outstanding fees. Later fee changes leave the reported amount unchanged; overpayments remain visible.

Reports and SMS queue records are persisted in the same repository transaction under a channel mutation lock. A pending report blocks duplicate reports; request identities survive reload/restart. The new `organizer_shipping_reported` event uses SMS directly with the organizer's configured number. No Kakao template is involved. The existing server queue sends and retries without the desktop app. A sent status means provider acceptance, not proof of handset delivery. The message stays within the provider's 90-byte UTF-8 budget, shortening long vendor names only.

Storage: private channel configuration rows `creo_organizer_shipping_bank::<channel>` and `creo_organizer_shipping_ledger::<channel>`; notification records use the existing channel notification store. Historical transfers made before this ledger existed are not inferred or marked paid automatically.

Design references: [Daangn SEED](https://seed-design.io/) for consistent components and [Toss's internal-tool design process](https://toss.tech/article/1st-product-designer-tools) for removing repetitive work. Amounts precede actions; account settings and detailed breakdowns are collapsible; completed vendor cards compact. These are design references, not a claim of conformance to a Toss specification.

Risk: release (persistent settlement history, new SMS event, public vendor payload).

Verification: focused platform API scenarios cover duplicate/concurrent reporting, authentication and vendor/channel isolation, stale amounts, storage failure, restart, repeated/conflicting reviews, changed shipping fees and rejection/re-report. Full `npm run check`, `npm test`, and desktop `python -m unittest discover -p 'test*.py'`. Local isolated SQLite UI run covers account/phone registration and the complete reporting/review flow. Local outbound SMS is disabled; no production settlement or real message is created during verification.
