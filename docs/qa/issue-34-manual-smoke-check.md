# Issue #34 manual smoke checklist

This checklist records the manual verification still needed after the MapLibre infrastructure extraction. No browser or desktop session was used for this implementation, so every manual item remains pending.

## Automated evidence

- [x] `npm test` passes.
- [x] `npm run lint` passes.
- [x] `npm run build` passes.
- [x] `git diff --check` passes before each Issue #34 commit.
- [x] Adapter tests use deterministic map fakes for route installation, presentation, camera fitting, popup actions, and idempotent cleanup.

## Manual desktop/map checks — pending

- [ ] Confirm map creation, navigation controls, tile-error status, style readiness, and unmount cleanup.
- [ ] Search for a venue and verify marker styling, camera fitting, panel close, Back, Escape, and empty-map click behavior.
- [ ] Select, clear, and reselect routes; verify route overlap presentation, stop marker/label styling, popup exclusivity, and camera fitting.
- [ ] Set venue and shuttle-stop trip endpoints independently; verify distinct marker styling, popup content, and clearing/swapping behavior.
- [ ] Exercise responsive desktop/mobile overlays and keyboard interactions at supported viewport sizes.

Manual desktop/map verification remains pending; no browser QA result is claimed here.
