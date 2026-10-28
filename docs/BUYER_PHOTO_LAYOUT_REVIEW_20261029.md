# Buyer photo layout review — 2026-10-29

Scope: buyer shipping registration item rows, item collection thumbnails and shared photo dialog. Plain HTML/CSS/JavaScript; existing checkout tokens and native dialog. Repository AGENTS.md, LIVE_RELIABILITY_CHECKLIST.md and CHECKOUT_DESIGN.md apply. Payment, shipping and auction persistence are unchanged.

## Findings resolved

| Severity | Domain | Location | Before | After | Why |
| --- | --- | --- | --- | --- | --- |
| HIGH | Layout | `public/checkout-navigation.css:17` | Initial photo/inquiry actions inherited a 34px grid column; `flex-basis` had no effect on their grid placement. | Actions span all columns; buttons retain their natural label width. | At 320px, Korean labels stacked vertically and inquiry controls grew to 102px tall. Measured action row is now 288px wide and 44px tall. |
| MEDIUM | Layout | `public/checkout-navigation.css:21` | Every photo occupied 58dvh even for landscape content. | Intrinsic image dimensions bounded by available width and max height. | A 1200×675 photo at 320px now occupies 296×166.5px instead of a 489.5px high image box. No horizontal overflow. |
| MEDIUM | UI | `public/checkout-item-view.js:48` | Tall original photos were only available in a constrained viewer. | Current original photo opens through a labeled link. | Allows inspecting image detail without cropping or changing original files. |

## Coverage

| Domain | Evidence inspected | Result |
| --- | --- | --- |
| Accessibility | Button/link names, visible focus, 44px controls, keyboard arrows, Escape/focus restoration, image error/retry, 320px layout | Clear within inspected flow |
| Layout | 320px/390px iframe viewports and desktop; portrait, landscape, square images, long Korean names | Fixed findings above; no horizontal overflow |
| Writing | Photo/inquiry labels, original link and new-window accessible name, retry control | Clear |
| Typography | Korean source text, inherited font, title/parent wrapping | Clear; source text was not corrupt |
| Colors | Rendered dialog text on white: caption 5.57:1, original link 5.17:1, close/title color 15.18:1 | Meets text contrast; existing tokens retained |
| UI | Thumbnail containment, image dimensions, dialog boundaries, error state; no new motion | Clear |

## Verification

- Reproduction: run `tools/buyer-journey-preview.cjs` with `BUYER_PREVIEW_PHOTOS=1` and open `/__audit?width=320`. Expand ‘낙찰 내역’, open ‘사진 보기’. This uses isolated SQLite, synthetic contacts and fixture SVGs; the missing parent image deliberately returns 404.
- Browser measurements: landscape ratio 1.7777778 (exact), portrait 0.562482 vs original 0.5625 (subpixel rounding), square 1.0. No horizontal overflow in the dialog. At 320px the landscape dialog fits 612px height without internal scrolling. Longer portrait content remains vertically scrollable.
- Image switching, failure/retry and Escape returning focus to ‘사진 보기’ verified with actual browser interaction. Original URL follows selected child/parent image and uses full size, never the thumbnail.
- `node --test test/checkout-item-view.test.js test/checkout-item-data.test.js test/buyer-checkout-flow.test.js`: 32 passed.
- `npm run check`: passed. `npm test -- --test-concurrency=1`: 1,921 passed.
- CDCUP `python -m unittest discover -p 'test*.py'`: 137 run, 136 passed; one pre-existing niimprint dependency error in printer fallback test, unrelated to web UI.
- Native mobile hardware/browser zoom and every shared viewer host's full workflow are not verified. IAB viewport override did not change measured viewport dimensions; narrow-width evidence comes from actual same-origin iframe widths, not that override.
- Production check before release: all operation rounds were preparing or finished. Production confirmation is recorded in ignored release evidence after deployment; no real payments, shipping edits or messages are used for verification.

Verdict: Approve for the inspected buyer flow. No unresolved HIGH findings in this scope.
