# Shared broadcast design baseline

New channels use the common `auction-live.html`, `broadcast-ui.css`, and `broadcast-modern.css` presentation. Keep the neutral, borderless rounded panels, high-contrast large type, transparent camera background, editable placement, and independent result-background opacity as the default.

P1 provides host labels, banners, and centered captions. P2 defaults to inline item identity and separated white traits. A new profile inherits this presentation without copying an event-specific page.

P3 is the extension point: scoreboard, team contribution, dice, roulette, or a future scoring model may provide different content and rules inside the same visual system. Do not reuse the captain multiplier or team membership from another event without configuration. Implement future P3 renderers through the broadcast-profile contract.

Platform P3 can explicitly switch between its existing summary and the channel's pinball session with `page3Content`. The control stays in the P3 settings section and requires the existing save action. The draw uses a full-stage iframe whose identity survives ordinary broadcast refreshes; the layout editor shows an inert explanation, never a second running draw. The existing authenticated pinball controller prepares and starts the draw. Switching back preserves the saved summary layout. Chat-based entry collection is not enabled by this switch.

Generic presets must not contain event names such as 왕중왕전, vendor names, logo URLs, or event-specific team rosters. These belong to channel configuration. Existing explicit channel titles and settings take precedence and are not rewritten when common defaults change.

P3 `vendor-order` is an explicit, channel-scoped running-order view. Keep 1부 and 2부 in two columns with numbered rows, restrained separators, and a textual `진행 중` marker alongside the accent. Operators enter one vendor per line; an empty second list uses the first in reverse. Only a current, non-archived active item with a matching vendor and A/B lot number selects a row. Standby or ambiguous codes select none. Lists are not copied into new national rounds. The existing `p3-board` placement remains editable.

P2 reference photos share one fixed container: 부, 모, 동배 rotate at five-second intervals, skipping unavailable images. A role badge and optional name occupy a separate caption row without covering the photograph. Do not widen the photo overlay into the center camera area. Empty roles have no placeholders; parent names use the same saved source as their photos.
