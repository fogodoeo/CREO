# November 2026 national broadcast applications

The announced five-date cycle starts again with Seoul/Incheon on November 9:

| Broadcast (20:00 KST) | Region | Applications open (KST) |
| --- | --- | --- |
| 2026-11-09 | 서울·인천 | 2026-10-26 |
| 2026-11-11 | 경기 | 2026-10-28 |
| 2026-11-16 | 전라·충청 | 2026-11-02 |
| 2026-11-18 | 대구·경북 | 2026-11-04 |
| 2026-11-23 | 부산·울산·경남 | 2026-11-09 |

Only these five dates are added to the application calendar. October's announced dates and recorded participation remain accessible. November 2 and 4 remain closed. The existing four ordinary entries per vendor, regional eligibility, two-week application window, manual pause and capacity settings remain in force. The explicit November mapping is shared with round preparation so channel titles match the application calendar.

Verification (2026-10-30):

- Focused national broadcast/round tests: 55 passed.
- `npm run check` and `git diff --check`: passed.
- Full Node suite: 1,922 passed, zero failures.
- Existing CDCUP suite: 137 run, 136 passed; pre-existing missing `niimprint` dependency in printer fallback test. No desktop code changes.
- New test covers all five regional dates, the day before/on each opening date, wrong-region rejection, duplicate concurrent requests, restart and correct prepared-round titles.
- Isolated SQLite + fake SMS browser check at October 30: the November calendar displays all five dates; November 9 opens a four-slot registration form for a synthetic Seoul vendor. No live vendor application or notification used for tests.

Operational release: prepare the five production rounds after deployment; preserve the existing broadcast selection until the next show is intentionally activated. Production screenshots and release receipts are kept with the local task evidence.
