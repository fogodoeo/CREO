# Seoul–Incheon broadcast region — 2026-10-05

Risk: release. This changes the national channel's region labels and eligibility mapping; the five-position rotation and transport timetables stay unchanged.

- First region: 서울·인천. Legacy 서울, 인천 and 서울+인천 labels map to index 0. Legacy eight-region Incheon index 1 maps to index 0; an explicit 경기 setting remains authoritative.
- Company registration, preregistration, search, profile and booking views use the same canonical label. Numeric cycle/booking indices remain stable.
- Incheon transport origins and localities belong to 서울·인천. Route IDs, departure/arrival days, addresses, source URLs and coordinates are preserved. Existing departure-shop selections keep working.
- Mobile calendar uses two lines for 서울·인천. Same-brand shops sharing one district show their branch areas, including 크레리즘 청라 and 검단.

Validation:

- `npm run check`: passed.
- `node --test`: 979 passed, 0 failed. Includes alias compatibility, canonical and legacy registration/search, region correction followed by return to a previously cancelled date, duplicate requests, restart persistence, concurrency, failed saves, and unchanged Incheon transport dates.
- Desktop `python -m unittest discover -p "test*.py"`: 203 passed. Initial sandbox run encountered temporary-file permissions; rerun with normal temporary-file access passed.
- Isolated local UI: 320 px and 390 px viewports; October 14 Seoul–Incheon selection and five-entry form, October 19 Gyeonggi restriction, distinct Incheon branch options, and October 9 DODOSI deadline after selecting Cheongna.
- UTF-8, replacement-character and `git diff --check` verification before commit.

Production correction was explicitly requested: 크레리즘's October 19 booking was cancelled, region returned to index 0, and October 14 reserved for five animals. No saved entries or photos existed before the correction. Readback confirmed one active booking. Production health, asset hashes and the rendered calendar are checked separately after deployment.

Transport schedules remain reference information; vendors must arrange arrival before the broadcast. No carrier reservation is made by choosing a departure shop.
