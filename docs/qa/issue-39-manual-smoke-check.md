# Issue #39 manual smoke checklist

This checklist is intentionally honest about the boundary between automated evidence and manual desktop/map verification. No browser or desktop session was used for this implementation, so every manual item remains pending.

## Automated evidence

- [x] `npm test` passes, including loader failure isolation, immutable index behavior, malformed geometry/manifest cases, and the checked-in transit integrity gate.
- [x] `npm run lint` passes.
- [x] `npm run build` passes.
- [x] `git diff --check` passes before each Issue #39 commit.
- [x] CI/test validation covers `public/data/transit-verification.json`; the manifest is not fetched at runtime.

## Manual desktop/map checks — pending

- [ ] Load the local desktop app and confirm venue and transit resources can fail independently without hiding the other resource's controls.
- [ ] Search for a venue, open details, return to search, and confirm the selected marker behavior remains unchanged.
- [ ] Open shuttle browsing, select each route, and confirm route lines, ordered stop labels, endpoint markers, and camera fitting remain correct.
- [ ] Clear the route selection and confirm all routes/stops remain visible.
- [ ] Select shuttle stops as trip endpoints and confirm labels and marker coordinates.
- [ ] Exercise Back, Escape, empty-map click, and panel close behavior.
- [ ] Check the desktop layout at the supported viewport sizes.

Manual desktop/map verification remains the only unresolved QA blocker. No browser QA result is claimed here.
