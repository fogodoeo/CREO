# 씨랩 복싱 아레나 — 2026-11-26

`clab-boxing` is a visual variant of `national-stage`, scoped by `data-broadcast-variant`. Theme resolution retains the variant while rendering and text-layout helpers reuse the existing national layout. Other channel themes are unchanged.

The PRISM camera/background layer remains transparent. The separate generated C-LAB backdrop is stored in `C:/Users/5600x/Desktop/씨랩/11월26일용/송출/씨랩_복싱아레나_크로마키배경.png`.

## Material and hierarchy

Gmarket Sans; silver brushed metal identity plates with dark engraved-looking text, gunmetal trait/price plates, red/blue anodized presenter roles. Procedural 4px grain repeats at constant size. Bevel thickness does not scale horizontally. P1 plates fit their contents up to the saved slot width; P2 retains national auto-width and separate wrapping notes. P3 uses the same scoreboard materials. No backdrop raster is embedded in the live UI.

## Validation

`node tools/verify-boxing.cjs` uses isolated synthetic data and never writes auction records. `BOXING_CHROME` selects an older local Chromium for compatibility checks. The fixture borrows presentation placement from yesterday's show, not auction or payment state. Host identities shown in screenshots are examples and must not be copied to another channel without confirmation.

Focused theme/layout tests: 11 passed. Full server suite: 2,149 passed / 1 regional vendor preparation failure. Desktop Python 3.13 suite: 136 passed / 1 missing niimprint printer dependency error. These unrelated failures remain documented rather than being changed within a visual-theme task. PRISM itself still requires an actual source refresh/check.
