# Broadcast caption layout

## Deep navy embroidery — implemented 2026-11-17, latest

- Typography update: all P1/P2/P3 live text in `departure-blue` uses self-hosted Gmarket Sans Medium/Bold WOFF2, replacing both serif prices/titles and Pretendard captions. Explicit font weights retain hierarchy; synthetic bold is disabled. Other channel themes keep their established fonts. User authorized deployment of this theme and shared C-LAB caption updates.
- Release verification: `npm run check` passed; full Node suite passed 2,053/2,053 with concurrency 4 (an initial parallel run had one transient server-smoke fetch failure; focused rerun also passed). Desktop suite ran 137 tests: 136 passed, one unrelated printer test failed because installed niimprint lacks BleTransport. No desktop code or API contract changed. Chrome P1/P2/P3 and loaded Gmarket Medium/Bold were inspected; live field and intaglio pixel verification passed.
- User approved moving the embroidered/debossed concept into actual broadcast UI. Current preset name: `과천 · 딥네이비 옥션`; compatibility ID remains `departure-blue`. This supersedes both gallery-ivory and airport-blue appearance below.
- `broadcast-embroidery.css` follows the shared caption styles. Generated `assets/gallery-auction/embroidered-frame.png` is used as a nine-slice border (88px slices, 22px display edges) so ornament corners retain their shape when panels resize. A separate small `navy-weave.webp` tile provides the face texture. All displayed auction fields remain live DOM text.
- `engraved-text.svg#intaglio` adds an inner upper shadow and inner lower highlight to glyphs, creating a shallow recessed appearance. Text uses brighter silver than the dark concept image for broadcast readability. There are no continuously animated textures or model/API calls during broadcasting.
- Background is a separate 1920×1080 navy wall with embroidered CREYON emblem/wordmark; no floor or furniture. The production stage stays transparent. This image is composited behind the camera in PRISM and is not hardcoded into the channel renderer.
- Verified actual Chrome P1/P2/P3, 676px downsample, 288 note-layout cases, and `tools/verify-embroidered-live.cjs` for changed native text/traits/bids, disappearance of old notes, loaded frame, transparent stage and actual pixel difference with the intaglio filter toggled. Synthetic records only; no production edits or deployment in this task. Live-stream compression and the user's actual camera framing remain untested.

## Gallery auction revision — 2026-11-17, latest

- User rejected the airport/blue direction for the broadcast. The current preset is **과천 · 갤러리 옥션**. Internal ID `departure-blue` stays stable, but it now renders a fine-art auction design: ivory `#e7e0d3`, charcoal `#28241f`, bronze `#765b3b`, 2px corners, serif event heading and prices, quieter sans-serif supporting information. This supersedes the blue-hour styling below.
- Separate generated chroma background: warm stone gallery wall, walnut sides, artwork/sculpture confined to the edges and an open presenter area. Production browser remains transparent. The local preview serves the current gallery image using the existing asset route.
- The C-LAB metal style and Nov16 shared information hierarchy remain intact. No auction state or production channel was modified. Updated P1/P2/P3 were visually inspected; 288 caption cases passed after restyling.

## Goodbye blue hour + shared C-LAB captions — 2026-11-17

- `departure-blue` (굿바이 · 블루 아워) is a visual preset, independent of auction profiles. P1 host labels, P2 information/bids and P3 rankings share navy `#102d4d`, ivory `#f5eee2`, muted blue `#c5d8e8`, a fine blue-gray edge and an 8px radius. The event heading uses a restrained serif. Titles and event dates come from channel configuration, never hardcoded into the theme.
- Keep the live canvas transparent. The airport image is a separate PRISM background underneath the chroma-keyed camera and browser overlay. No background image or additional video load is embedded in the production renderer.
- `clab-gallery` and `departure-blue` reuse the Nov16 national P2 hierarchy: lot/vendor, traits, then a separately fitted note. C-LAB retains its gunmetal surfaces. Notes wrap at their configured size; short notes only paint their own text width and empty/hidden notes leave no box. Existing note deduplication and pricing text remain authoritative.
- Automatic caption width is limited to 46%; manual width and font scaling remain editable. Keep existing right edge (`x + width`) when migrating a saved C-LAB layout; persist that edge on the first resize. National defaults and bidder behavior are unchanged.
- Verification: `tools/verify-separated-captions.cjs` covers 288 synthetic render cases across national/C-LAB/departure, 1920/1280/676 widths, automatic/manual sizing, normal/reduced motion and short/long/unbroken/empty notes. `tools/capture-departure.cjs` renders full P1/P2/P3 and C-LAB P2 with synthetic data only. Neither tool changes production auction records.
- Local visual preview: `node tools/preview-departure.cjs`, then `/auction-live.html?channel=preview-departure&page=1` on port 4417 (pages 2/3 available; `preview-clab` for C-LAB). The preview alone adds the airport image for compositing review.

