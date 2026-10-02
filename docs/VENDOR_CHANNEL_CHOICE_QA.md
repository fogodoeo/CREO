# Vendor channel selection — 2026-10-03

Risk: release (public navigation). No payment or auction data mutations.

- Common authenticated entry now stops at channel selection even for a single connected national company. Only 전국크레자랑 is listed.
- Multiple-company selection, connected-directory selection, owner claim, and new registration all lead to the same channel choice. The existing selection API still validates access when entering the broadcast.
- Broadcast header offers a channel-selection return link, preserving the company. Explicit profile links and phone verification/staff approval flows are preserved.

Verification:

- `node --test --test-isolation=none test/vendor-access-landing.test.js test/vendor-access-back.test.js`: 6 passed.
- `npm run check`: passed.
- `npm test`: 920 passed (including local prototype tests in this worktree).
- Desktop `python -m unittest discover -p "test*.py"`: 203 passed.
- CUA, isolated actual production-code fixture at 4346: authenticated entry → channel selection → explicit national selection → broadcast → channel selection. Correct company preserved; only one channel offered.
- 320px and 390px rendered checks; no horizontal overflow. No production data or real SMS used.
- `git diff --check` and strict UTF-8/replacement-character checks: passed.

This release adds the channel-selection step to the live web UI. It does not convert the existing production settlement pages to a single-page application or change channel membership policy.
