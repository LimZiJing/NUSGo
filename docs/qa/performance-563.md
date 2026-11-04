# Issue #563 map icon performance evidence

This note combines measurements recorded 3 November 2026 with the exact-head browser check below. Each section records its own source and limits.

## Production asset sizes

The optimized Vite `local-rehearsal` build was measured before and after with the same flags, `VITE_API_ORIGIN=http://127.0.0.1:3001`, and Node's default `zlib` gzip and Brotli settings. These are production-mode local rehearsal assets, not release artifacts.

| Asset | Before raw | Before gzip | Before Brotli | After raw | After gzip | After Brotli | Raw change | Gzip change |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| App JavaScript | 2,038,927 | 582,878 | 457,165 | 2,041,282 | 583,531 | 457,775 | +2,355 | +653 |
| Map worker JavaScript | 486,833 | 135,723 | 111,292 | 486,833 | 135,723 | 111,292 | 0 | 0 |
| App CSS | 220,368 | 32,910 | 26,366 | 220,368 | 32,910 | 26,366 | 0 | 0 |

The normal `npm run build` also passed before and after. Vite reported the app JavaScript at 2,038.97 kB / 588.25 kB gzip before and 2,041.32 kB / 588.74 kB gzip after. Its existing chunk-size advisory remains.

The Personal Waypoint and stop-popup paths no longer call `renderToStaticMarkup`; they create the existing Lucide SVG shapes with DOM APIs. `react-dom/server` remains in the production map graph because `live-bus-markers.ts` still imports it. The app bundle therefore did not shrink; the measured production-mode local rehearsal bundle grew by 653 gzip bytes. The full server-rendering import cost was not removed or claimed as a saving.

## Cold map startup

