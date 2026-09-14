# Retro console broadcast theme

Approved from the local pixel theme study on 2026-09-15. Scope: shared auction-live P1/P2/P3 renderer, theme picker and layout inspector. Risk: release (deployment and new persisted frame slots).

## Behavior

- Pixel uses a console bezel and complete stepped panel surfaces. Native CSS replaces the old bitmap border. Fonts remain readable live text; the central camera area stays transparent.
- Added the Retro palette. Selecting Pixel from another style adopts it once; subsequent palette changes remain independent of the visual theme.
- Existing saved placement geometry remains authoritative. Default parent frame is lower-right, 336×220 at 1920×1080; width and height remain independent. Default unsized P1 host cards leave space above the ticker.
- Parent photo controls show transparency, internally retaining the existing opacity storage contract. Photos keep their source ratio and father/mother captions still rotate with the decoded image every five seconds.
- Each page has a fixed game-console frame with independent visibility/transparency, stored in p1-frame/p2-frame/p3-frame. Frame position/size fields are disabled because this is the screen surround. It cannot intercept camera/element pointer input.
- Static frame markup remains mounted when switching between Pixel and Base, avoiding media replacement for theme changes. No new polling, animation loops or image fetches.
- Raised text layers above panel surfaces to prevent missing glyph fragments observed with transformed render layers. No drop-shadow filter is used for pixel panels.

## Verification

- `npm run check`: passed. Additional new/changed standalone JS and auction-live inline scripts parsed successfully.
- `npm test`: 695 passed, 0 failed in the working checkout (includes existing local study tests).
- Desktop `python -m unittest discover -p "test*.py"`: 192 passed.
- Focused frame/parent/palette tests: 8 passed. Tests include duplicate saves, partial saves, API recreation, forbidden unauthenticated writes, channel isolation and unchanged live item data.
- Actual Chromium/IAB, 1920×1080, isolated SQLite fixture: P1 nameplate/ticker, P2 long item name and two bidders, P3 vendor ranking; parent caption and photo alternate together.
- Actual inspector saved parent x=68%, y=55%, width=26%, height=30%, transparency=40%; reopened actual P2 measured 499.188×324px at (1305.59,594), opacity .6. Frame transparency 65% measured opacity .35 while information opacity remained 1.
- Existing draft tests cover refresh, concurrent in-flight editing, reset, failed saves and independent editor models.
- UTF-8 and diff whitespace checks passed. Only explicit release files are staged; rejected local artwork and unrelated tools are excluded.

Production post-deployment verification is recorded in the task. No production bids, sold records or notifications are used for tests. Actual PRISM/OBS host capture remains outside this check.
