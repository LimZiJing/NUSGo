# NavUS Project Status

This document records the shared implementation status and near-term engineering direction. Stable domain and product vocabulary belongs in the root `CONTEXT.md`; agent behavior belongs in `AGENTS.md`.

## Stack

- React 19, TypeScript, and Vite
- MapLibre GL JS for map rendering
- Static JSON data in `public/data`
- Application code and types under `src`

The accepted route architecture uses a self-hosted Valhalla pedestrian service behind a server-side boundary and a pure planner that composes walking connections with the canonical shuttle network. OSRM and other routing engines remain replaceable alternatives behind that boundary. Other potential future tools include `ngraph.graph`/`ngraph.path` for a client-side routing prototype, `@turf/turf` for spatial calculations, `ical.js` for calendar import, and PostgreSQL/PostGIS behind a future API.

## Current implementation

- Detailed OpenStreetMap-based basemap using the OpenFreeMap Liberty MapLibre style, with bus POI labels suppressed and low-priority local POIs reduced while rail, airport, and major campus context remain visible.
- Map tile error reporting and MapLibre navigation controls.
- Venue data loaded from `public/data/venues.json`.
- Venue search by venue code or room name, with ranked results and a selected venue marker.
- Find venue and trip endpoint searches use the reusable `src/ui/search-field.tsx` control, which overlays a decorative search icon at the left of each input while retaining each workflow's own labels and clear actions.
- Venue selection opens the venue-first contextual panel, flies to the venue, and shows a selected venue marker without a duplicate map popup.
- The shared desktop and mobile venue-details panel uses the venue code as its heading, followed by the room name and confirmed floor/building metadata, a Navigate action, a NUSMods link, and up to three nearby validated NUS shuttle stops within 500 m. Coordinates remain internal for navigation and nearby-stop lookup but are not shown in the panel. Stop rows use canonical route colors and open the existing stop popup while preserving the venue-details return path. Navigate sets or replaces the trip destination while preserving its origin, and opens the partial Plan sheet on mobile. Mobile shuttle browsing uses canonical route chips and a single ordered-stop timeline; the Explore return control clears the active map route while retaining the chosen route for reopening.
- Enabled non-selected buttons and the NUSMods action darken by 15% on hover. Selected shuttle route chips and the current mobile tab keep their active appearance; unselected route chips darken on hover.
- Trip endpoint controls let users choose stable venue or shuttle-stop origins and destinations, swap or clear them, and show distinct endpoint markers.
- Shuttle-stop popups can assign a stop directly as a trip origin or destination.
- In the mobile Stops tab, selecting a stop opens its detail sheet and focuses a neutral map pin above the sheet without a popup. Entering Stops also closes an Explore stop popup. The pin sits above the still-visible stop marker and uses the same zoom as venue selection. It remains selected after Back, is shown only in Stops, and returns without moving the camera after a tab switch; Explore retains its stop popups.
- The mobile Stops overview shows a map-centred 1.5 km Nearby list and a browser-saved Favourites list. Nearby requests device location on entry and always orders stops from nearest to farthest from the visible map centre. Distance badges show device distance only when a fix is available. The partial Stops sheet fills its 40%-combined viewport allowance even when few stops are listed. Its grab handle, selector, and location notice stay above the independently scrolling card list; focused-stop details scroll below the fixed handle. Cards start expanded; tapping a title bar animates its timing rows open or closed, while tapping its star changes its favourite state. The card animation respects reduced-motion settings and keeps closed route controls out of keyboard focus. Multiple reusable cards retain their expansion state across tab changes; both card and focused-sheet stars edit the same favourites. Map markers open the focused stop sheet. The cards currently show fixed bus timings with a visual LIVE badge and green dot only while expanded; the arrival feed remains unconnected to this view.
- Stops bus-route rows show up to three downstream favourited stop nicknames for each internal route, using the route's ordered stop list and preserving the placeholder arrival timings. The matching is forward-only, uses stable stop IDs, excludes transfers and the selected stop, and does not wrap a route's closing terminal back to its first stop.
- Shuttle-stop data loaded from the bundled `public/data/shuttle-network.json` model.
- Shuttle stops rendered as neutral transit-ring markers with collision-aware short-name labels from zoom 14 onward; selected-route content remains full opacity, while inactive stops and labels fade to 20% from zoom 14 onward, and open-stop content remains visible below that threshold.
- Venue markers use neutral map pins.
- Validated route lines are neutral and subdued in the all-routes state, with official route colors reserved for the selected route.
- The transit model contains 8 internal shuttle routes, 33 stops, service associations, and ordered stop IDs.
- Transit model references are validated before shuttle markers are rendered.
- MapLibre lifecycle, basemap presentation, transit layers, venue markers, shuttle-stop markers/popups, and trip endpoint markers are composed from focused adapters under `src/infrastructure/map/`; the application consumes the framework-free MapSession contract under `src/app/contracts/`.
- `src/app/navigation-session.ts` now owns application state and commands for loaded venue/transit data, contextual-panel history, route selection, trip endpoints, resource status, startup/map errors, and map coordination; endpoint search queries remain local to the trip-endpoint feature seam, and `src/app/app.tsx` is reduced to composition and the React external-store adapter.
- JSON fetching and validated resource loaders are organized in `src/infrastructure/data/`.
- The transit loader returns one immutable canonical network through `index.network`; network and route geometry fetches start in parallel and are validated deterministically.
- Pure transit, venue, location, trip, and contextual-panel models are owned by `src/domain/`.
- Local browser location tracking starts from a one-tap target control and focuses the map on the first available fix. The map shows a distinct blue target marker. Valid browser fixes are accepted regardless of reported accuracy, and location fixes stay in browser memory rather than being sent to NavUS services.
- Mobile location uses one accessible target button at the top-left safe area, stays above the mobile sheets, and is hidden while Plan is full-screen. It keeps the location-control action, focusing the latest active fix or the first fix received after permission. When no active fix is available, it centers on Kent Ridge MRT at zoom 15 before requesting or retrying location. Location updates never move the camera on their own.
- Issue #39 automated checks cover resource validation, immutable indexes, loader failure isolation, and the checked-in transit manifest. The canonical release smoke checklist is in `docs/qa/manual-smoke-check.md`; the 2026-09-21 browser pass is recorded as passed with limitations because exact release and mobile viewports were unavailable.
- Build-generated shuttle timing estimates use the canonical route geometry, are validated against the route and stop model, and are loaded through `loadShuttleTimingData`. Live stop arrivals use a cached server-side NUS adapter when configured, while static ride estimates remain the fallback. When available, route service-hour windows are checked in Singapore local time so after-hours routes are not treated as zero-wait options.
- The pure `planJourney` module composes validated walking connections with directed shuttle legs; its `zeroShuttleWaitingTime` policy is the explicit fallback when live waiting data is unavailable. Navigation-session state now publishes the selected Journey, MapSession renders its walking and shuttle geometry with replacement and disposal cleanup, and shuttle stops are highlighted only from each shuttle leg’s boarding stop through its alighting stop in the Route’s official color. Shared transfer stops show the colors of each Route used there, and marker labels name those Routes. The responsive Plan trip panel shows Journey totals, ordered leg details, estimate notices, and failure states.
- Walking planning now loads a validated directed graph for the 33 canonical shuttle stops, then runs origin-to-network and network-to-destination matrix queries in parallel. The planner still accepts arbitrary trip endpoints, and selected walking legs are enriched with individual Valhalla route geometry.
- The Journey planner preserves time-dependent labels with different arrival times, removes only labels dominated at the same timing context, and rejects repeated planning states within a path so walking cycles cannot prevent termination. Separate complete alternatives remain eligible when an earlier candidate has unavailable shuttle timing.
- Mobile widths up to 768px use persistent Explore, Stops, and Plan tabs over the shared map. Stops opens first; each tab starts at a 40% partial sheet and remembers its own detent. Sheets support collapsed, partial, and full-screen states through an accessible grab handle with tap, keyboard activation, and nearest-stop dragging; tab buttons are at least 36px high. Partial sheet plus bottom navigation stays within 40% of the visible viewport, with a 200px sheet floor when room allows; full-screen sheets cover the navigation. Search focus opens full-screen and search results return to partial; cancellation or Escape restores the previous detent unless manually changed. Safe-area and visual-viewport sizing, independent sheet scrolling, reduced-motion handling, and non-modal focus behavior support the shared workflows. In Explore's shuttle view, the segmented selector and shuttle route chips stay fixed while only the ordered stop list scrolls. Shuttle routes presents chips and an ordered-stop timeline in one sheet. Mobile venue details use a ghost return button whose label follows the previous view; the button remains reusable for future flows. Issues #119–#120 are complete prerequisites for the remaining mobile polish.
- Native scroll areas share a reusable `ScrollArea` UI primitive and an app-wide thin, rounded, arrowless scrollbar style, with colors that adapt to light and dark themes. Vertical and horizontal scroll regions retain their local sizing and overflow bounds.
- Grab-bar taps and mobile tab or Explore view switches animate between their measured sheet heights; view switches also fade in the incoming content. Drag release keeps its existing settling behavior, and reduced-motion settings disable the added animation.

