# Issue #35 manual smoke checklist

This checklist records the manual verification still needed after moving navigation workflow state into the framework-free session controller. No browser or desktop session was used for this implementation, so every manual item remains pending.

## Automated evidence

- [x] `npm test` passes (173 tests), including public controller defaults, subscriptions, mixed success/failure completion orderings, deterministic failure aggregation, map-readiness failure ordering, completion-time map/subscriber error propagation, startup-failure reporting with isolated listener errors, canonical trip endpoints, serialized route/trip reentry, Explore history and venue marker rules, asynchronous Bus routes focus fallback and restoration, native keyboard endpoint selection, endpoint swap/clear state, abort-before-deferred-loader execution, late completion, idempotent lifecycle behavior, immutable snapshot branches, loader-error isolation, and mount callback forwarding/cleanup.
- [x] `npm run lint` passes.
- [x] `npm run build` passes.
- [x] `git diff --check` passes before each Issue #35 commit.
- [x] Existing Issue #34 MapSession adapter tests remain passing, including route reconciliation, camera fitting, marker/history behavior, endpoint marker replacement, and idempotent disposal.

## Manual desktop/map checks — pending

- [ ] Start the local desktop app and confirm MapSession/controller installation occurs once per mount, map style readiness gates transit installation, map tile errors remain visible, and unmount cleanup is safe.
- [ ] Allow venue and transit resources to complete in either order, including independent and combined failures, and confirm the visible status preserves each result.
- [ ] Search for a venue, open details, select its marker, then exercise Back, Escape, Close, and empty-map click; confirm Explore history and marker clearing remain unchanged.
- [ ] Browse bus routes, select and clear routes, and confirm route colors, overlapping corridors, ordered stops, stop labels, and camera fitting remain unchanged.
- [ ] Manually verify the stateful `TripEndpointControls` wrapper's interactive query/reset/swap/clear behavior for venue and bus-stop endpoints; confirm each search query clears only after selection, and confirm endpoint swapping, per-endpoint clearing, clear-both, endpoint markers, and popups remain correct.
- [ ] Exercise keyboard operation and responsive desktop/mobile overlays at the supported viewport sizes, including Bus routes loading fallback and later route availability.

The original Issue #35 manual desktop/map verification was pending; PR9 follow-up evidence is recorded below.

## PR9 follow-up — 2026-09-21

The [canonical PR9 record](manual-smoke-check.md) contains the detailed production-preview navigation-session evidence, including keyboard venue activation, Explore dismissal, all route selections, popup endpoint actions, endpoint swapping, and clearing. Mobile, breakpoint, real Chrome/Edge, and resource-failure checks remain open.
