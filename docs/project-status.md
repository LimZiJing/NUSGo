# NavUS Project Status

This document records the shared implementation status and near-term engineering direction. Stable domain language belongs in the root `CONTEXT.md`; agent behavior belongs in `AGENTS.md`.

## Stack

- React 19, TypeScript, and Vite
- MapLibre GL JS for map rendering
- Static JSON data in `public/data`
- Application code and types under `src`

Potential future tools include `ngraph.graph`/`ngraph.path` for a client-side routing prototype, GraphHopper/OSRM/pgRouting for a routing backend, `@turf/turf` for spatial calculations, `ical.js` for calendar import, and PostgreSQL/PostGIS behind a future API.

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
- Venue markers, shuttle-stop markers, and popup creation are organized in `src/infrastructure/map/markers.ts`.
- Shared JSON loading is organized in `src/infrastructure/data/`.
- Shared data types are under `src/domain`.
- Manual smoke check (2026-09-18, pre-refactor baseline): desktop venue search, query preservation, venue details without a popup, shuttle mode, route selection, Back, Escape, empty-map click, and panel close with route emphasis were verified against the local development build. Repeat desktop, narrow-screen, and keyboard verification after the external mobile/accessibility work in issue #30.

## Current limitations

- `public/data/bus-routes.json` is the original route-name source; the app now consumes the normalized `shuttle-network.json` model.
- The model's stop ordering is inherited from the source stop dataset and must be verified before production use.
- The model does not yet contain road-following route geometry.
- Accurate route display requires verified route directions, ordered stops, and road-following geometries.
- NUSMods is useful for venue/stop associations and bus-arrival integration, but its current NextBus client does not provide route geometry. Live-arrival reliability also needs separate verification.
- The OpenFreeMap basemap is suitable for the prototype. NUS-specific paths, entrances, covered walkways, and indoor connections may require custom GeoJSON or another licensed data source.

## Recommended milestones

Complete the functional transit foundation before a broad UI redesign:

1. Verify the static model's route directions and ordered stops.
2. Add route shapes as GeoJSON under `public/data`.
3. Render route shapes with MapLibre GeoJSON sources and line layers.
4. Add shuttle route selection and route highlighting.
5. Add origin and destination selection (implemented; routing remains out of scope).
6. Add walking connections and routing.
7. Investigate live shuttle arrivals after static routes work reliably.

The current venue search is core functionality rather than general UI polish. Defer visual redesign until the route-selection flow is established.

## Recent milestone commits

```text
401e062 Add venue search and selection
2abb96b Organize map data and marker logic
d1b08d8 Use detailed OpenStreetMap basemap
1cbaf98 Render static shuttle stops
```
