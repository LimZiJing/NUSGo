# NUSGo browser verification evidence log

This is a dated record of past browser passes, not a standing checklist. The reusable checklist is [manual-smoke-check.md](manual-smoke-check.md).

## Personal Waypoint delete focus (#572, PR #637) — 2026-11-09

Pre-integration application base `ed812995f966d3fbd83f37ba9d82a685e66b515b` with the local patch subsequently committed as `5eb8e9866fc828890efa338392816500ea0850d1`, local Vite development server at `http://localhost:32212/`, headless Microsoft Edge `Edg/157.0.4341.42` driven over the DevTools protocol. Each viewport ran in a fresh browser profile with `innerWidth`/`innerHeight` confirmed as 1280 × 800 and 390 × 844 at DPR 1, and with two temporary Personal Waypoints seeded in isolated storage. This pass replaces the earlier "no browser run" note on this PR. It predates integration of main `9dc33ad0`; the navigation evidence is stale for the integrated branch, which uses the shared Back button. Screen-reader speech was not tested.

- Cancelling the confirmation named the place (`Delete "Quiet bench"? This cannot be undone.`), kept both saved records, left Details open and kept focus on the Delete waypoint button that invoked it, at both sizes.
- Confirming from Details deleted only that record. On desktop, where Details was opened from a map marker while My waypoints was the underlying page, the panel returned to the list with "Place removed." and focus on the surviving row `Show Tea room, Rest spot on map`. On mobile the list fills the sheet, so Details was opened from the list row's show-on-map action and then More was closed; confirming returned to the More menu at its partial detent with focus on Close More, and the mounted live region contained the status message. This verifies DOM state, not spoken output.
- Deleting the last desktop waypoint focused the empty-state heading `No saved waypoints yet. Add a waypoint to start your list.` with zero records left in storage.
- The status region was mounted as `role="status" aria-live="polite"` with `data-empty="true"` before any message existed, and the same element carried the text afterwards — that is the change this pass verifies, since a region created together with its text is not reliably announced.
- Keyboard: from the Details header, Tab reached Directions, Edit waypoint and Delete waypoint in that order, and Enter on Delete opened the same prompt; cancelling left focus on Delete.
- Deleting a Details opened from a map marker while Settings was the active More page returned to Settings with focus on Back to previous view, not on the document body.
- At 390 × 844 the list's Edit list Remove action also prompted, and cancelling kept the row and focus on that Remove button.
- Both runners finished with zero page errors. The Express backend was not exercised for live arrivals, and physical-device gestures were not repeated. The harness itself is not committed.

`CONTEXT.md` reviewed; no update needed.

## Animation performance baseline — 2026-11-02 (#558)

Application revision `29d9a884`; local production rehearsal and a separate diagnostic React profiling build, headless Edge 156 on Windows build 26100. Core runs used fresh browser profiles at 1440 × 900 and 390 × 844, DPR 1, with controlled API/location fixtures, one synthetic 1000-coordinate walking Path and an empty basemap. Three repetitions covered idle, tab changes, venue typing, zoom and refresh/cache/location overlap; mobile also covered sheet detents. Reproduction, measurements, constraints and follow-up coverage are in [the performance baseline](performance-baseline.md).

The shared preview delivered no animation frames despite reporting a visible document, so timing used a local Edge fallback. Longer-run and reused-browser samples sometimes became frame constrained and are excluded from smoothness conclusions. These runs do not verify physical mobile performance, real vector-tile GPU cost, software keyboards, native input latency, warm startup or leak freedom. Production application behaviour was not changed.

## Surface layering baseline (#629) — 2026-11-06

Application revision `8d0e242d`, local Vite development server at `http://127.0.0.1:22188/`, headless Chromium 1254 driven by Playwright at 1440 × 900, DPR 1, `prefers-reduced-motion: reduce`. Baseline capture only; no application behaviour changed.

