# NavUS manual smoke checklist

This is the canonical browser smoke checklist for a release or deployment milestone. It is not a requirement to repeat the full checklist for every implementation task.

Run it against a local production build (`npm run build` followed by `npm run preview`) or the deployed development site. Use a supported desktop browser and record the browser, URL, date, and viewport sizes with the result.

## How to scope browser verification

- For pure domain, data, test, or infrastructure changes with no user-visible behavior change, automated checks are sufficient.
- For UI or map changes, run the smallest targeted subset covering the changed behavior when a local browser is available.
- Run the full checklist before a release or when a change materially affects responsive layout, keyboard behavior, map presentation, navigation state, or external map resources.
- If browser testing is unavailable, record the affected areas as unverified and explain the environment blocker. Do not claim browser QA.

## Release record

- Date: 2026-09-21
- Browser and version: Codex In-app Browser, Chromium-based; exact version unavailable from the automation session
- URL or build: `http://127.0.0.1:4173/NavUS/`, production preview from `npm run build` and `vite preview`
- Build commit: `ffe891f` (merged PR8 state)
- Tester: Codex
- Result: passed with limitations

## PR9 targeted verification — 2026-09-21

The Codex In-app Browser session used for this PR9 pass provided a 1280 × 720 viewport. Earlier Edge headless/device-emulation evidence at the release and mobile sizes remains recorded in the Issue #30 document, but it is not a replacement for a full manual release pass. This session did not provide viewport overrides or a real Chrome/Edge window, so the checklist remains unchecked where those conditions matter.

- The basemap, route lines, attribution, venue layer, and shuttle-stop markers rendered. The application reported 719 venues, 33 shuttle stops, and 8 shuttle routes loaded.
- The existing OpenFreeMap glyph and sprite limitations remain relevant; the map still rendered with attribution and usable application controls.
- Venue search for `COM1-0210` returned a result. Keyboard focus moved from the search field through the clear control to the result; Enter opened venue details and focused the venue heading.
- Venue details showed the selected map marker without a duplicate popup. Back returned to search, Escape closed the map context, Close returned focus to Find a venue, and an empty-map click dismissed venue details.
- Shuttle browsing opened with the route select focused. A1, A2, D1, D2, R1, R2, K, and P each displayed route-specific directions and ordered stop lists; Show all routes restored all 8 routes and 33 stops. Escape closed shuttle browsing.
- Shuttle-stop popups displayed stop services and Set as origin, Set as destination, and Close popup controls. Direct origin and destination assignment from two popups worked, and Clear both endpoints removed them.
- Trip endpoint search set origin `COM1-0210` and destination `LT13-OPP` (Ventus). Swap exchanged the endpoints and Clear both endpoints removed both markers and selections.
- Automated and repository checks: `npm test` (31 files, 212 tests), `npm run lint`, `npm run build`, and `git diff --check` passed.
- Not verified in this session: exact 1440 × 900 desktop, 390 × 844 mobile, 768/769px resize behavior, safe-area spacing, mobile map-controls focus flow, and injected resource failures. Real Chrome/Edge and a physical software keyboard were also not available.

## Desktop — 1440 × 900

- [ ] The map, trip endpoint controls, and contextual panel are visible without overlap.
- [ ] Venue search, venue detail, Back, Close, Escape, and map-click behavior work.
- [ ] Selecting a venue flies to it and shows one selected venue marker without a duplicate popup.
- [ ] Shuttle browsing, route selection, route clearing, stop popups, and camera fitting work.
- [ ] Trip endpoints can be set, swapped, and cleared for venues and shuttle stops.
- [ ] Venue and transit loading failures remain independently understandable and usable where supported.
- [ ] Native MapLibre controls and attribution remain visible and usable.

## Mobile — 390 × 844

- [ ] The map, Plan trip card, and contextual bottom sheet fit without overlap and leave usable map space.
- [ ] Plan trip expands and collapses correctly, and the contextual sheet minimizes and restores correctly.
- [ ] Venue search, route browsing, trip endpoints, Back, Close, Escape, and map-click behavior work.
- [ ] Map controls open, keep action focus, dismiss correctly, and restore focus to the initiating control.
- [ ] The bottom sheet respects safe-area spacing and scrolls internally when content is long.

## Responsive boundary — 768 / 769px

- [ ] Resizing across the breakpoint without reloading switches between mobile and desktop layouts correctly.
- [ ] No overlay covers another control, traps focus, or makes the map unavailable.

## Keyboard and accessibility

- [ ] Focus is visible and follows a sensible order through the affected workflow.
- [ ] Back, Escape, Close, and outside-map dismissal return focus to a usable control.
- [ ] Interactive controls have meaningful accessible names and state changes are communicated semantically.

## Map and external resources

- [ ] The basemap, glyphs, route lines, stop labels, markers, and popups render as expected for the changed area.
- [ ] Tile or style failures produce a user-safe status without hiding unrelated application controls.
- [ ] Any external-resource limitation is recorded separately from application behavior.

## Historical issue checklists

The `issue-*-manual-smoke-check.md` files record evidence for earlier issues. They are historical records, not additional standing checklists. New work should link to this file and record only the targeted checks or release result that applies.
