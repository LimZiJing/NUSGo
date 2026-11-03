# #560 stop zoom work evidence

Implementation base: `f21964595968dde261973f7e2cb965ce0ba600b7`.

The deterministic comparison uses all 33 stops from `frontend/public/data/shuttle-network.json`, a fake MapLibre map, and instrumented marker elements through `createShuttleStopMarkers`. The workload sends three non-crossing zoom events below zoom 14 (13.25, 13.75, 13.99), then crosses the threshold in both directions (14, 13.99). Counts cover marker DOM writes and MapLibre label filter, zoom-range, and paint calls.

| Workload | Before DOM writes | After DOM writes | Before MapLibre writes | After MapLibre writes |
| --- | ---: | ---: | ---: | ---: |
| Three non-crossing zoom events | 1,584 | 0 | 21 | 0 |
| Cross threshold up and down | 1,056 | 132 | 14 | 0 |
| Total | 2,640 | 132 | 35 | 0 |

The remaining 132 DOM writes are the hidden class and display changes for each of 33 markers on each threshold crossing. MapLibre label layers keep their own zoom range; presentation state changes still update selected/focused filters and paint. Regression coverage also exercises route selection, the selected-stop pin, a focused popup, journey stops, dark-theme refresh, and zoom-listener cleanup.

The initial module-only evidence did not include browser-rendered pan/zoom. The supplemental controlled local headless traces below add application input-dispatch and rAF observations; neither measurement is compositor, GPU, or visible-frame telemetry.

## Verification

- `npm test`: passed; 22 shared, 1,262 frontend, 136 backend Node, and 105 pathfinding tests (1,525 total).
- `npm run lint`: passed.
- `VITE_API_ORIGIN=https://api.nusgo.invalid npm run build`: passed; Vite reports the existing large application-chunk warning.
- `git diff --check`: passed.
- T3 preview browser smoke was unavailable (`available: false`, no tab); the supplemental local headless browser gesture traces below provide controlled pan/zoom interaction evidence, not visible-frame or GPU evidence.


## Supplemental controlled headless browser traces — 3 November 2026

The base and after production artifacts were built from the same base revision and current uncommitted source with `VITE_API_ORIGIN=https://api.nusgo.invalid`. Each run used a fresh disposable Edge profile, Node 24.15.0, Edge 156.0.4314.58, Windows 11 build 26100, a 1280 × 720 CSS viewport at DPR 1, controlled API fixtures, and the existing empty basemap fixture. The browser rendered all 33 stop markers.

Each of three repetitions sent one eight-move canvas pan and one ten-event wheel zoom sequence. The browser probe measured synchronous DOM input dispatch from window capture through the following microtask, requestAnimationFrame intervals, long tasks, and attribute MutationObserver records on stop-marker buttons.

| Gesture | Base marker attribute records (median) | After records (median) | Input dispatch p95, base / after | rAF interval p95 (median), base / after | Intervals over 25 ms across 3 reps, base / after |
|---|---:|---:|---:|---:|---:|
| Pan | 957 | 1,155 | 0.1 / 0.1 ms | 8.3 / 8.3 ms | 2 / 3 |
| Wheel zoom | 6,669 | 3,898 | 0.1 / 0.1 ms | 33.3 / 12.6 ms | 19 / 4 |

Pan maximum rAF intervals ranged from 8.4–58.4 ms on base and 8.4–66.6 ms after. Zoom maxima ranged from 33.3–50 ms on base and 41.6–83.3 ms after. Each side had one pan sample with a long task (58 ms base, 70 ms after); neither had zoom long tasks. The wheel workload reduced marker attribute records, while pan records varied. All 33 markers were visible at the sampled zoom checkpoints, so this browser scenario did not observe a threshold crossing; threshold correctness remains covered by the focused module tests.

This is browser-rendered application work, but the input dispatch durations are not an isolated MapLibre zoom-handler profile. rAF intervals are scheduling samples, not compositor or GPU dropped-frame measurements. The maximum intervals did not improve consistently, so these data do not establish a general frame-smoothness improvement. The three pan repetitions moved the camera cumulatively in one direction.
