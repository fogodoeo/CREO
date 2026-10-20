# National pinball: participant introduction and broadcast redesign

Risk: **Release** because this is deployed broadcast code. Changes are confined to presentation and operator layout. No session schema, server command, physics, winner selection, record migration or production data mutation was added.

## Scope and coverage

National pinball: operator setup, prepared roster, running broadcast and completed multiwinner result. Existing vanilla TypeScript, canvas and SCSS; national styles now live in `roulette-app/assets/national.scss`. Guidance: repository `AGENTS.md`, `docs/LIVE_RELIABILITY_CHECKLIST.md`, all six `better-interface` domain skills and `emil-design-eng`.

| Domain | Evidence inspected | Result |
| --- | --- | --- |
| Accessibility | Native named roster controls, title labels, keyboard Tab to edition input, visible 2px focus outline, reduced-motion unit path | Clear for inspected paths |
| Layout | 1920×1080 broadcast, 1280×720 operator, 320×800 operator; 13-person and 49-person rosters | Clear |
| Writing | Title → entries → draw options; short “명단 준비” / “추첨 시작” actions; explanation of when title is published | Clear |
| Typography | Three-column 24-person roster, two-column operator preview, five-winner result including phone suffixes | Clear |
| Colors | Actual roster text rgb(243,242,238) on rgb(22,25,30): **15.73:1**; secondary text **8.65:1**; gold focus on panel **9.20:1** | Clear |
| UI polish | Quiet left rail, restrained surfaces, no canvas leaderboard/header, small minimap, opacity-only result entrance | Clear |

## Changes

| Severity | Domain | Location | Before | After | Why |
| --- | --- | --- | --- | --- | --- |
| Medium | Layout | `roulette-app/assets/national.scss:14` | Decorative left ticket competed with chat; header and footer repeated information | At 1920px the left 460px is reserved, with only the event logo near the top; one title above the game, no footer | Keeps chat space available and focuses attention on the draw |
| Medium | Layout | `roulette-app/index.html:110` | Title fields were hidden below draw options | Title fields are visible before participants in both DOM and visual order | Matches the preparation workflow and keyboard order |
| Medium | Typography | `roulette-app/src/participantRoster.js:4` | Viewers first saw overlapping balls | Prepared phase introduces each distinct participant in 24-person pages, six seconds per page, one pass | Makes the full list readable before play |
| Low | UI | `roulette-app/assets/national.scss:118` | Thick blue/yellow frames and repeated decorations | Charcoal surfaces, restrained gold accents, simple result typography; partner logos only on the result | Reduces competing decoration while retaining supplied brands |

## Behavior and invariants

- The title is the administrator's exact `eventTitle`; **명단 준비** publishes it with the selected participants using the existing prepare command. Typing alone does not write a session or reset a draw.
- Roster names omit only the final imported phone suffix. Full identities remain separate, including identical names with different suffixes. Results retain the suffixes.
- Roster timers are local presentation only. They never start, pause, delay or complete the physics simulation.
- Repeated polls do not restart a page tour. Starting, completing, error state, reset, new run and stale timer callbacks are covered by deterministic tests.
- Pages stop at the final page. Previous/next, pause/resume and replay are available. Reduced motion uses manual paging.
- The stinger stays inside the playfield and cannot cover the left chat rail.
- Existing completed sessions restore results directly, without a roster or repeated draw.

## Verification

- `npm --prefix roulette-app run check` — pass.
- `npm --prefix roulette-app run build` — pass. Final copy/color refinement rebuilt successfully.
- `node --test test/pinball-roster.test.js test/pinball-import-display.test.js test/pinball-winners.test.js test/pinball-national-stage.test.js test/marble-roulette.test.js test/pinball-remote-controls.test.js` — **51/51**.
- `npm run check` and `npm test` — **1456/1456**.
- Desktop: `python -m unittest discover -p "test*.py"` — **270/270**. Initial sandbox attempt could not write its temporary fixtures; the permitted normal-temp rerun passed.
- Isolated browser fixture: normal import → administrator title edit → prepare → 13-person introduction → actual last-five draw → five suffix-bearing results → reload restoration.
- Separate 49-person fixture: automatic tour reaches 3/3; manual previous returns 25–48 without restarting on polling. The 24-name page fits the broadcast frame.
- Narrow operator screen: visible title inputs and fixed actions; shorter labels avoid mid-word wrapping at 320px.
- Saved screenshots are in the desktop workspace `scratch/national-session-20261019/pinball-redesign-{ready,roster,running,result,admin,small}.png`.
- Deployment verification uses GET-only `verify-pinball-multi.cjs` and `verify-round-release.cjs`, label `pinball-redesign`, to compare existing records/sessions and deployed static files.

Not verified: native PRISM application capture, actual screen-reader speech and 200% browser zoom. The broadcast was rendered at its 1920×1080 source resolution in a browser; the operator was checked at narrow CSS width. No production draw was started for testing.

## Verdict

**Approve** for the inspected national pinball flow. No outstanding high-severity finding in that scope.
