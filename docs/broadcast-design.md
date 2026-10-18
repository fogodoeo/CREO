# Broadcast caption layout

## National stage, page 2 — 2026-10-18

- Keep the established white/ink identity tile, mint border and teal–violet ribbon tokens.
- The item number occupies the full height of the left white column. The right column contains vendor, traits, then optional notes on separate aligned rows. Hiding notes must remove that row without leaving a blank strip.
- Preserve saved positioning and font scaling, including lower captions that grow upward.
- Bidder ribbons share a name column and an amount column across both rows. Amount length must not move the column boundary independently for each bidder.
- Use equal row tracks and tabular numbers. Preserve long names by allowing wrapping; both rows retain equal heights. Do not change amount formatting, bid ordering, acceptance or auction state to achieve alignment.
- Automatic text sizing uses CSS subgrid for the shared amount column in the Chromium broadcast source. Manual-width mode follows the same column alignment.

## Verification

Run `node tools/verify-national-caption-layout.cjs` for synthetic browser checks at 1920, 1280 and 676 px, automatic/manual width, mixed amount lengths and long names. It never uses production auction records. Focused logic tests cover note visibility, empty/single bidders, ranking updates and other themes.
