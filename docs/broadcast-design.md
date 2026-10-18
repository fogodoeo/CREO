# Broadcast caption layout

## National stage, page 2 — 2026-10-18

- Keep the established white/ink identity tile, mint border and teal–violet ribbon tokens.
- The item number occupies the full height of the left white column. The right column contains vendor, traits, then optional notes on separate aligned rows. Hiding notes must remove that row without leaving a blank strip.
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

Run `node tools/verify-national-caption-layout.cjs` for synthetic browser checks at 1920, 1280 and 676 px, automatic/manual width, mixed amount lengths and long names. It never uses production auction records. Focused logic tests cover note visibility, empty/single bidders, ranking updates and other themes.
