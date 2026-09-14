# Broadcast presentation and theme contract

The default look is `base`. Choose **방송 관리 → 테마 → 기본 / 픽셀**; color is a separate choice. The selected visual concept is stored as channel.broadcastTheme. Existing channels without it use base. Auction profiles, rankings, team rules, visibility, fontScale and saved positions are independent.

## Broadcast information
- P1: one-line host name and role, ticker and existing banners. A single host without a saved box fits its text; custom geometry remains authoritative.
- P2: item facts and current bidders. Optional portrait parent frame at lower right, 17% width with 3:4 aspect ratio. Photos use object-fit: contain.
- Parents alternate every 5 seconds only after the next image decodes. Caption is part of the same figure: `부 펩시콜라`, `모 코카콜라`. No photos means no broadcast block. The editor retains a selectable placeholder.
- Standard P3: vendor totals and buyer totals, independently selectable. Both enabled means alternating boards. Show at most five rows, rotating remaining ranks. No channel/date header or English decoration. Existing tournament/contribution/dice rules are not replaced.
- Example data is only available in the layout editor. It does not create auction or notification records.

## Theme extension
1. Register an ID, display name and frame asset in public/broadcast-themes.js.
2. Add only scoped decoration rules in public/broadcast-themes.css.
3. Keep the shared readable font, geometry, text/data rendering and media player behavior.
4. Verify P1/P2/P3, long names, empty parents, custom boxes, palette changes and restoration to base.

The pixel frame is applied with nine-slice borders. Its central rails are masked away so they cannot cross large text. Only the rim and corners carry artwork. Text remains real HTML. The bitmap is one cacheable asset, 236,492 bytes; it is not regenerated per auction or viewer.

## Pixel asset provenance
Built-in imagegen tool, generate mode (no API key).
Final asset: [pixel-frame-v1.png](../public/assets/broadcast-themes/pixel-frame-v1.png).
Original generated file: C:/Users/laptop/.codex/generated_images/01a07ab4-9a2a-7691-b582-99330ca3181c/exec-3e0ee74a-dd90-4716-abf6-19032579d6b9.png.
1254 × 1254 RGBA; center alpha 0, 90.5% fully transparent. Copied unchanged. The generated corner region needed a 160px slice rather than the requested 64px; CSS handles that without editing the asset.

Exact generation prompt:

```text
Use case: stylized-concept.
Asset type: reusable nine-slice raster border for a Korean live auction broadcast overlay.
Create ONE square premium pixel-art UI frame, front view, aligned exactly to the square canvas edges. It will be sliced into four small corners and straight repeating edge strips, then stretched around wide nameplates and tall ranking panels. The interior must be genuinely transparent alpha, with at least 86% of the image empty transparent. No mockup, no background, no text, no numbers, no icons, no logos, no characters. No floating ornaments outside the frame.
Style: precise restrained 16-bit pixel craft, a clean contemporary arcade interface, not fantasy, not cyberpunk. Bold stepped square corners, two crisp layered pixel outlines in cool ivory and desaturated slate, tiny muted cyan and warm apricot corner accents only. Balanced finished border on ALL FOUR sides. Most visual detail belongs within a corner zone of 64px on a 1024px square canvas; keep the middle of each edge straight and consistent for nine-slice scaling. Very small deliberate square bevels and subtle inner dark pixels make a professionally finished physical game UI frame. No blur, no glow, no grain, no gradients, no perspective, no rounded curves.
Constraints: transparent center and transparent notches, crisp hard-edged raster pixels, sparse decoration, generous clear space for large real HTML lettering placed above later. Do not generate lettering or sample content.
```

## Verification — 2026-09-15
Risk: Release (desktop/server integration, public payload, persisted settings and deployment).

- Server: `npm run check`; `npm test` — 684 passed, including 14 unrelated untracked Dodosi tests. The tracked release contains 670 tests.
- Desktop: `python -m unittest discover -p "test*.py"` — 192 passed.
- Focused regressions: finished-item sold notice, stable buyer identities with privacy/channel isolation, five-row pagination, timer rotation, parent image decode/failure/disposal, latest parent data, private waiting-photo exclusion, options/placement persistence and restart, theme/palette independence.
- Existing full-suite tests exposed two outdated renderer/profile test harnesses and a preexisting spool test's nondeterministic array-index assumption. Harnesses were corrected; spool production code was not changed.
- Local browser: P2 father/mother caption alternation, fixed portrait geometry, layout position/opacity save, P3 vendor/buyer rotation, example control, standard-only settings, P1, pixel/base selection, independent color and reload.
- Same P2 item box before/after pixel → base: font family unchanged, 80px name, rectangle x1113.5625 y54 w729.640625 h97.1875 in the 1920px editor document.
- Pixel first pass had rails intersecting lettering; the final style masks those rails. Standard ranking header shadow was removed. No real BAND chat, customer message, sold record or parent upload was sent during these tests.
- Read-only production health and static-file verification is recorded separately in the local release report after deployment.

Real PRISM compositing and actual BAND delivery remain external checks; local rendering and deterministic tests do not prove those integrations end to end.
