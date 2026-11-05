# Production performance comparison

Recorded 3 November 2026. This historical comparison uses fixed base revision `f21964595968dde261973f7e2cb965ce0ba600b7` and accepted combined frontend source fingerprint `a85ff7013dc6899b163d901168adb2e2b110128287c7f7f162b3506a2290379e`; it was not remeasured against the later `origin/main` revision `92c74516`. The #558 procedure and measurements are recorded in the [performance baseline](performance-baseline.md). The user reported that all six functional scenarios passed; this document records a separate performance comparison and does not replace that acceptance result.

On 5 November, the fingerprint contract was extended to include `frontend/index.html` and the refreshed pin was computed from rebuilt source snapshots: base frontend `b579fe9cbebe4c6470db94dccb3f7b434bdada9f012a0622b90eacea91a4304e`, combined frontend `dd9e45142cf3a0c7ff1e9bb79ed1a058db8d007fdab1e6298dd8c48ff7ee1236`, static data `cb08bfacbf702e90ae4eaa2731c5b464595d1e6834bdb111c75a134ebeb64873`, and page generation `c6c91466132d7d1cc217715e9216709825edf9250bf723a89c20bdfdc36f8953`. The browser collector rerun did not produce measurements: Edge loaded the page but did not show stop markers, and the Stops panel remained at “Loading stops…” until the collector timed out. The numeric results below remain the 3 November measurements under their original fingerprints; the refreshed pin does not retroactively identify those results.

## Result

The sheet detent interaction shows a repeatable reduction in measured main-thread work: median script time fell from 298 ms to 31 ms, median task time from 446 ms to 114 ms, and median layout count from 41 to 2 across five verified `partial → full` drags per build. The browser's Event Timing duration changed by one 8 ms rounding step at the median (56 ms to 48 ms), while the p95 stayed at 72 ms on both builds. The work reduction is clear for this controlled interaction; an end-user response-time improvement is not established by these Event Timing samples.

The Plan query/candidate/location workflow, the loaded Stops tab return, and cold startup did not show a consistent gain. The combined gzip asset total increased by 1,983 bytes. The zoom-boundary run is only an input proxy because the collector did not read the map's actual zoom value.

## Compared builds

| Build | Source identity |
| --- | --- |
| Base | `f21964595968dde261973f7e2cb965ce0ba600b7`; `frontend/src` SHA-256 `69761446b584f7f241c356b6b977de65565cb38ad53cd568aea8e5ea5a8daa71` (391 files) |
| Combined | Accepted combined frontend source snapshot; `frontend/src` SHA-256 `a85ff7013dc6899b163d901168adb2e2b110128287c7f7f162b3506a2290379e` (396 files) |

Both snapshots used the same 11-file static-data fingerprint: `ac7c05c4d070181eff83210f36302a9fc8412eebd862dcd096a82386796b98b4`.

The helper created isolated source/build snapshots under ignored `.cache/performance-orchestration/real-performance/`. It took the base with `git archive`, copied the current static frontend data, overlaid the combined `frontend/src`, and built each snapshot with the already-installed Vite and dependency links. It did not install dependencies, copy environment files or credentials, or write through the dependency links. All source snapshots and build outputs were regular directories.

## Method

- Production rehearsal builds used Vite `local-rehearsal` mode, production bundling and minification, `VITE_API_ORIGIN=http://127.0.0.1:3001`, and `VITE_DATA_VERSION=development`.
- The page installed controlled API fixtures before app modules loaded. Both builds received the same canonical NUS stops and static data, a synthetic 1,000-coordinate walking Path, deterministic location fixes, and an empty basemap style with real application overlays. The app loaded its five static data resources successfully (HTTP 200). No live provider call or live arrival refresh was timed.
- Browser: headless Microsoft Edge `156.0.4314.58` on Windows build `10.0.26100`, AMD Ryzen 7 5700X3D, 16 logical CPUs, Node `v24.15.0`. Runs used no CPU or network throttling. Desktop CSS viewport was 1440 × 900; sheet CSS viewport was 390 × 844; both used DPR 1. The smaller viewport does not emulate mobile hardware.
- The selected workflows had a warm-up before measurement and five interleaved repetitions per build. The Plan run also took five first navigations in fresh browser profiles per build. Sheet samples came from three isolated runs because Edge intermittently timed out on later touch dispatches. One smoke run and two partial five-repeat runs supplied five successful, detent-changing samples per build to the summarizer.
- Chromium Event Timing entries were grouped by interaction ID. `presentationTime` was unavailable, so reported durations use Chromium's rounded `EventTiming.duration`; these are not INP measurements. The browser exposed `longtask` and `long-animation-frame` entries. CDP `LayoutCount`, `LayoutDuration`, `RecalcStyleCount`, `ScriptDuration`, and `TaskDuration` were also collected.
- `requestAnimationFrame` interval samples are kept as scheduling diagnostics. They do not measure GPU frames, dropped frames, or physical-device FPS and do not support those claims here.
- The shared preview tools could show the running page but did not expose the required CDP trace and touch-emulation controls. The initial `preview_status` returned `available=false` and no tab; a new hidden incognito preview opened and returned a page snapshot successfully. Instrumented comparisons therefore used the isolated headless Edge harness. No preview-tool error occurred.

