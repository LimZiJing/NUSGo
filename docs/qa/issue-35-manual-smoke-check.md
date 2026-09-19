# Issue #35 manual smoke checklist

This checklist records the manual verification still needed after moving navigation workflow state into the framework-free session controller. No browser or desktop session was used for this implementation, so every manual item remains pending.

## Automated evidence

- [x] `npm test` passes (144 tests), including public controller defaults, subscriptions, loading completion order, failure aggregation, map readiness/errors, route commands, contextual-panel history, trip commands, abort, late completion, idempotent lifecycle behavior, reentrant map synchronization, immutable snapshot branches, and focused startup coordination lifecycle coverage.
- [x] `npm run lint` passes.
- [x] `npm run build` passes.
- [x] `git diff --check` passes before each Issue #35 commit.
- [x] Existing Issue #34 MapSession adapter tests remain passing, including route reconciliation, camera fitting, marker/history behavior, endpoint marker replacement, and idempotent disposal.

## Manual desktop/map checks — pending

- [ ] Start the local desktop app and confirm MapSession/controller installation occurs once per mount, map style readiness gates transit installation, map tile errors remain visible, and unmount cleanup is safe.
- [ ] Allow venue and transit resources to complete in either order, including independent and combined failures, and confirm the visible status preserves each result.
- [ ] Search for a venue, open details, select its marker, then exercise Back, Escape, Close, and empty-map click; confirm contextual history and marker clearing remain unchanged.
- [ ] Browse shuttle routes, select and clear routes, and confirm route colors, overlapping corridors, ordered stops, stop labels, and camera fitting remain unchanged.
- [ ] Set venue and shuttle-stop origins/destinations, verify each search query clears only after selection, and confirm swapping, clearing, endpoint markers, and popups remain correct.
- [ ] Exercise keyboard operation and responsive desktop/mobile overlays at the supported viewport sizes.

Manual desktop/map verification remains pending; no browser QA result is claimed here.
