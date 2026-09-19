# Issue #35 manual smoke checklist

This checklist records the manual verification still needed after moving navigation workflow state into the framework-free session controller. No browser or desktop session was used for this implementation, so every manual item remains pending.

## Automated evidence

- [x] `npm test` passes (162 tests), including public controller defaults, subscriptions, mixed success/failure completion orderings, deterministic failure aggregation, map-readiness failure ordering, completion-time map/subscriber error propagation, startup-failure reporting with isolated listener errors, canonical trip endpoints, serialized route/trip reentry, contextual-panel history and venue marker rules, abort-before-deferred-loader execution, late completion, idempotent lifecycle behavior, immutable snapshot branches, loader-error isolation, and mount callback forwarding/cleanup.
Interactive query/reset/swap/clear behavior for the stateful `TripEndpointControls` wrapper is not covered by this automated evidence; verification is deferred to the manual desktop/map QA below and the Issue #30 DOM tests.
- [x] `npm run lint` passes.
- [x] `npm run build` passes.
- [x] `git diff --check` passes before each Issue #35 commit.
- [x] Existing Issue #34 MapSession adapter tests remain passing, including route reconciliation, camera fitting, marker/history behavior, endpoint marker replacement, and idempotent disposal.

## Manual desktop/map checks — pending

- [ ] Start the local desktop app and confirm MapSession/controller installation occurs once per mount, map style readiness gates transit installation, map tile errors remain visible, and unmount cleanup is safe.
- [ ] Allow venue and transit resources to complete in either order, including independent and combined failures, and confirm the visible status preserves each result.
- [ ] Search for a venue, open details, select its marker, then exercise Back, Escape, Close, and empty-map click; confirm contextual history and marker clearing remain unchanged.
- [ ] Browse shuttle routes, select and clear routes, and confirm route colors, overlapping corridors, ordered stops, stop labels, and camera fitting remain unchanged.
- [ ] Manually verify the stateful `TripEndpointControls` wrapper's interactive query/reset/swap/clear behavior for venue and shuttle-stop endpoints; confirm each search query clears only after selection, and confirm endpoint swapping, per-endpoint clearing, clear-both, endpoint markers, and popups remain correct.
- [ ] Exercise keyboard operation and responsive desktop/mobile overlays at the supported viewport sizes.

Manual desktop/map verification remains pending; no browser QA result is claimed here.