## Repeated interaction results

Times use median / nearest-rank p95 (min–max) across runs. With five run samples, p95 is the observed maximum. Event Timing `n` counts distinct interaction IDs with entries, not repetitions; the remaining rows use five measured runs per build.

| Workflow and measure | Base | Combined | Reading |
| --- | ---: | ---: | --- |
| **Sheet drag: Event Timing duration**, median / p95 (`n=5` each) | 56 / 72 (40–72) | 48 / 72 (40–72) | One 8 ms median step lower; p95 and ranges overlap. No demonstrated latency gain. |
| **Sheet drag: layout count**, median / p95 | 41 / 45 (39–45) | 2 / 2 (2–2) | Clear lower layout work in all five combined runs. |
| **Sheet drag: layout duration** | 21.9 / 28.6 (16.2–28.6) | 12.7 / 25.1 (9.2–25.1) | Lower median; ranges overlap. |
| **Sheet drag: script duration** | 298.0 / 383.9 (290.2–383.9) | 31.0 / 57.2 (25.1–57.2) | Clear reduction in this measured interaction window. |
| **Sheet drag: task duration** | 446.3 / 535.5 (380.0–535.5) | 113.6 / 290.5 (94.4–290.5) | Clear reduction in this measured interaction window. |
| **Sheet drag: style recalculations** | 43 / 49 (43–49) | 66 / 69 (64–69) | Increased; not every browser counter decreased. No long task was observed; Long Animation Frame entries totaled 2 base and 1 combined. |
| **Plan query/candidate/location: Event Timing duration** (`n=20` / `n=23`) | 24 / 32 (16–40) | 16 / 32 (16–40) | Combined median is one rounding step lower; p95 is equal. One base run had no Event Timing entries. |
| **Plan: script duration** | 383.3 / 464.1 (339.0–464.1) | 349.8 / 436.2 (339.7–436.2) | Ranges overlap; no consistent gain established. |
| **Plan: task duration** | 627.9 / 1,796.4 (564.5–1,796.4) | 615.7 / 747.4 (577.4–747.4) | Medians are close and ranges overlap. One base run had an invalid frame sample and an unusually high task counter. No Long Task entry was emitted for that run. |
| **Plan: layout count / duration** | 14 / 16; 4.1 / 8.9 ms (3.0–8.9) | 14 / 14; 4.2 / 5.2 ms (3.6–5.2) | No layout-count reduction. |
| **Loaded Stops → Explore → Plan return: Event Timing duration** (`n=15` / `n=12`) | 56 / 120 (40–120) | 48 / 120 (32–120) | The median difference is one rounding step; p95 is equal. |
| **Tab return: script duration** | 327.7 / 437.8 (267.1–437.8) | 287.1 / 410.1 (117.1–410.1) | Lower combined median with overlapping ranges; inconclusive. |
| **Tab return: task duration** | 627.8 / 800.6 (516.7–800.6) | 563.7 / 773.0 (500.1–773.0) | Lower combined median with overlapping ranges; inconclusive. Layout count was 7 on both builds; Long Task count medians were 0 base and 1 combined, with p95 1 on both. |

All five sheet samples per build changed the sheet from `partial` to `full` using 260–300 CSS-pixel CDP touch drags at 390 × 844. The report's aggregation helper rejects samples without that observed detent change.

The Stops rows were already loaded and rendered in every tab-return run. Each test had one arrivals request before the measured sequence and still one when Stops became visible; it did not produce a second arrival generation. These results describe tab return with the current snapshot, not changed-arrival generation.

The Plan workflow changed the query to `Kent Ridge MRT`, selected the Bus stops filter and a candidate, requested a route, and applied a controlled location fix. It did not exercise a trusted physical location sensor or waypoint movement.