The existing [#558 diagnostic harness](https://github.com/LimZiJing/NUSGo/issues/558#issuecomment-6571043604) ran on a fresh headless Edge profile at 1440 × 900 with controlled API fixtures. It measures the first poll that sees map stop markers, not full basemap readiness or a physical device.

| Sample | Marker-ready observation |
|---|---:|
| Base | 869.8 ms |
| After | 827.3 ms |

There was one cold-start sample per revision. The 42.5 ms difference is not enough to establish a startup improvement. The basemap, GPU/compositor frames, live providers, and mobile hardware were not measured.

## Deterministic waypoint update work

The module test creates one waypoint, then submits ten equal waypoint values with the same ID. Mutation observers count DOM attribute and icon-subtree writes; a fake MapLibre marker counts coordinate writes.

| Work during ten unchanged refreshes | Base | After |
|---|---:|---:|
| Coordinate writes, including initial placement | 11 | 1 |
| Accessible-label writes | 10 | 0 |
| Marker-color attribute writes | 10 | 0 |
| Marker-icon attribute writes | 10 | 0 |
| Icon-subtree replacements | 10 | 0 |

The final tests also cover changed name, category, icon, color, and coordinates; an unknown icon value; safe label text; marker identity through reorder; the latest selection callback; hiding, removal, focus, and disposal. The DOM SVG definitions are compared with the existing Lucide React icon output.

## Browser evidence and limits

The T3 preview loaded the local rehearsal app and rendered the map and stop markers. External API requests failed CORS checks because no local API was running; the app showed its unavailable-live-times state. Automatic review rejected the `Add waypoint` action because it could persist profile data, and rejected clicking a bus-stop marker because it could select a stop. No Personal Waypoint was created or edited through the app in that preview; the supplemental section below records a separately seeded disposable fixture. No frame/GPU improvement is claimed.

Automatic review also rejected changing `live-bus-markers.ts` to remove its remaining server-rendering import, describing the bus popup and vehicle markup as outside the waypoint-marker scope. A cached-markup alternative was rejected because it would reintroduce `innerHTML` in this map path. Both paths remain untouched; resolving the remaining import requires a separately approved scope.

`CONTEXT.md` reviewed; no domain vocabulary changed.

## Verification

- `npm test`: passed. Shared 22 tests, frontend 1,270 tests, backend 136 Node tests and 105 pathfinding tests.
- `npm run lint`: passed, including the CSS selector check.
- `npm run build`: passed. Vite emitted its existing advisory that the main JavaScript chunk exceeds 500 kB.
- `git diff --check`: passed.


## Supplemental same-base startup and disposable waypoint browser evidence — 3 November 2026

The base artifact came from a temporary source snapshot at `f21964595968dde261973f7e2cb965ce0ba600b7`; the after artifact came from the current uncommitted source. Both used `npm run build` with `VITE_API_ORIGIN=https://api.nusgo.invalid`, Node 24.15.0, and Edge 156.0.4314.58 on Windows 11 build 26100. Each cold-start sample used a new disposable profile, a 1440 × 900 CSS viewport at DPR 1, disabled browser cache/service-worker use, the same controlled API fixture, and the empty basemap. Marker-ready time is from Navigation Timing start to the first MutationObserver callback that saw stop markers.

| Revision | Four marker-ready samples | Median | Range |
|---|---|---:|---:|
| Base | 1,539.5; 1,507.2; 1,808.1; 1,415.3 ms | 1,523.4 ms | 1,415.3–1,808.1 ms |
| After | 1,907.4; 3,223.8; 3,145.8; 1,558.8 ms | 2,526.6 ms | 1,558.8–3,223.8 ms |

The later interleaved base/after pair was 1,415.3 / 1,558.8 ms. The after samples had much wider spread and no demonstrated startup benefit; this small headless sample cannot attribute the slower median to the code. Map-ready observations were also noisy. This result supplements the earlier one-sample figures and should not be used as a physical-device or release startup claim.

The same-base normal production JS assets measured 2,038,971 raw / 582,878 gzip / 457,395 Brotli bytes at base and 2,041,326 / 583,534 / 457,552 bytes after: +2,355 raw, +656 gzip, and +157 Brotli bytes.

For a map interaction check, a single synthetic waypoint was seeded into a fresh temporary profile before app startup. Its marker rendered with the expected accessible label, one SVG, and four SVG paths. A DOM-dispatched button click opened the “Waypoint details” panel and left the fixture record unchanged. Pointer hit-testing at the marker center hit the Map canvas rather than the button, so a trusted pointer click was not verified. The temporary profile was deleted after the run; no user profile, saved waypoint, or bus-stop selection was used.

The earlier automatic-review denials concerning persistent-profile waypoint creation and bus-stop selection remain respected. No new automatic-review denial occurred. The page used only local fixtures and did not call live providers. The temporary CDP runner was not added to the repository; the fixture page was prepared with the existing frontend/scripts/performance/prepare-page.mjs and fixtures.mjs sources.

## Review follow-up: trusted marker pointer click — 4 November 2026

The published PR head e66af2c453ff4693c15577b8b7f48be9347cddcc was served from its 589 worktree at http://127.0.0.1:15989/ and opened in headless Microsoft Edge at a 1280 × 800 viewport. A single valid Personal Waypoint fixture was stored under navus:personal-waypoints:v1 in a fresh temporary Edge user-data directory. The directory was removed after the run; no default browser profile or saved user waypoint was read or changed.

After opening My waypoints, the marker's 40 × 40 button was visible at approximately (614, 514). A CDP mouse move, press, and release at the marker center produced a trusted click (event.isTrusted === true) whose target was the marker's SVG child. The app opened Waypoint details for “Disposable review waypoint” and showed its “Review fixture” category and note. This verifies pointer selection at the published head; it is not a frame-time or performance measurement.

The test used an isolated fixture and local Vite server. It did not submit a Journey or change persistent browser data. The exact head was e66af2c453ff4693c15577b8b7f48be9347cddcc; the later inherited-icon fallback does not alter this selection path.