## Current limitations

- `public/data/bus-routes.json` is the original route-name source; the app now consumes the normalized `shuttle-network.json` model.
- The checked-in model contains reviewed ordered stop IDs and bundled road-following GeoJSON route geometry; targeted release smoke evidence exists at 1280 × 720, while exact release/mobile viewports and failure injection still need manual verification.
- Accurate transit behavior depends on the checked-in network, geometry, and verification manifest remaining in sync; CI validates that integrity gate.
- The accepted Journey architecture is documented in [ADR 0002](adr/0002-nus-route-recommendation-architecture.md), with the timing policy recorded in [Shuttle timing policy](shuttle-timing.md). The Valhalla walking route-engine boundary and pure Journey planner are now connected through the navigation session; the app still needs a configured self-hosted Valhalla endpoint for usable walking results. The checked-in walking stop graph must be regenerated when the canonical stop model, walking profile, or routing data changes. Shuttle ride estimates, live waiting estimates, service-window checks, and the live-data failure distinction are implemented; live data still depends on server-side NUS credentials, and a valid no-bus response removes shuttle options while provider failures surface as planning errors.
- NUSMods is useful for venue/stop associations and bus-arrival integration, but its current NextBus client does not provide route geometry. Live-arrival reliability also needs separate verification.
- The OpenFreeMap basemap is suitable for the prototype. NUS-specific paths, entrances, covered walkways, and indoor connections may require custom GeoJSON or another licensed data source.
- Location tracking depends on browser permission and device accuracy. It does not replace chosen trip endpoints, replan journeys, or continue after the app closes.

## Recommended milestones

Complete the remaining integration and release work before a broad UI redesign:

1. Complete the release desktop/map smoke checklist for the validated static transit resources.
2. Verify the Valhalla walking boundary and optimized walking connections (#71 and #175).
3. Verify private live shuttle arrivals and the server-side deployment boundary (#23 and #102).
4. Complete regression and release evidence for the live Journey flow (#103).

The mobile Explore route-selection flow now uses route chips and an ordered-stop timeline. Continue remaining mobile screen work from #119–#120 after the functional transit foundation.

## Recent milestone commits

```text
36ba317 feat(journey): rank all live shuttle candidates
02f10ae feat(api): batch live shuttle stop requests
cb80edb fix(api): enforce live shuttle contract
401e062 Add venue search and selection
2abb96b Organize map data and marker logic
d1b08d8 Use detailed OpenStreetMap basemap
1cbaf98 Render static shuttle stops
```
