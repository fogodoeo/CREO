# Promo manuscript formatting

- The October 26/28 Gyeongsang manuscript uses its approved episode poster as the first image and catalog thumbnail. Render it once, at the existing 500px responsive width with its original aspect ratio. Other manuscripts keep their existing shared hero. Preview and formatted clipboard output use the same block order.

- The management interface currently uses its existing light theme.
- Manuscript text is intended to be pasted into external editors. Its HTML must not set foreground colors, background colors, text fill colors, or a color scheme. The destination decides its light/dark text and link colors.
- Keep size, weight, centered alignment, line spacing, images and links. Use size and weight for emphasis.
- Stored legacy `color: ink/green` metadata remains compatible with old records but is not emitted in manuscript HTML.
- Both ClipboardItem and the legacy copy-event path must provide the same color-neutral markup. Do not copy computed styles from the preview selection.
- Standalone export documents may declare `color-scheme: light dark` on their outer document so browser system colors adapt. The article content itself stays color-neutral.
- Verify actual copy/paste into both light and dark backgrounds; existing posts must be re-pasted or have their formatting cleared in the destination editor.