- Captured Explore, Stops, Plan, More and the `.map-shell` element in light, dark, nus, matcha and sakura — 25 JPEGs, 5.7 MB, under `docs/qa/screenshots/issue-629-baseline/`.
- Each theme used a fresh context with `navus:theme-preference:v1` seeded before navigation, so the real `data-theme` mechanism applied; the applied attribute was asserted before every screenshot and matched all 25 times. Zero page errors. The backend was running, so Stops showed live arrival rows.
- Measured from the theme files: light `raised/surface` is 1.00 (both `#fff`); dark is 1.10. Matcha and sakura have `card/surface` below `raised/surface`, so those two layers sit on opposite sides of the page surface. Dark `--border-subtle` is the weakest at 1.06 against the card, the same token #623 reports.
- Token values, proposal arithmetic and scope limits are in [the surface layering baseline](surface-layering-baseline-629.md). Mobile viewports, rendered-pixel sampling and control state surfaces were not verified.

### After pass — 2026-11-06

Same harness, viewport and themes, captured on commit `d1629e66` (the last commit touching CSS) into `docs/qa/screenshots/issue-629-after/` (25 JPEGs plus `measurements.json`). The set was re-captured twice, each time because a fix landed after the previous capture. The applied `data-theme` matched the requested theme on every capture and there were zero page errors. The harness itself is not committed; see "Reproducing" in the baseline doc for what it did.

- Light now paints a recessed page: `--surface` `#fff` → `#f1f5f9`, with `--surface-card` moving to `#fff`. The page and card colours swapped, so cards sit above the page at 1.10 instead of flush at 1.00.
- Before the change, overriding `--surface` to `#ff0000` changed 0.00% of pixels across all four views at 1440 × 900 and 390 × 844; the same override on `--surface-card` changed 14.22%. The column, mobile sheet and tab-bar backdrop were repointed from `--surface-raised` to `--surface`, which is what makes the token visible at all.
- Regressions found and fixed during the pass: light `--surface-subtle` and `--surface-segmented-control` both matched or nearly matched the new page, and nus/matcha/sakura cards sat 1.03/1.01/1.03 against the new column. Five waypoint-list controls (seven declarations) also lost their fill against the repointed panel and moved to `--surface-card`. Dark `--control-border` fell to 2.35:1 against the lightened card, so its mix moved from 35% to 45%. See the baseline doc for the new values.
- Mobile surfaces were read from computed styles at 390 × 844, not captured. Hover, pressed, focus and selected surfaces remain unverified here; they belong to #617.

## Waypoint details Directions (#581, PR #598) — 2026-11-05

Headless Microsoft Edge 156.0.4314.58, driven by Playwright against the local Vite development server at `http://127.0.0.1:4598/`, checked at 1280 × 800 and 390 × 844 after merging `origin/main` (`debcc6c2`) into the PR branch. Repeated all checks successfully after integrating dependency head `806387d3`:

- Seeded two temporary Personal Waypoints in isolated browser storage, used Show on map, closed My waypoints and clicked the actual persistent map marker. Details opened with the correct name, category, note and coordinates at both sizes.
- Confirmed Directions was the only filled details action. Edit and Delete used quiet text buttons; Delete was danger-coloured. Coordinates rendered at 12px in secondary text. Neither viewport had horizontal overflow.
- Checked keyboard order from Directions through Edit waypoint and Delete waypoint. Pressing Enter on Directions closed details, selected Plan, set the correct destination and moved focus into Plan.
- Reopened details from the same marker with Plan still active and repeated keyboard Directions. Focus returned into Plan again. A different waypoint marker then opened its own details. On mobile, Escape collapsed the Plan sheet to expose the markers while retaining Plan as the active tab.
- Edited the second waypoint and saved its new name. Cancelling Delete preserved both saved records; confirming Delete removed only that waypoint and kept the first one.
- Both viewport runs completed without page errors. The basemap and persistent markers rendered. This targeted check covers waypoint navigation and local storage; it does not verify live arrivals, device geolocation or backend Journey calculation.

