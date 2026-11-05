# Arrival rendering evidence for #562

## Controlled render counts

The same application integration scenario was run against the requested base (`f21964595968dde261973f7e2cb965ce0ba600b7`) and the changed checkout. It loads Stops Favourites, applies a map-centre update and a location update, leaves for Explore, pans the map there, then delivers a successful new arrival snapshot while Stops continues polling in the background.

Counts below are calls to the Explore and Plan feature component functions. The integration test uses the real App composition and Stops workflow with controlled clients; Explore and Plan are counting probes so the test can observe whether those unrelated feature boundaries render. These are deterministic render counts, not production timing or device frame measurements.

| Event | Base Explore / Plan | Changed Explore / Plan |
| --- | ---: | ---: |
| Before background arrival refresh | 8 / 8 | 7 / 7 |
| After the new snapshot renders | 10 / 10 | 7 / 7 |
| Change during snapshot refresh | +2 / +2 | +0 / +0 |
| Active map-centre update | +1 / +1 | +1 / +1 |
| Location update | +1 / +1 | +1 / +1 |

The extra two renders on the base are the refreshing and successful snapshot state transitions reaching App. After the change, those updates remain within the mounted Stops workspace. The other-tab pan causes no arrival request and the new arrival time appears when Stops is revisited. Because Favourites does not depend on map centre, this integration scenario does not independently prove stop-set retention. The hook regression test supplies that evidence by changing the requested stops while inactive and checking that polling retains the previous set, then follows the new set on reactivation. Nearby contains all stops ordered by distance; a map pan changes order rather than membership, so switching this test to Nearby would not establish the claimed retention either.

## Lifecycle and UI checks

The Stops arrival hook tests cover the 30-second clock, freshness on browser visibility return, retained snapshot during refresh and error states, failure recovery, background polling on an inactive in-app tab with a changed requested stop set, request cancellation, listener removal, and timer cleanup. The App integration test verifies render isolation for a new arrival generation while on Explore, including an other-tab map pan with a fixed Favourites set.

The mobile preview smoke confirmed that Stops → Explore → Stops retained the selected Favourites list and expanded sheet. Live arrival data was unavailable in that preview because `/api` returned HTML where JSON was expected; arrival rendering evidence therefore comes from the controlled App and hook tests.

No production timings, native FPS, GPU work, or physical-device results were measured. `CONTEXT.md` reviewed; no update needed.

## #314 coordination and uncompleted browser evidence

I inspected open issue #314 read-only. Its one-second-clock observation is stale at the shared base and in this working tree: the current Stops display clock is 30 seconds, and the arrival polling interval is also 30 seconds. #562 overlaps with #314 on the effect of Stops updates on unrelated views. Its component boundary addresses arrival-driven rendering. #314 also covers map-centre updates; App still owns mapCenter state, and the existing integration counts show one additional Explore and Plan invocation on an active map-centre update. That pan behavior remains a separate open #314 gate. No issue or tracker changes were made.

A controlled browser attempt used a cache-expiring arrival scenario, a separate location scenario, a base-source Vite adapter, and root React Profiler instrumentation. The base production Vite build succeeded. The headless page loaded NUSGo, its static data resources, and a MapLibre canvas, but the default stop-marker readiness condition never passed. With a canvas fallback, the Stops screen still remained at “Loading stops…” after the isolated profile had Favourites selected and contained COM3; no fixture arrival request was made. Chromium reported no JavaScript exceptions. This attempt never reached the arrival, pan, or location measurements, so it supplied no valid browser React Profiler commits or production CDP interaction costs for #562. The older #558 profile report is from revision 29d9a884197a90125aab8afaea702076294ce8db, so it is not a same-base comparison.

The earlier App integration test still supplies controlled component invocation evidence: arrival refreshes while Explore is active add zero Explore/Plan invocations after the change, while map-centre and location updates each add one. These counts are not Profiler commits or production timings. #562 still needs same-base browser evidence for changed arrival generations, map pan, and location updates before accepting its performance-measurement criteria.


