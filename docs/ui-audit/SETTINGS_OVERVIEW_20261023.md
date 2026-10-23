# Broadcast settings overview — 2026-10-23

## Scope and risk

Medium implementation risk, release verification required for deployment. The existing broadcast-state allowlist, changed-field saving and sequential draft model are unchanged. No production record writes, notifications or live-channel changes are part of this update.

- Whole settings use three native disclosures: 1P 진행 / 2P 경매 / 3P 집계. Removed the duplicate inner tab row and repeated obsolete-placement instructions.
- Additional hosts are collapsed when empty; saved names are expanded on first load. Collapsing does not remove or clear form controls. Existing compact settings keep their selected page.
- P2 secondary details follow its primary switches. Caption copy distinguishes BASIC's shared captions from independent per-page captions.
- Field labels are associated with their inputs. Settings are inert until the first accepted workspace load. Disabled save now has a distinct appearance.
- One scrolling document inside the full settings frame. At 320×700, reduced the outer editor's minimum height so its save footer stays within the viewport.

## Verification

- `node --test test/studio-settings-ui.test.js test/studio-settings-view.test.js test/studio-asset-editor.test.js test/platform-pages.test.js`: 67 pass, 0 fail.
- `npm run check`, explicit new JS syntax check, strict UTF-8 and `git diff --check`: pass.
- `node --test --test-concurrency=2`: 1720 pass, 0 fail.
- Desktop `python -m unittest discover -p 'test*.py'`: 270 pass, 0 fail.
- Initial focused run found an obsolete copy assertion and a linkedom details property/attribute fixture mismatch, both corrected. Initial full run with concurrency 4 ended one existing promo-library process without diagnostic detail (1717 passed, 1 failed file). All six tests in that file passed in isolation; the subsequent complete concurrency-2 run passed. No production data were used for tests.
- Regression coverage: control/value identity through regrouping, initial host expansion, retained disclosure choices, per-profile ticker labels, unavailable pages, invalid-field expansion, compact pages, newer auction/layout preservation, duplicate saves, failures/retry, edits during saving, reauthentication and round boundaries.

## Actual local browser

Used isolated national-round-preview on 127.0.0.1:4369; synthetic records only.

- Entered `가상 보조 진행자`, collapsed the additional-host group, saved and reloaded. The saved name reappeared and its group expanded.
- Entered 1P layout: the saved additional host rendered in its preview and compact settings; the earlier X=46 placement remained unchanged. The selected 10/21 editing round and actual 10/19 live round remained separate.
- At 320×700, Return collapsed 1P; Tab then Return opened 2P. Visible keyboard outline measured 2px. Outer width/scrollWidth = 320/320 and height/scrollHeight = 700/700; settings document width/scrollWidth = 305/305. The save footer remains visible and the settings have one scroll area.
- Screenshot: `../admin-home-review-20261022/settings-overview-320.png`.

## Remaining work

Actual 200% zoom, screen-reader output, all profile variants and desktop native rendering are not verified by this batch. Desktop source/bytecode inspection found no existing web-tool entry; a separate round-safe entry review remains necessary. Full goal remains active. Production deployment and read-only verification will be recorded after release.