`CONTEXT.md` reviewed; no update needed.

## My waypoints review verification — 2026-11-05

PR #597, application head `ed0e804af8e266863fe8015860467d9ff01b582f`, local Vite development server, headless Chromium 131.0.6778.33 with Playwright. Each viewport used a fresh isolated browser context with three temporary waypoints in two categories; `innerWidth` and `innerHeight` confirmed the actual page sizes.

- At both 390 × 844 and 1280 × 800, opened More → My waypoints → Waypoint list options. With focus on the trigger, Escape closed only the options menu, restored trigger focus, and kept My waypoints open. Repeated with keyboard Tab moving focus to Edit list before Escape; the same assertions passed.
- The mobile sheet stayed at its `full` detent for both focus targets. The desktop panel retained its `partial` detent. These results replace the earlier incomplete mobile Escape verification recorded in the PR discussion.
- At both sizes, selecting a place row kept the waypoint list open. Directions closed More and opened Plan with the selected waypoint as its destination.
- Repeated Directions after opening My waypoints while Plan was already active. Focus returned to a control inside Plan: the Plan panel handle on mobile and Choose origin on desktop.
- No page-level JavaScript errors occurred. The Express backend was not started; live arrivals and route calculation were outside this check. Physical-device gestures and the broader release checklist were not repeated.
- CONTEXT.md reviewed; no update needed.

## Personal Waypoint conflict workflow — 2026-10-28

Codex In-app Browser (Chromium-based; exact version unavailable), local Vite development server at `http://127.0.0.1:4175/`, 1280 × 720:

- Opened More → My waypoints, added a temporary test waypoint, and confirmed the saved row and map marker appeared.
- Opened details from the list and confirmed the name, category, note, and location. Started an edit in one tab, changed the saved note in a second tab, and returned to the first tab.
- Saving the first draft showed the latest saved version, kept the unsaved name, and left the second tab's note intact. The explicit “Replace saved version” action then saved the draft.
- Deleted the temporary test waypoint; the list returned to its empty state.
- The Express backend was not started, so `/api/health` and live-timing proxy requests returned 502. The browser-profile waypoint flow remained usable; the map rendered static data and its markers.
- Mobile layout was not verified. The browser viewport override left the page at 1280 × 720 (`innerWidth`/`innerHeight`); no other browser surface was available for device-size emulation.
- This pass did not verify active stop/route selection or map-camera preservation. Automated coverage verifies marker updates do not trigger camera fitting and that marker-opened details restore the previous More page and sheet detent.

## Release record

- Date: 2026-09-21
- Browser and version: Codex In-app Browser, Chromium-based; exact version unavailable from the automation session
- URL or build: `http://127.0.0.1:4173/NUSGo/`, production preview from `npm run build` and `vite preview`
- Build commit: `ffe891f` (production preview)
- Tester: Codex
- Result: passed with limitations

## Release targeted verification — 2026-09-21

The Codex In-app Browser session provided a 1280 × 720 viewport. Earlier Edge headless/device-emulation evidence at the release and mobile sizes is recorded in [responsive layout browser evidence](responsive-layout-browser-evidence.md), but it does not replace a full manual release pass. This session did not provide viewport overrides or a real Chrome/Edge window, so the checklist remains unchecked where those conditions matter.

