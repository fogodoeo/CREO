# New-channel broadcast defaults, standby reveal and CRT banners

## Scope and risk

Release risk: versioned channel defaults are persisted, and P2 now follows the authoritative auction mode when revealing an item. No live auction records, messages, bids or winners were used for testing. No notification or BAND ingestion code changed.

- Channel creation offers Base / Pixel plus an independent palette, with an inline sample. New channels start with Base / Graphite.
- New channels receive `broadcastDefaults.layoutPreset: standard-v1`. P1 host/banner/ticker, P2 top information/lower peripherals and P3 centered rankings share the approved starting layout. Existing channels retain their saved positions.
- Defaults contain no event name, host identity, items, bids, winners or past banner selection. P3 starts with vendor and buyer rankings enabled, rotating every 10 seconds; specialized competition profiles retain their rules.
- P2 standby renders an original gecko silhouette, `???`, progress, banner and ticker. Selected/stale item identity, price, bids and parents are hidden until state mode is live or sold. An invalid active item does not fall back to a different item.
- The start reveal runs once per transition, not on bid polls or reload. Reduced-motion users get an immediate transition. P2 polls the lightweight pulse every 700 ms while visible, including standby; hidden pages retain their existing slower interval.
- P2 layout editor provides Item / Waiting scenes. The waiting card has independent position, size, visibility and opacity. The selector waits for iframe readiness, and preview choices never mutate auction mode.
- Pixel banners use a scalable CSS CRT shell around the existing media player. Its double buffering and playlist logic are unchanged. Base banners remain undecorated.

## Verification

- `npm run check`: passed.
- `node --test`: 704 passed, 0 failed. Includes eight focused standby/default/editor regressions and real temporary SQLite create/save/reopen/reset/version-conflict tests.
- Desktop: `python -m unittest discover -p "test*.py"`: 192 passed.
- Changed HTML inline scripts and JavaScript parsed; 19 release source/test files passed strict UTF-8 decoding and replacement-character checks. `git diff --check` passed.
- Actual local browser, isolated SQLite API fixture at port 18849: create Pixel channel, save, reopen, switch Base, and verify a new empty channel's waiting layout.
- Local `auction-transition` start endpoint: mystery removed and A01 information/parent photos appeared; two real public banner videos continued playing inside the CRT frame.
- P2 editor: waiting scene, Y 26%, height 32%, opacity 85% saved and verified after reload. P1 host/CRT/ticker and P3 vendor-to-buyer rotation visually checked at 1920 x 1080. Base waiting state also visually checked.

## Deployment and limits

Push to the existing Render main branch; verify health, served cache keys and assets, then inspect the production studio read-only. Existing browser sources need one reload to load new JavaScript/CSS. No production start/award/message test is permitted as part of this release.

The reveal depends on the existing network path from BAND monitoring to the server; 700 ms is a polling interval, not a latency guarantee. Stream encoding and PRISM-specific rendering were not exercised; tests use the shared Chromium renderer and the actual local API. New-channel defaults do not rearrange an existing saved channel layout.
