# NavUS manual smoke checklist

This is the canonical browser smoke checklist for a release or deployment milestone. It is not a requirement to repeat the full checklist for every implementation task.

Run it against a local production build (`npm run build` followed by `npm run preview`) or the deployed development site. Use a supported desktop browser and record the browser, URL, date, and viewport sizes with the result.

## How to scope browser verification

- For pure domain, data, test, or infrastructure changes with no user-visible behavior change, automated checks are sufficient.
- For UI or map changes, run the smallest targeted subset covering the changed behavior when a local browser is available.
- Run the full checklist before a release or when a change materially affects responsive layout, keyboard behavior, map presentation, navigation state, or external map resources.
- If browser testing is unavailable, record the affected areas as unverified and explain the environment blocker. Do not claim browser QA.

## Release record

- Date:
- Browser and version:
- URL or build:
- Tester:
- Result: pending / passed / passed with limitations / blocked

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