- The basemap, route lines, attribution, venue layer, and bus-stop markers rendered. The application reported 719 venues, 33 bus stops, and 8 bus routes loaded.
- The existing OpenFreeMap glyph and sprite limitations remain relevant; the map still rendered with attribution and usable application controls.
- Venue search for `COM1-0210` returned a result. Keyboard focus moved from the search field through the clear control to the result; Enter opened venue details and focused the venue heading.
- Venue details showed the selected map marker without a duplicate popup. Back returned to search, Escape closed the map context, Close returned focus to Find a venue, and an empty-map click dismissed venue details.
- bus route browsing opened with the route select focused. A1, A2, D1, D2, R1, R2, K, and P each displayed route-specific directions and ordered stop lists; Show all routes restored all 8 routes and 33 stops. Escape closed bus route browsing.
- Bus-stop popups displayed stop services and Set as origin, Set as destination, and Close popup controls. Direct origin and destination assignment from two popups worked, and Clear both endpoints removed them.
- Trip endpoint search set origin `COM1-0210` and destination `LT13-OPP` (Ventus). Swap exchanged the endpoints and Clear both endpoints removed both markers and selections.
- Automated and repository checks: `npm test` (31 files, 212 tests), `npm run lint`, `npm run build`, and `git diff --check` passed.
- Not verified in this session: exact 1440 × 900 desktop, 390 × 844 mobile, 768/769px resize behavior, safe-area spacing, mobile map-controls focus flow, and injected resource failures. Real Chrome/Edge and a physical software keyboard were also not available.

## Device location control verification — 2026-09-27

Codex In-app Browser, local Vite development server:

- The Location control rendered as a compact accessible “Show my location” target button on the map.
- The live permission prompt and marker movement were not exercised because accepting a real browser location permission prompt was outside this smoke pass.
- Automated tests cover the one-tap locate action, quiet searching indicator, first-fix map focus, marker updates and disposal, and browser error handling.

## Mobile location control verification — 2026-09-28

Isolated headless Chrome, local Vite server, 390 × 844 mobile viewport:

- The accessible Recenter map button measured 44 × 44px at (12, 12), with z-index 13 above the mobile sheets.
- Pointer and Enter activation moved the Kent Ridge MRT stop marker to the measured exposed-map centre (y=173px with a 498px bottom inset).
- The button disappeared when Plan was expanded and returned after switching to Stops.
- At 1280 × 720, the recenter button was absent and the native MapLibre navigation controls remained visible.
- The browser pass supplied a runtime-generated bus timing payload in memory because `npm run build` is blocked by this environment's Node `ERR_NO_TYPESCRIPT` prebuild failure. OpenFreeMap glyph 404 warnings were visible; they did not prevent the map and controls from rendering.

## Active device location recenter verification — 2026-09-28

Isolated headless Chrome, local Vite server, 390 × 844 mobile viewport with CDP geolocation simulation:

- With geolocation denied, Recenter placed the Kent Ridge MRT stop at the exposed map center (195, 173px) using the measured 498px bottom inset.
- After granting a device fix, the first location was shown. A later simulated fix moved the marker to (2059, 2083px) while the camera stayed put; activating Recenter then placed that marker at the exposed center (195, 173px).
- The location marker remained visible in this browser flow; the focused session test separately verifies recentering while marker visibility is false.
- The browser pass generated the bus timing payload in memory because the host Node.js prebuild fails with `ERR_NO_TYPESCRIPT`. OpenFreeMap sprite and glyph 404 warnings remained visible, but the map rendered and the recenter behavior passed.

## Mobile tab navigation: initial browser check — 2026-09-28

These measurements describe the initial implementation before the follow-up refinement.

Codex Chrome DevTools, local Vite app, mobile/touch emulation:

- At 390 × 844, the centered white pill matched the supplied reference. It measured 366 × 112px with 12px side insets and a 16px bottom gap; the three controls had equal 116px × 96px targets, visible labels, and a restrained active-state color change.
- The Map navigation tabs exposed Explore, Stops, and Plan. Tab switching restored the collapsed Explore sheet and expanded Stops/Plan sheets. The Kent Ridge MRT marker stayed at (189, 344) across the switches.
- Pressing Tab moved focus to Plan and showed the 3px visible focus outline while Stops remained the selected view.
- At 390 × 500, used as a software-keyboard viewport approximation, the pill stayed 16px above the viewport bottom and the Plan origin field remained visible above it. The browser reported a 0px safe-area inset, so the 16px CSS fallback was exercised; a physical safe-area device and real software keyboard were unavailable.
- At 769px, the mobile bar was hidden and the desktop Explore panel remained visible.