## Startup and assets

### Historical cold-start comparison

Each cold-start sample used a fresh browser profile. The page's marker-ready time includes controlled-fixture loading and excludes live basemap tile loading.

| Startup measure (`n=5` per build) | Base median / p95 (range) | Combined median / p95 (range) |
| --- | ---: | ---: |
| Marker ready | 1,909.7 / 2,406.9 ms (1,722.1–2,406.9) | 1,772.2 / 2,061.0 ms (1,751.9–2,061.0) |
| First Contentful Paint | 936 / 1,200 ms (852–1,200) | 860 / 940 ms (820–940) |
| DOMContentLoaded | 510.1 / 783.2 ms (444.2–783.2) | 471.9 / 538.0 ms (451.4–538.0) |

The startup ranges overlap, so these samples do not establish a cold-start gain. These historical results are cold-only; the supplemental PR-head measurements below do not alter this table or compare revisions.

### Supplemental PR-head startup samples (not historical comparison results)

A bounded 20-minute attempt to recover the historical combined frontend source did not reproduce its recorded fingerprint. The guarded collector matched base `f21964595968dde261973f7e2cb965ce0ba600b7` and the static-data fingerprint, but rejected the available frontend source (`0947c9e16c73d4fcb7f33f9f66c1a5d9961d0bd614d169539681a8299604ae54`, 393 files) against the expected combined fingerprint (`a85ff7013dc6899b163d901168adb2e2b110128287c7f7f162b3506a2290379e`, 396 files). The fingerprint guard remains unchanged. These samples were collected on 4 November 2026 from PR head `9df872729ada98be3ab8f52c64b444b5fae20592`; they describe neither the historical combined source nor baseline `29d9a884197a90125aab8afaea702076294ce8db`.

Five independent fresh-profile pairs each recorded one cold first navigation and one warm repeat navigation in the same profile after the document completed and fixture markers were ready. Browser cache remained enabled; service-worker requests were bypassed. Same-origin transfer was 621,281 bytes on cold starts and 2,700–3,000 bytes on warm starts, consistent with browser-cache reuse. The controlled fixture and empty basemap exclude live tile and provider startup. Marker readiness includes the polling interval and is not an exact first-usable-map time. The service-worker controller flag was `true` on cold pages and `false` on warm pages; because requests were bypassed, this flag does not show that the service worker served requests.

| Startup measure (`n=5` per condition) | Cold median (range) | Warm median (range) |
| --- | ---: | ---: |
| Marker ready | 1,619 ms (1,306–1,743) | 1,119 ms (970–1,195) |
| First Contentful Paint | 560 ms (436–592) | 208 ms (184–252) |
| DOMContentLoaded | 202 ms (148–222) | 109 ms (100–151) |

Raw reports remain under ignored `.cache/performance-orchestration/real-performance/pr-head-startups/verified-2` through `verified-6`. They record PR-head `9df8727`, frontend source fingerprint `0947c9e…` (393 files), and static-data fingerprint `ac7c05c4d070181eff83210f36302a9fc8412eebd862dcd096a82386796b98b4`. The measurements used the local startup sampler added for this review; only frontend source and static data are fingerprinted in these historical raw reports.

### Compressed assets from the historical builds

| Compressed production assets | Base | Combined | Change |
| --- | ---: | ---: | ---: |
| JavaScript, CSS and map worker, gzip | 751,511 bytes | 753,494 bytes | +1,983 bytes (+0.26%) |
| JavaScript, CSS and map worker, Brotli | 594,823 bytes | 596,059 bytes | +1,236 bytes (+0.21%) |
| Raw total | 2,746,128 bytes | 2,752,389 bytes | +6,261 bytes |

## Coverage and limits

- The sheet result is the strongest measured improvement: fewer layouts and lower script/task work recurred across all five verified detent changes. Its Event Timing result remains inconclusive, and the sheet sample's style-recalculation count increased.
- The first default-run sheet samples used a 150-pixel drag and did not change the detent; those samples were excluded from the comparison.
- The Plan and Stops tab-return results do not establish an interaction-latency gain. Their Event Timing median differences are one Chromium rounding step and their p95s are unchanged.
- The zoom probe sent a zoom-control click followed by wheel deltas intended to move around 14.0. It did not read actual MapLibre zoom, emitted no Event Timing entries, and is not evidence for the exact 13.9 ↔ 14.1 boundary. Its style-recalculation median rose from 43 to 118. No zoom performance claim is made.
- Waypoint movement and a changed arrival generation were not measured. The separately filed Stops camera-return card flash remains outside this comparison and was not changed.
- Edge returned `Input.dispatchTouchEvent timed out` in two longer sheet attempts. Their completed samples, combined with the successful smoke run, supplied five successful detent-changing samples per build; each failing later action was excluded. No page exception, console error, failed resource, or automatic-review denial was recorded in the completed production comparisons.
- This is one Windows/Edge host with synthetic data, no live map tiles, no physical mobile device and no CPU/network throttling. It supports a targeted browser-work comparison, not a release-wide performance claim.