The diagnostic React profiling Vite build for the changed variant compiled successfully with 2,408 modules and emitted the Profiler-enabled bundle under the ignored `.cache/performance-profile-562` directory. That profiling build was not exercised in a browser. Its compilation is build validation only, distinct from the unsuccessful production-browser attempt above.

## Retained browser harness and reproduction

The PR retains `frontend/scripts/performance/issue562-build-config.mjs` (base-source adapter and optional Profiler instrumentation), `build-variant.mjs` (shared variant and base-revision settings), `fixtures.mjs` (controlled network, API, and location boundaries), `browser-metrics.mjs` (sampling probe), `scenarios.mjs` (DOM actions), `prepare-page.mjs` (injects the fixtures and probe), and `baseline.mjs` (headless CDP runner and JSON reports). The retained harness is **not yet validated against a live Stops arrival state**. Its `refresh` action dispatches visibility and location events and changes tabs; it does not supply an independently measured cache-expiring arrival or location scenario.

Use the same environment for the build and runner. From the repository root, the following PowerShell commands build the selected variant, prepare an ignored instrumented page, and serve it. In a second terminal, set the same variant settings and run the runner:

```powershell
$env:PERF_VARIANT = 'base' # Repeat with 'changed' for the comparison.
$env:PERF_BASE_REV = 'f21964595968dde261973f7e2cb965ce0ba600b7'
$env:PERF_REACT_PROFILE = '0'
npm --workspace @nusgo/frontend exec -- vite build --mode local-rehearsal --config scripts/performance/issue562-build-config.mjs
node frontend/scripts/performance/prepare-page.mjs
npm run preview:local-rehearsal

# Second terminal, with the same PERF_VARIANT / PERF_BASE_REV / PERF_REACT_PROFILE:
$env:PERF_BROWSER = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
node frontend/scripts/performance/baseline.mjs
```

`PERF_VARIANT` selects `base` or the default `changed`; `PERF_BASE_REV` defaults to the revision shown above. Only three App composition files are substituted from that base, so this is a controlled composition comparison rather than a complete checkout of the base. Reports retain the checkout `revision`, the selected `variant`, and the resolved `baseRevision` for base runs. Filenames include variant, profiling mode, and viewport so the two variants do not overwrite one another.

The remaining supported settings are:

| Variable | Default / meaning |
| --- | --- |
| `PERF_BROWSER` | Required path to a Chromium or Edge executable. |
| `PERF_URL` | `http://127.0.0.1:5173/performance.html`; loopback hosts only. |
| `PERF_OUTPUT` | `.cache/performance-baseline`; report and isolated browser profile directory. |
| `PERF_DIST` | `frontend/dist-local-rehearsal`; input/output directory for `prepare-page.mjs`. |
| `PERF_ASSETS` | `frontend/dist-local-rehearsal/assets`; assets measured by the runner. |
| `PERF_VIEWPORT` | `mobile` selects 390 × 844; otherwise 1440 × 900. |
| `PERF_REACT_PROFILE` | `1` enables the diagnostic profiling build at `.cache/performance-profile-562`; otherwise production. |
| `PERF_CORE_ONLY` | `1` skips selected-route zoom/pan, mobile drag/resize, and repeated-navigation scenarios. |

For profiling, set `PERF_REACT_PROFILE=1`, `PERF_DIST=.cache/performance-profile-562`, and `PERF_ASSETS=.cache/performance-profile-562/assets`; serve that directory with `npm --workspace @nusgo/frontend exec -- vite preview --outDir ../.cache/performance-profile-562 --host 127.0.0.1 --port 5173`. Run `prepare-page.mjs` after each build. Build prerequisites and timing-file handling remain as documented in `docs/local-services.md` and `docs/agents/workflow.md`.

The runner intends to run setup followed by idle, tabs, mobile sheet, search, zoom, and refresh, plus the optional scenarios listed above. None of these measured browser scenarios completed in the recorded #562 attempt. Setup now waits for DOM state with bounded timeouts, but that change does not turn the earlier failed attempt into validated browser evidence.
