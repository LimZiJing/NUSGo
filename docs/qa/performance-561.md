# Mobile sheet layout profile (#561)

## Method

Compared the untouched `f21964595968dde261973f7e2cb965ce0ba600b7` base build with the local CSS and measurement changes. Both were production local-rehearsal builds measured on Windows 10.0.26100 with Node 24.15.0, Edge/Chromium 156, an AMD Ryzen 7 5700X3D, no CPU or network throttling, and a 390 × 844 CSS viewport at DPR 1. Each fresh headless browser profile ran the controlled fixture page, two seconds of warm-up, and three repetitions of the keyboard-driven sheet detent scenario.

The fixture uses the production application with controlled transit data and an empty basemap. It excludes live map tiles, physical mobile CPU/GPU behavior, a native software keyboard, and input latency. Frame intervals are requestAnimationFrame scheduling samples, not compositor dropped-frame measurements.

## Snap results

| Measure (3 repetitions) | Base | Local change |
| --- | ---: | ---: |
| Layout events | 452 | 36 (−92%) |
| Layout duration | 0.432 s | 0.109 s (−75%) |
| Style recalculations | 591 | 884 (+50%) |
| Style recalculation duration | 0.380 s | 0.406 s (+7%) |
| Script duration | 2.434 s | 0.957 s (−61%) |
| Frame p95 intervals | 25.0 / 16.6 / 12.6 ms | 4.3 / 4.3 / 4.3 ms |
| Maximum frame intervals | 79.1 / 37.5 / 25.0 ms | 29.2 / 25.0 / 25.0 ms |
| Intervals over 25 ms | 10 | 2 |
| Long tasks | 0 | 0 |

Removing the `padding-bottom` transition reduced repeated layout work during detent snaps. Style recalculations increased in this sample, so the evidence supports a targeted layout reduction rather than a general claim that every rendering cost fell. The collector does not expose paint count or paint duration; paint cost remains unmeasured.

## Coverage and limits

- The earlier extended collector did not produce a touch-drag sample: it stopped making progress in the selected-route portion before reporting any extended interaction, and was interrupted. The supplemental controlled headless touch trace below records an actual drag.
- The T3 preview opened in a hidden state and reported `visible: false`; those earlier keyboard and click actions did not change the detent. The supplemental local headless trace below did change detents. A physical device, native keyboard, and real GPU remain unverified.
- Existing production behavior for sheet clipping and native scroll is retained in CSS. Automated tests cover the settled detent insets, rapid resize/visual-viewport/observer bursts, final viewport values, frame cancellation on unmount, and sheet element remount handling.
- The local Edge reports and generated browser profile are ignored under `.cache/performance561`; they are not source artifacts and are not included in Git.


## Supplemental controlled touch-drag trace — 3 November 2026

A production base build and the current local build were exercised at 390 × 844 CSS pixels, DPR 1, using Edge 156.0.4314.58 on Windows 11 build 26100, Node 24.15.0, controlled API fixtures, an empty basemap, and a fresh disposable browser profile. The active Stops sheet started at the partial detent. Each trace used six real CDP touch moves of 35 px at 40 ms intervals and settled at full.

| Observation during the six drag moves | Base | Current |
|---|---:|---:|
| `padding-bottom` | 434 → 399 → 364 → 329 → 294 → 259 px | 434 px for every move |
| Sheet client height / scroll height | 843 / 843 px | 843 / 843 px |
| ResizeObserver callbacks on the sheet during movement | 6 | 0 |
| Settled full-detent padding | 84 px | 84 px |

Base also emitted 14 additional ResizeObserver callbacks during the snap transition; current emitted one after the detent settled. The current trace therefore keeps padding and sheet dimensions stable during movement and applies the settled inset after snapping.

A touch gesture on the Stops list scrolled it from `scrollTop=0` to 386 px on base and 381 px after. A real ArrowDown key moved the focused handle from full to partial in both runs; focus remained on the handle and `aria-expanded` stayed true. The 390 × 844 map canvas remained in place and the location control stayed at (12, 12). The full-sheet sample positioned map attribution at y = −26 px; that does not establish good attribution or route framing.

rAF p95 interval was 12.5 ms on the one base drag and 4.3 ms in both current traces. Base had a 70.8 ms maximum and two long tasks totalling 135 ms; current maxima were 25 and 41.7 ms with no long tasks. These are headless requestAnimationFrame scheduling observations, not compositor or GPU frame claims.

The app DOM did not expose the MapLibre camera instance to this harness. Route, venue, stop, and journey camera-flight centers remain unverified; physical-device touch, a software keyboard, and a real GPU also remain unverified.

## Review follow-up — 4 November 2026

The exact PR source head at the start of this follow-up was `7a3eb6b76342728bba8208da61df9ce295244634`. A regression test reproduced the review's resize/transition ordering: `resize` queued inset frame 3, then `transitionend` cleared the transient presentation inset but only canceled presentation frame 1. The test failed before the fix. The inset effect now cancels its pending resize publication on the matching Stops transform transition end, after the presentation observer clears the transient inset. The test passes with the fix and also checks that no inset frame remains queued.

The fix and regression test are in source commit `43886efe` (`fix(map): cancel stale inset frame after Stops transition`).

A local Vite server from this worktree was exercised in an isolated Incognito preview at 390 × 844 CSS pixels. The Stops handle expanded and reduced the sheet; ArrowDown collapsed it while focus stayed on the handle. The MapLibre canvas remained 390 × 844. Selecting route A1 and focusing Kent Ridge Bus Terminal left its stop marker within the map at (188, 162). Searching for Central Library and selecting Central Library Seminar Room opened venue details; the Central Library stop marker was within the map at (64, 195). These DOM observations establish that the controls and map targets were present; they do not establish complete route or journey camera framing.

The preview's Vite output reported MapLibre missing-image warnings for `office`, `swimming_pool`, and `lift_gate`, plus one `Map cannot fit within canvas with the given bounds, padding, and/or offset` warning during the camera flow. The exact action that emitted the camera warning was not isolated, so route/venue framing is not reported as fully passed. No Journey request was sent to the shared API service. Physical-device touch, a native keyboard, and Journey camera framing remain unverified. The browser page itself reported no console errors.

### Follow-up checks on `43886efe`

- `npm test`: passed — 22 shared, 1,285 frontend, 136 backend, and 105 pathfinding tests (1,548 total).
- `npm run lint`: passed — CSS selector check reported no new bare button selectors.
- `VITE_API_ORIGIN=https://api.nusgo.invalid npm run build`: passed — Vite reported the existing main-chunk size advisory.
- `git diff --check`: passed.

## Required checks

- `npm test`: passed — 22 shared, 1,263 frontend, 136 backend, and 105 pathfinding tests (1,526 total).
- `npm run lint`: passed — CSS selector check reported no new bare button selectors.
- `VITE_API_ORIGIN=https://api.nusgo.invalid npm run build`: passed — Vite reported the existing main-chunk size advisory.
- `git diff --check`: passed.