## National stage, page 1 — 2026-11-09

- Show one compact progress object at the top right (4% inset, 28% width), above the presenter area. Reuse paper/ink, mint edging and the existing ribbon for the progress fill.
- The main number is the current lot's ordinal / total; the bar and footer use completed / total. A final lot still in progress must not show a full bar. Preserve the server's definition of completed (including passed/cancelled), never treat the ordinal as a sold count.
- Show preparation/empty and fully completed states explicitly. Refresh through the existing channel-scoped broadcast/pulse feed, without new timers, requests, animated loops or auction writes.
- `p1-progress` is a regular layout-editor object: position, width, text size, visibility and opacity can be saved independently. Height follows content. Other broadcast themes and P2 remain unchanged.
- Verify with `node tools/verify-national-progress-layout.cjs` (empty, preparation, mid-auction, final live lot, completion, font sizes, 1920/1280/676 px and editor hiding) and `node --test test/broadcast-p1-progress.test.js` (counts, theme scope, layout persistence and public-feed refresh).

## National stage, page 2 — 2026-11-16

- Keep the established white/ink identity tile, mint border and teal–violet ribbon tokens.
- Use a fitted white identity header (lot number then vendor), a separate fitted traits ribbon, and optional right-aligned notes below. The outer card and detail containers are transparent: short notes never paint the width of the header or traits. Wrapped note lines each paint only their inline fragment with `box-decoration-break: clone`, leaving the camera visible to their left.
- Automatic width is capped at 46% of the canvas, anchored to the saved right edge, including when notes exist. Manual width remains adjustable. Preserve the established note/trait font scale; notes wrap without panning, shrinking, clipping or ellipses. Only overlong vendor names use the existing fit fallback. Hidden/empty notes leave no extra surface. Pricing terms and stored text are unchanged.
- Preserve saved positioning and font scaling, including lower captions that grow upward.
- Bidder ribbons share a name column and an amount column across both rows. Amount length must not move the column boundary independently for each bidder.
- Use equal row tracks and tabular numbers. Preserve long names by allowing wrapping; both rows retain equal heights. Do not change amount formatting, bid ordering, acceptance or auction state to achieve alignment.
- Automatic text sizing uses CSS subgrid for the shared amount column in the Chromium broadcast source. Manual-width mode follows the same column alignment.

## Verification

## Countdown status — 2026-10-18

- P2 shows only `낙찰 카운트 중` with a steady warm amber light above the bidder ribbons, aligned to their right edge. The ink surface and paper text follow the existing national palette. No flashing, countdown digits or closing deadline.
- The badge is separate from the bidder grid, so row heights and price alignment stay unchanged. It follows the saved bidder position and stays within the canvas at small sizes.
- The desktop countdown publishes an authenticated, channel/item-bound display lease every five seconds while running. Cancel, lock, sold and changing items hide it. A lost desktop connection expires within 15 seconds; browser-side expiry also works during a web connection outage. No auction result or bid acceptance logic is changed.
- The server update must be deployed before updating the laptop's `band_monitor_app.py`, `platform_manager.py` and new `countdown_display.py` from CDCUP. An old desktop sends no display signal.

Run `node tools/verify-national-note-surfaces.cjs` for 96 synthetic browser cases at 1920, 1280 and 676 px: automatic/manual width, normal/reduced motion, 100%/190% font scale, one-character/long/unbroken/empty notes. Check transparency, short-note width, right alignment, wrapping, full text and stable font size. It never uses production auction records. The older caption-layout tool also covers bidder alignment. Focused logic tests cover note visibility, empty/single bidders, ranking updates and other themes.