## Reproduction

Run from the repository root with the existing dependencies and an installed Chromium or Edge browser. The tracked helpers live in `frontend/scripts/performance/`; their generated snapshots, reports, profiles and build outputs remain under ignored `.cache/performance-orchestration/real-performance/`. `prepare-builds.ps1` refuses to overwrite existing snapshots; a fresh ignored measurement directory is required to rebuild them. Set `PERF_BROWSER` explicitly for the installed executable. The collector and summarizer reject source/data fingerprints that differ from `frontend/scripts/performance/recorded-comparison.json`. Current `main` is not the historical combined source: recreate the measured source snapshots first; running against a newer checkout is deliberately rejected rather than presented as reproduction of these results.

The guard now also pins `pageGeneration`: the page preparer, fixture installer, browser probe, scenario runner and fingerprint helper, as defined in the [baseline procedure](performance-baseline.md). The collector checks it before generating pages or starting previews/browsers, and includes it in new reports. The summarizer requires the same pinned fingerprint. Historical reports above predate this provenance field and are rejected by the updated summarizer; no fingerprint has been retroactively assigned to their workloads. The pin identifies the current guarded harness, not a verified historical harness. Recollect a separately identified dataset with the guarded harness before using the updated summarizer; the published historical numbers remain unchanged.

The test that compares the live page-generation inputs with the recorded pin is opt-in so ordinary frontend edits do not fail the default test suite. Before guarded collection, run it explicitly with `NUSGO_GUARDED_PERFORMANCE_COLLECTION=1`; the independent per-input drift and provenance tests remain in the default suite.

```powershell
$env:PERF_BROWSER = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
powershell -NoProfile -File 'frontend/scripts/performance/prepare-builds.ps1'

$env:NUSGO_GUARDED_PERFORMANCE_COLLECTION = '1'
npm --workspace @nusgo/frontend run test -- scripts/performance/page-inputs.test.mjs
Remove-Item Env:NUSGO_GUARDED_PERFORMANCE_COLLECTION

$env:PERF_OUTPUT = '.cache/performance-orchestration/real-performance/plan-cold-five.json'
$env:PERF_SCENARIOS = 'plan-query-candidate-location'
$env:PERF_REPETITIONS = '5'
node 'frontend/scripts/performance/collect-observed.mjs'

# Sheet drag: use distinct output files so completed samples survive a later timeout.
$env:PERF_SCENARIOS = 'sheet-touch-drag'
$env:PERF_REPETITIONS = '1'
$env:PERF_OUTPUT = '.cache/performance-orchestration/real-performance/sheet-smoke-touch-fixed.json'
node 'frontend/scripts/performance/collect-observed.mjs'

$env:PERF_REPETITIONS = '5'
$env:PERF_OUTPUT = '.cache/performance-orchestration/real-performance/sheet-validated-comparison.json'
node 'frontend/scripts/performance/collect-observed.mjs'

$env:PERF_OUTPUT = '.cache/performance-orchestration/real-performance/sheet-touch-validated-comparison.json'
node 'frontend/scripts/performance/collect-observed.mjs'

node 'frontend/scripts/performance/summarize-sheet-evidence.mjs' 'sheet-smoke-touch-fixed.json' 'sheet-validated-comparison.json' 'sheet-touch-validated-comparison.json'
```

The collector can leave completed samples in a file if a later CDP touch dispatch times out; the sheet helper reads its input files from the ignored cache directory, verifies matching source fingerprints and includes only samples that changed the detent from `partial` to `full`. Both helpers write generated results under ignored `.cache/performance-orchestration/real-performance/`; the raw result files and isolated profiles are not committed. Moving the helpers into the tracked scripts directory changed their repository/cache path resolution. Review added explicit source/data fingerprint guards to reject drift; it did not change the recorded measurements or comparison method. A new comparison of different revisions requires a separately identified dataset and report, rather than relabeling this historical evidence.
