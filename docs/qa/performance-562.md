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

The extra two renders on the base are the refreshing and successful snapshot state transitions reaching App. After the change, those updates remain within the mounted Stops workspace. The other-tab pan causes no arrival request; the next background refresh still requests the Stops-era stop set and the new arrival time appears when Stops is revisited.

## Lifecycle and UI checks

The Stops arrival hook tests cover the 30-second clock, freshness on browser visibility return, retained snapshot during refresh and error states, failure recovery, background polling on an inactive in-app tab, request cancellation, listener removal, and timer cleanup. The App integration test verifies a new arrival generation while on Explore and checks that the other-tab map pan does not change the background request set.

The mobile preview smoke confirmed that Stops → Explore → Stops retained the selected Favourites list and expanded sheet. Live arrival data was unavailable in that preview because `/api` returned HTML where JSON was expected; arrival rendering evidence therefore comes from the controlled App and hook tests.

No production timings, native FPS, GPU work, or physical-device results were measured. `CONTEXT.md` reviewed; no update needed.

## #314 coordination and uncompleted browser evidence

I inspected open issue #314 read-only. Its one-second-clock observation is stale at the shared base and in this working tree: the current Stops display clock is 30 seconds, and the arrival polling interval is also 30 seconds. #562 overlaps with #314 on the effect of Stops updates on unrelated views. Its component boundary addresses arrival-driven rendering. #314 also covers map-centre updates; App still owns mapCenter state, and the existing integration counts show one additional Explore and Plan invocation on an active map-centre update. That pan behavior remains a separate open #314 gate. No issue or tracker changes were made.

I attempted a controlled browser harness with a cache-expiring arrival scenario, a separate location scenario, a base-source Vite adapter, and root React Profiler instrumentation. The Vite base-source and Profiler build config is retained; I restored the copied runner files after their fixture extension could not reach a valid Stops arrival state. The base production Vite build succeeded. The headless page loaded NUSGo, its static data resources, and a MapLibre canvas, but the default stop-marker readiness condition never passed. With a canvas fallback, the Stops screen still remained at “Loading stops…” after the isolated profile had Favourites selected and contained COM3; no fixture arrival request was made. Chromium reported no JavaScript exceptions. I therefore could not capture valid browser React Profiler commits or production CDP interaction costs for #562. The older #558 profile report is from revision 29d9a884197a90125aab8afaea702076294ce8db, so I did not use it as a same-base comparison.

The earlier App integration test still supplies controlled component invocation evidence: arrival refreshes while Explore is active add zero Explore/Plan invocations after the change, while map-centre and location updates each add one. These counts are not Profiler commits or production timings. #562 still needs same-base browser evidence for changed arrival generations, map pan, and location updates before accepting its performance-measurement criteria.


The diagnostic React profiling Vite build for the changed variant compiled successfully with 2,408 modules and emitted the Profiler-enabled bundle under the ignored .cache/performance-profile-562 directory. Its browser scenario was not run because the Stops fixture did not reach a valid arrival request, so this is build validation only, not commit evidence.
