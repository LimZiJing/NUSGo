# Animation and interaction performance baseline

Tracking issue: [#558](https://github.com/LimZiJing/NUSGo/issues/558). Application revision: `29d9a884197a90125aab8afaea702076294ce8db`, fetched `origin/main` on 2 November 2026. Only diagnostic scripts and documentation changed for this investigation; production application code did not change.

This is an initial application-work baseline, not a release performance certification. Keep production frame evidence, diagnostic React profiling evidence and live-device evidence separate. None of these measurements establish that the app is globally unoptimised or that every proposed change will help.

A later fixed-base comparison of the accepted combined frontend source is recorded in the [production performance comparison](performance-comparison.md); its results are separate from this baseline.

## Reproduce

Run from the repository root with Node 22 or later and the locked npm dependencies. Follow the worktree setup rules before installing dependencies: never install through a shared `node_modules` junction. The following commands use already-installed Edge; no browser automation dependency is required.

```powershell
npm run build:local-rehearsal
node frontend/scripts/performance/prepare-page.mjs
npm run preview:local-rehearsal
```

Leave that server running. In a second terminal:

```powershell
$env:PERF_BROWSER = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
$env:PERF_CORE_ONLY = '1'
node frontend/scripts/performance/baseline.mjs
$env:PERF_VIEWPORT = 'mobile'
node frontend/scripts/performance/baseline.mjs
```

Each invocation opens and closes its own headless browser using a fresh profile. Default widths are 1440 × 900 and 390 × 844, at DPR 1. The mobile run changes CSS viewport size; it does **not** emulate a mobile CPU, GPU, browser or software keyboard. Keep the browser version, hardware and background workload constant for comparisons. Run benchmarks alone, after tests/builds finish. Retain all three repetitions and compare scenario distributions rather than selecting the fastest result.

Reports and isolated profiles are written under ignored `.cache/performance-baseline`. Override `PERF_OUTPUT`, `PERF_URL` and `PERF_ASSETS` when needed; the runner accepts only a loopback application URL. Raw reports, generated `performance.html`, profiles, traces and local configuration must not be committed. Build output remains local rehearsal output and must not be deployed.

Unset `PERF_CORE_ONLY` for selected-route zoom/pan, mobile touch drag, viewport-resize proxy and repeated-navigation cases. These longer cases encountered intermittent browser frame scheduling constraints in this session; inspect individual samples and do not treat a timeout or no-frame sample as a pass. In the prepared page, `await runNusgoPerformance('setup')` loads the Path; `await runNusgoPerformance('sheet')`, for example, runs one named scenario three times. The page probe is available through `nusgoPerformance.start(label)` and `nusgoPerformance.stop()` for manually driven gestures.

The prepared page installs fixtures before the application imports its network clients. A test verifies that the synthetic journey passes the actual HTTP response validator **and** the displayed-candidate scoring boundary. It uses canonical COM3/UTOWN stop identities and a 1000-coordinate straight-line walking leg. The shape is a workload, not a real walking route or evidence of Valhalla correctness. Internal arrivals, public-arrival responses and location fixes are also controlled. The basemap is an empty background with real application overlays; live vector-tile/GPU costs are excluded. Request and location-fix counters help distinguish a cache refresh from a fresh HTTP snapshot.

## React profiling build

Normal production samples have `reactCommits: null`. A separate Vite configuration aliases the installed React DOM profiling entry and wraps the application in a root Profiler **only in diagnostic output**. It does not change application source or production configuration.

```powershell
npm --workspace @nusgo/frontend exec -- vite build --mode local-rehearsal --config scripts/performance/profiling-config.mjs
$env:PERF_DIST = '.cache/performance-profile'
node frontend/scripts/performance/prepare-page.mjs
npm --workspace @nusgo/frontend exec -- vite preview --mode local-rehearsal --outDir ../.cache/performance-profile --host 127.0.0.1 --port 15174 --strictPort
```

In the benchmark terminal, clear `PERF_VIEWPORT` for desktop and set:

```powershell
$env:PERF_URL = 'http://127.0.0.1:15174/performance.html'
$env:PERF_ASSETS = '.cache/performance-profile/assets'
$env:PERF_REACT_PROFILE = '1'
$env:PERF_CORE_ONLY = '1'
node frontend/scripts/performance/baseline.mjs
```

The report stores root commit counts, phases, actual durations and base durations separately. These identify commits, not the particular component responsible; use React DevTools to attribute an expensive commit before choosing a rendering boundary. Do not use diagnostic timing or bundle size as production results. Stop both preview servers with Ctrl+C. The collector closes its browser on normal completion/error; if the collector is forcibly terminated, close only the isolated browser/profile it launched.

## Measurement definitions and limits

- Frame measurements are `requestAnimationFrame` callback intervals. Their p50/p95/max and intervals exceeding 25 ms are scheduling proxies, not GPU/compositor dropped-frame counts or measured input latency. The 25 ms threshold is 1.5 × a reference 60 Hz budget, not an inferred refresh rate. This host often schedules idle callbacks around 4.2 ms; that does not prove 240 FPS rendering.
- `validFrameSample: false`, zero frames, a hidden document or a timeout invalidates frame conclusions. Intervals around one second in longer headless runs are recorded as constrained evidence requiring a foreground/physical-device rerun; they are not attributed to application code.
- Long tasks come from the browser Long Tasks API when supported; unsupported metrics are null. Layout/style counts and durations plus script/task durations are CDP deltas across the complete three-repetition scenario, including waits, probe activity and browser work. Durations are seconds. They do not isolate one component or prove a particular call caused the cost.
- Heap samples are browser-reported estimates without forced GC. DOM, marker and canvas counts are lifecycle proxies. They cannot establish retained-memory leaks or count every listener, worker, timer or GPU allocation. Use allocation/retainer traces and a longer repeated-navigation soak for those claims.
- Cold startup records navigation timing and the first poll observing installed stop markers. This includes polling/automation delay, uses a fixture basemap and is not an exact first-usable-map metric. Warm startup, production script parse/compile attribution, full-basemap readiness and live-provider startup remain separate measurements.
- The probe, fixture payload construction and CDP traffic add overhead. Compare using the same probe, data, action sequence and build mode. The root React Profiler adds separate overhead. Absolute timings from different modes must not be combined.

## Initial environment and observations

Windows build 26100, AMD Ryzen 7 5700X3D, 16 logical processors, approximately 32 GiB RAM, Node 24.15.0, headless Edge 156 / Chromium 156. No CPU or network throttling. Three repetitions per scenario after a two-second warm-up; fresh browser profiles per viewport. These are local samples, not mobile-hardware results.

The T3 shared preview reported a visible document but delivered zero animation frames during a one-second probe; requesting a shown tab still returned `visible: false`. It could load static resources but was unsuitable for animation timing. A local headless Edge fallback delivered frames. Reusing a browser across viewport changes and some longer Edge runs also produced absent or approximately 1 Hz callbacks. Fresh-browser core runs are retained separately; constrained samples are excluded from smoothness conclusions.

Production local-rehearsal asset sizes, measured with Node zlib defaults (compression settings can differ from a host):

| Asset | Raw bytes | gzip bytes | Brotli bytes |
| --- | ---: | ---: | ---: |
| Application JavaScript | 2,008,299 | 573,851 | 450,406 |
| Map worker JavaScript | 486,833 | 135,723 | 111,292 |
| Application CSS | 206,618 | 30,803 | 24,708 |

The root diagnostic Profiler recorded 0 idle commits, 10 commits per three-tab cycle, 6–7 commits during each scripted venue query, 2 per zoom-in/out sequence and 10–11 per refresh/tab-cycle sequence. Root cumulative actual render durations were approximately 65–70 ms per tab cycle and 34–54 ms per query. These are profiling-build observations with one loaded Path, not production frame costs or attribution to individual components. Fixture counters confirmed one journey request and four delivered location fixes by the end. The refresh sequence reused the arrival cache in that run; it does not demonstrate the cost of a changed arrival snapshot.

The final core production runs recorded these p95 callback intervals (milliseconds, all three repetitions). A low p95 does not exclude individual long frames:

| Scenario | Desktop repetitions | Mobile-width repetitions |
| --- | --- | --- |
| Idle | 4.3 / 4.3 / 4.3 | 4.3 / 4.3 / 4.3 |
| Tab cycle with Path | 8.3 / 4.3 / 4.3 | 16.7 / 16.7 / 16.7 |
| Sheet detent keys | Not applicable | 20.9 / 16.7 / 12.6 |
| Venue query with Path | 4.8 / 4.3 / 4.3 | 4.3 / 4.3 / 4.3 |
| Zoom in/out | 12.6 / 16.6 / 16.6 | 12.5 / 12.5 / 12.6 |
| Cache/location refresh plus tabs | 16.6 / 12.5 / 12.5 | 16.6 / 25.0 / constrained |

The third mobile refresh repetition had a 1029 ms maximum interval and seven long tasks; its 58.4 ms p95 is retained in raw evidence but excluded from a smoothness conclusion because the same environment also exhibited approximately one-second scheduling constraints. A foreground rerun must distinguish browser constraints from application work. Desktop tab cycling recorded one long task in its first repetition; desktop refresh recorded one in each of its first two. Those are observations, not yet attributed to application functions.

Mobile sheet transitions produced **391 layouts across three repetitions** (12 key-driven detent changes), versus 15 during the three query repetitions. The mobile sheet scenario accumulated about 346 ms layout time and 2.57 seconds script time across its complete measured windows. That is concrete evidence to prioritise investigating sheet sizing/measurements; it does not prove which observer or CSS declaration caused every layout. Desktop zoom accumulated 314 style recalculations and about 1.86 seconds script time across its windows, supporting a focused marker/label trace.

Cold fixture marker-ready observations were approximately 1525 ms desktop and 1317 ms mobile-width, each from a fresh browser cache. These include automation polling and exclude full live-basemap loading. They are not representative startup SLAs or a desktop-versus-mobile speed comparison. No warm-start sample was collected.

## Coverage and remaining evidence

| Case | Evidence and limit |
| --- | --- |
| Sheet detents | Mobile-width keyboard-event transitions measured. Native touch drag attempted in extended runner; longer-run frame delivery constrained. Foreground touch/device rerun needed. |
| Explore/Stops/Plan with loaded results | Core scenario measured with one validated synthetic walking Path; multiple bus alternatives remain a larger workload to sample. |
| Map zoom/pan | Core zoom measured; selected-route zoom and mouse/touch pan are in extended tooling. Real basemap and physical GPU behaviour remain unverified. |
| Venue typing with loaded Path | Controlled query measured; includes snapshot/publication work. Typing uses synthetic DOM input events, so this is not end-to-end keystroke latency. |
| Arrival/location overlap | Visibility-triggered cache refresh, delivered location updates and tab changes measured. A genuinely changed arrival generation during a physical gesture remains follow-up evidence. |
| Keyboard resizing | Extended runner provides a CSS viewport-resize proxy. Native visual viewport, safe-area and software-keyboard behaviour require a physical device. |
| Lifecycle | Repeated-navigation tooling samples counts and heap. Short runs do not establish leak freedom; constrained extended samples require rerun. |
| Startup | Exact asset/compressed sizes recorded. Cold marker readiness is a fixture observation; warm cache, script parse attribution and full live-map usability need separate traces. |

## Priorities and initial comparison budgets

1. **#559: immutable snapshot reuse.** The code copies selected/candidate/displayed geometry on every publication. The loaded-Path search and location cases plus diagnostic commit evidence provide a repeatable workload. Validate reference reuse and allocation reductions; current heap oscillations alone do not prove a leak.
2. **#560: stop zoom work.** Zoom scenarios have substantial style/script work even on an empty basemap, and the source updates marker presentation/label properties on each zoom event. Separate unchanged work and compare CDP counters as well as frame intervals. The traces do not yet attribute all cost to that handler.
3. **#561: sheet/layout work.** Compare detent transitions first, then repeat touch and keyboard tests on a foreground physical browser. Preserve scrolling, saved detents, focus and camera padding guards.
4. **#562: rendering isolation.** The root records several commits during refresh/navigation, but individual feature attribution and changed-arrival evidence are needed before moving state ownership or adding memoisation. Preserve background polling.
5. **#563: startup/icons.** The production bundle establishes a concrete size baseline. Measure the server-rendering import contribution before choosing an implementation; no claim that it explains the entire bundle.

For each implementation, require unchanged observable behaviour, a repeatable reduction in the targeted work/counters or allocation trace, and no new recurring application-attributed tasks above 50 ms during an interaction. Compare three repetitions on the same reference setup; repeat a suspicious result rather than gate on a noisy single p95. A 16.7 ms frame budget at 60 Hz is a target for a selected physical reference device, not a pass/fail guarantee derived from these headless samples. Stable resource counts after cleanup are a regression signal; retained-memory evidence is required before claiming a leak fix.

`CONTEXT.md` reviewed; no update needed. This investigation introduces no domain vocabulary.

## Verification

- `npm test`: exit 0; 20 shared, 1167 frontend (including the two diagnostic regression tests), 130 backend Node and 103 backend Pathfinding tests passed.
- `npm run lint`: exit 0; no new bare button selectors.
- `npm run build`: exit 0 with `VITE_API_ORIGIN=https://api.nusgo.invalid`; the existing large-chunk warning remains.
- `npm run build:local-rehearsal`: exit 0; production rehearsal assets used for browser measurements.
- The dedicated React profiling Vite build: exit 0; diagnostic output kept under ignored cache. Existing chunk warning and the expected outside-frontend-root output-directory warning were reported.
- `git diff --check` and syntax checks for the six non-test diagnostic modules: exit 0.
- Browser evidence: validated fixture Path loaded through real application UI; production desktop/mobile-width core scenarios and separate desktop React profiling completed. Native device, live-provider and full-basemap checks remain unverified as described above.

The durable findings are also published in the tracking issue. Diagnostic scripts and documentation are local, uncommitted changes; no branch push or pull request was authorised or performed.