## Mobile tab navigation refinement — 2026-09-29

Codex Chrome DevTools, local Vite app, mobile/touch emulation:

- At 390 × 844, the pill measured 358 × 56px at x=16px and y=772px. Its three buttons measured 114 × 44px, with 20px icons, 12px labels, and a 16px bottom gap.
- A full-width 72px solid-white band began at the pill’s top edge and continued to the viewport bottom. It used `pointer-events: none`; the active sheet ended at the band’s top edge in expanded and compact states in Explore, Stops, and Plan.
- At 390 × 500, expanded and compact states were checked in all three tabs. Stops and Plan scroll areas reached their last controls above the pill.
- Before the later handle-row revert, the compact Stops handle measured y=372–416px while the pill began at y=428px. The handle geometry was not remeasured after that revert.
- Stable map insets matched the active sheet height plus the 72px navigation reservation and existing 12px margin. The map remained visible above the active sheet and did not show through the bottom band.
- Keyboard Tab moved focus from Explore to Stops and displayed the 3px focus outline with a 2px offset. Enter activated the focused tab. Collapsing each sheet, switching away, and returning retained each tab’s compact state.
- At 769px, the mobile bar and band were hidden, the desktop Explore panel remained visible, and the map bottom inset was 0px.
- The browser reported a 0px safe-area inset, so the 16px CSS fallback was exercised. The 390 × 500 viewport approximated reduced space but did not open a real software keyboard; a physical safe-area device was unavailable.

## Mobile sheet behavior verification — 2026-09-25

This recorded pass predates the shared grab handle and documents the previous mobile controls.

Codex In-App Browser (Chromium-based), local Vite app, mobile/touch emulation:

- At 390 × 844, the shared map and persistent Explore / Stops / Plan tabs rendered. Explore and Stops started compact, Plan started expanded, and switching away from an expanded Stops sheet restored it when returning.
- Stops and Plan sheets expanded/collapsed using visible controls. With a stop popup open over a compact Stops sheet, Escape closed the popup and left the sheet compact; with the sheet expanded, Escape closed the popup first and a second Escape compacted the sheet. In Plan, Escape first cleared endpoint search results. Explore root Escape compacted the sheet and restored focus to Show Explore panel.
- At 390 × 844, the Plan content scrolled independently to Clear both endpoints. A DOM hit test inside the sheet resolved to the sheet, while an uncovered point resolved to the map.
- With origin COM1-0201 and destination KR-MRT selected in Plan, switching to Stops and back retained both endpoints. The Kent Ridge stop marker stayed at the same screen position (189, 344) across the tab switch, providing a direct camera-preservation check.
- At widths 768px and 769px, the mobile tab bar changed from visible to hidden at the breakpoint. At 568 × 320 landscape, the Plan panel remained above the tab bar, its body scrolled independently to expose the origin input, and the document had no overflow.
- At 390 × 500, the tab bar stayed at the viewport bottom and the Plan origin search input remained visible above it. This viewport shrink approximated keyboard space; no real software keyboard or physical safe-area device was available.
- The broader map/responsive checklist was not repeated.

## Mobile sheet grab-handle targeted verification — 2026-09-26

Local Chromium, Vite app from the feature branch:

- At 390 × 844, Explore and Stops started compact and Plan started expanded. Each handle measured 44 × 44px, each sheet toggled, and switching tabs restored the independent Explore, Stops, and Plan states.
- Explore expanded by touch and snapped between compact and expanded when dragged up and down. Stops and Plan handles also toggled by touch in dedicated browser passes. Plan kept Swap visible; its body scrolled independently (290px viewport, 444px content) without being clipped by the sheet, and an uncovered map point remained hit-testable.
- At 768px, mobile tabs and handles remained visible. At 769px, mobile tabs and handles were hidden and the desktop Explore panel returned to static positioning.
- The component tests cover Enter and Space activation, cancelled drag restoration, and ignoring pointer gestures that start in sheet content.

## Mobile sheet elastic overdrag targeted verification — 2026-09-26

Local headless Chrome, Vite app from the feature branch:

- At 390 × 844, Explore, Stops, and Plan each followed upward and downward handle drags about 30.6px beyond their allowed stops, then returned to the correct stop. All three sheets stayed above the tab bar.
- Tab switching preserved each sheet's state, the map canvas loaded and responded to a click, and the mobile tab bar stayed visible at 768px. At 769px, mobile tabs and handles were hidden.
- Automated tests cover both 32px caps, normal snapping after returning inside the range, cancelled drags, and reduced-motion behavior. `npm test` passed (49 files, 315 tests); `npm run lint` passed. `npm run build --ignore-scripts` passed TypeScript and Vite production builds. Standard `npm run build` is blocked in its prebuild timing-data script by Node 22.22.1 reporting `ERR_NO_TYPESCRIPT` for `--experimental-strip-types`.

## Explore route browsing verification — 2026-09-26

Codex In-App Browser (Chromium-based; exact version unavailable), local Vite development server, 390 × 844:

- Explore venue search for `COM2` returned `COM2-0108 Tutorial Room 9`; selecting it opened details with the room name and floor.
- bus route cards showed the eight canonical routes and their colors. D2 details showed all 16 ordered stop calls; scrolling to the end exposed the terminal return to `COM3` after `TCOMS`.
- Back restored focus to the selected D2 card. Close returned to Explore, and reopening route browsing kept D2 selected. Show all routes cleared the selection.
- This covers the Explore route browsing changes only; the broader map/responsive checklist was not repeated.

## Mobile Explore Routes timeline targeted verification — 2026-09-26

Codex browser, local Vite app, 390 × 844 mobile/touch emulation:

- Venue search for `COM2-0108` returned Tutorial Room 9; selecting it opened the existing room and floor details.
- Browse bus routes opened the single Routes sheet with A1 selected and focused. Eight chips appeared in canonical order; selecting R2 scrolled its chip into view. Selecting D2 showed 16 stop calls, and scrolling the sheet exposed the final `COM3` after `TCOMS`.
- Tapping the final `COM3` row opened its existing popup. Its bottom edge was 41 px above the sheet after the stop camera adjustment. Escape closed the popup and restored focus to that row.
- “← Explore” returned to the root, focused the Browse bus routes opener, and reopening restored D2. Switching to Plan and back also restored D2. At 1280 × 720, desktop still used the route selector.
- The broader map/responsive checklist was not repeated.

## Map and Journey marker verification — 2026-09-26

Google Chrome 154.0.8037.57 headless with CDP, local Vite app at `http://127.0.0.1:4174/`, and the local Valhalla service at `127.0.0.1:8002`:

- Selecting route A1 left its 12 route stops at computed opacity `1` and dimmed all 21 unrelated marker circles to `0.2`.
- Setting origin KV and destination PGP produced a K bus Journey from KV through PGPR, followed by a walk to PGP. Stops outside the bus segment computed to `0.2`; Journey stops remained at `1`.
- Clearing the Journey restored all markers to opacity `1`. Selecting and clearing A1 also restored all markers to opacity `1`.
- Browser Fetch interception supplied deterministic local arrival and service-window data. No live NUS API was contacted.

## Earlier browser evidence

The [responsive layout browser evidence](responsive-layout-browser-evidence.md) preserves earlier headless and device-emulation results. It is historical evidence, not a standing checklist. Record only the targeted checks or release result that applies to each change.
