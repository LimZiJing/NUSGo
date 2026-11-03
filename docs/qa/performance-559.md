# #559 navigation snapshot reuse evidence

## Deterministic allocation proxy

The snapshot regression seam exercises four candidate Paths with 1,000 coordinate tuples each. The selected Path is candidate 0; displayed candidates include candidates 0 and 2. It publishes 20 unrelated venue-query and location-fix updates and counts distinct coordinate tuple arrays retained by those snapshots.

At base `f21964595968dde261973f7e2cb965ce0ba600b7`, the test run on the original snapshot implementation observed **140,000** tuple arrays. After the change, the same candidate geometry and 20-update workload observed **4,000**: one frozen geometry copy per distinct Path, reused across selected/candidate/displayed references and subsequent updates. This is a **97.1% reduction** in this deterministic copy count. The baseline implementation copied all seven selected/candidate/displayed Path references on every publication, so the chained immutable-input flow has the same 140,000-copy baseline.

The test also checks mutation isolation for Path geometry, Path endpoint coordinates, Current location, Personal Waypoint coordinates and the latest location fix. It verifies shallow-frozen inputs with mutable nested geometry are recopied after a change, and that candidate replacement and alternative selection leave earlier snapshots unchanged. Existing navigation-session coverage exercises cancellation and location-update behavior.

This is an object-allocation proxy from published snapshots, not a heap or GC measurement and not an interaction-time measurement. The preview browser reported unavailable (`available: false`, `visible: false`), so no browser smoke was run. No UI or map presentation code changed. The result does not establish native frame scheduling, GPU cost, or physical-device performance; the headless scheduling constraints recorded in [the #558 baseline](performance-baseline.md) still apply.

`CONTEXT.md` reviewed; no update needed.

## Allocation and interaction measurements

The earlier tuple-count test is an object-count proxy. I added a separate Node allocation-sampling workload and controlled production interaction runs. The base implementation was loaded from f21964595968dde261973f7e2cb965ce0ba600b7 with git show; the reviewed working-tree implementation was loaded from the same checkout. The workload used four candidate Paths with 1,000 coordinate tuples each, candidate 0 selected, candidates 0 and 2 displayed, and repeated unrelated venue-query plus location-fix updates.

Run the focused allocation workload from the repository root:

```powershell
$env:PERF_UPDATES = '150'
$env:PERF_REPETITIONS = '3'
node --expose-gc --experimental-strip-types frontend/scripts/performance/snapshot-allocation-559.mjs
```

The Node V8 allocation sampler used a 64-byte sampling interval. Across three repetitions, its median estimated sampled allocations were **517,520 bytes at base** and **3,800 bytes after the change** (about **99.3% lower**). The separately timed, unprofiled 150-update loop had median durations of **92.968 ms at base** and **44.336 ms after the change** (about **52.3% lower**). The final publication retained 7,000 tuple references at base and 4,000 after the change, consistent with one geometry copy per distinct Path rather than one per selected, candidate, and displayed reference.

The allocation profiler changes execution cost, so its timed samples are not used as interaction latency. No GC event was observed in the measured windows, and the live-heap deltas varied with collection timing. These results support lower sampled allocation and lower isolated update-loop time; they do not establish reduced GC frequency or pause time.

I also ran the copied controlled-fixture harness against base and changed production local-rehearsal builds. Both variants used a fresh isolated headless Edge profile, one synthetic 1,000-coordinate Path, 2 seconds of warm-up, three repetitions, and the same empty basemap/API fixtures. The search scenario delivered one journey request; the refresh scenario delivered four location fixes but did **not** fetch a new arrival generation.

| Production scenario metric (three repetitions combined) | Base | Changed |
|---|---:|---:|
| Venue search ScriptDuration | 161.101 ms | 151.853 ms |
| Venue search TaskDuration | 283.271 ms | 284.924 ms |
| Location-fix plus tab refresh ScriptDuration | 901.116 ms | 939.218 ms |
| Location-fix plus tab refresh TaskDuration | 1,903.677 ms | 1,979.008 ms |

All recorded animation-frame samples were valid. Search p95 intervals were 4.3 ms in all six samples. Refresh p95 intervals were 8.4–12.5 ms at base and 8.4–16.7 ms after the change. These are headless requestAnimationFrame scheduling observations, not compositor frame-drop or input-latency measurements. The aggregate production counters do not isolate snapshot time; they show no clear application-level latency improvement above browser and scenario noise.

To reproduce the production runs, build the base variant with PERF_VARIANT=base and PERF_BASE_REV=f21964595968dde261973f7e2cb965ce0ba600b7 using frontend/scripts/performance/snapshot-build-config.mjs; build the changed variant with the default Vite config. For each build, run node frontend/scripts/performance/prepare-page.mjs, serve frontend/dist-local-rehearsal on 127.0.0.1:15173, and run frontend/scripts/performance/baseline.mjs with PERF_URL=http://127.0.0.1:15173/performance.html, PERF_ASSETS=frontend/dist-local-rehearsal/assets, PERF_CORE_ONLY=1, and a distinct ignored PERF_OUTPUT directory for base and changed. The harness source, controlled fixtures, scenario actions, base-build adapter, and allocation sampler are in frontend/scripts/performance/.

The browser comparison uses a fixture Path and synthetic DOM search actions. The same run does not prove end-to-end typing latency, live-provider costs, mobile-device behavior, map/GPU performance, or GC reduction. No raw browser profiles or generated artifacts are committed.


## Review correction and reproducibility check

The focused reviewer found a `star`/`start` typo in the sampler's elapsed-time calculation. It was corrected before committing. The documented 150-update, three-repetition command then completed successfully. Its rerun sampled-allocation medians were 518,648 bytes at base and 3,416 bytes changed (99.3% lower); separately timed update-loop medians were 102.363 ms and 49.813 ms. Allocation samples were 512,248 / 518,648 / 527,352 bytes at base and 3,296 / 3,416 / 3,776 bytes changed. No GC events occurred during the allocation samples. This rerun supports reproducibility of the isolated workload; the application-level interaction limitations above still apply.

The diagnostic browser harness leaves its disposable profile under the ignored output directory after terminating the browser. Treat that directory as a local measurement artifact, never a source artifact; remove only the exact profile created by a finished run when it is no longer needed.