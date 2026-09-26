# NavUS Project Status

This document records the shared implementation status and near-term engineering direction. Stable domain language belongs in the root `CONTEXT.md`; agent behavior belongs in `AGENTS.md`.

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
- Venue selection opens the venue-first contextual panel, flies to the venue, and shows a selected venue marker without a duplicate map popup.
- The contextual panel supports venue search, venue details, and a shuttle-browsing mode with Back, Close, Escape, and map-click context handling.
- Trip endpoint controls let users choose stable venue or shuttle-stop origins and destinations, swap or clear them, and show distinct endpoint markers.
- Shuttle-stop popups can assign a stop directly as a trip origin or destination.
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
- Issue #39 automated checks cover resource validation, immutable indexes, loader failure isolation, and the checked-in transit manifest. The canonical release smoke checklist is in `docs/qa/manual-smoke-check.md`; the 2026-09-21 browser pass is recorded as passed with limitations because exact release and mobile viewports were unavailable.
- Build-generated shuttle timing estimates use the canonical route geometry, are validated against the route and stop model, and are loaded through `loadShuttleTimingData`. Live stop arrivals use a cached server-side NUS adapter when configured, while static ride estimates remain the fallback. When available, route service-hour windows are checked in Singapore local time so after-hours routes are not treated as zero-wait options.
- The pure `planJourney` module composes validated walking connections with directed shuttle legs; its `zeroShuttleWaitingTime` policy is the explicit fallback when live waiting data is unavailable. Navigation-session state now publishes the selected Journey, MapSession renders its walking and shuttle geometry with replacement and disposal cleanup, and the responsive Plan trip panel shows Journey totals, ordered leg details, estimate notices, and failure states.
- Mobile widths up to 768px use persistent Explore, Stops, and Plan tabs over the shared map. Each tab retains its sheet state; Explore and Stops start compact and Plan starts expanded. A shared accessible 44 × 44px grab handle replaces the sheet expand/collapse buttons and supports tap, keyboard activation, and dragging between the existing states. Safe-area and visual-viewport sizing, independent sheet scrolling, and non-modal focus behavior support the shared workflows. The next mobile screen restyling work remains tracked in issues #118–#120.

## Current limitations

- `public/data/bus-routes.json` is the original route-name source; the app now consumes the normalized `shuttle-network.json` model.
- The checked-in model contains reviewed ordered stop IDs and bundled road-following GeoJSON route geometry; targeted release smoke evidence exists at 1280 × 720, while exact release/mobile viewports and failure injection still need manual verification.
- Accurate transit behavior depends on the checked-in network, geometry, and verification manifest remaining in sync; CI validates that integrity gate.
- The accepted Journey architecture is documented in [ADR 0002](adr/0002-nus-route-recommendation-architecture.md), with the timing policy recorded in [Shuttle timing policy](shuttle-timing.md). The Valhalla walking route-engine boundary and pure Journey planner are now connected through the navigation session; the app still needs a configured self-hosted Valhalla endpoint for usable walking results. Shuttle ride estimates, live waiting estimates, and service-window checks are implemented; live data still depends on server-side NUS credentials, and missing live timing removes shuttle options rather than creating a false zero-wait Journey.
- NUSMods is useful for venue/stop associations and bus-arrival integration, but its current NextBus client does not provide route geometry. Live-arrival reliability also needs separate verification.
- The OpenFreeMap basemap is suitable for the prototype. NUS-specific paths, entrances, covered walkways, and indoor connections may require custom GeoJSON or another licensed data source.

## Recommended milestones

Complete the remaining integration and release work before a broad UI redesign:

1. Complete the release desktop/map smoke checklist for the validated static transit resources.
2. Verify the Valhalla walking boundary and validated walking connections (#71).
3. Verify private live shuttle arrivals and the server-side deployment boundary (#23 and #102).
4. Complete regression and release evidence for the live Journey flow (#103).

The current venue search is core functionality rather than general UI polish. Defer visual redesign until the route-selection flow is established.

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
