# Shared broadcast design baseline

New channels use the common `auction-live.html`, `broadcast-ui.css`, and `broadcast-modern.css` presentation. Keep the neutral, borderless rounded panels, high-contrast large type, transparent camera background, editable placement, and independent result-background opacity as the default.

P1 provides host labels, banners, and centered captions. P2 defaults to inline item identity and separated white traits. A new profile inherits this presentation without copying an event-specific page.

P3 is the extension point: scoreboard, team contribution, dice, roulette, or a future scoring model may provide different content and rules inside the same visual system. Do not reuse the captain multiplier or team membership from another event without configuration. Implement future P3 renderers through the broadcast-profile contract.

Generic presets must not contain event names such as 왕중왕전, vendor names, logo URLs, or event-specific team rosters. These belong to channel configuration. Existing explicit channel titles and settings take precedence and are not rewritten when common defaults change.
