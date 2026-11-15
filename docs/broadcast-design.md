# Broadcast caption layout

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
