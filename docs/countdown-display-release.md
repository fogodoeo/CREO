# Countdown status display, 2026-10-18

Release risk: desktop/server signal contract and public broadcast UI. Display-only: bid acceptance, countdown chat/timing, closing and settlement are unchanged.

Validation:
- Server syntax check and full suite: 1,232 passed.
- Focused desktop countdown, display publisher and platform manager: 31 passed.
- Full desktop suite: 136 passed, 1 unrelated printer dependency error. The published `niimprint==0.0.1` installed on this PC lacks `BleTransport`; `test_connection_failure_on_usb_uses_next_bluetooth_attempt` fails in unchanged printer code. No printer changes were made.
- Synthetic browser: 12 cases at 1920, 1280 and 676 px, including expiry without a network update and no renewal from re-rendering. Badge image inspected. Existing caption layout: 24 cases passed.
- Display signal tests cover authentication, channel scope, active item, duplicate/reordered signals, disconnect expiry, sold/standby, next item and server restart. Production auction records were not used as test fixtures.

Deployment requires both repositories. The web release alone cannot detect a countdown from an old monitor. The other laptop must update its three Python files and restart the monitor; live end-to-end confirmation on that laptop is still required.

Operational data changes requested alongside this work:
- 오늘도마뱀 already had a claimed national vendor account. Copied its existing bank details from its earlier creyon-0917 profile after matching phone identity. Kept its national profile and entry records separate because they already contain entry data; no forced profile merge. Restored/verified 경기 region through the booking region configuration.
- Kept the October 19 경기 booking date. Put the existing national channel in standby/P1 and changed the ticker to 경기/October 19. Removed the obsolete first-broadcast shipping promotion from the ticker. Previous item, shipment and layout snapshots were verified unchanged.
