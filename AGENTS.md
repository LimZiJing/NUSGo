# NavUS Project Context

## Project

NavUS is an experimental multimodal campus transit and indoor-navigation Progressive Web App for the National University of Singapore (NUS).

The immediate goal is a functional transit prototype: users should be able to find venues, see shuttle stops and routes, and eventually receive route recommendations.

## Stack

- React 19, TypeScript, and Vite
- MapLibre GL JS for map rendering
- Static JSON data in `public/data`
- Application code and types under `src`

Potential future tools:

- `ngraph.graph`/`ngraph.path` for a small client-side routing prototype
- GraphHopper, OSRM, or pgRouting for a future routing backend
- `@turf/turf` for spatial calculations and snapping
- `ical.js` for calendar import
- PostgreSQL/PostGIS behind a future Node.js or Go API

## Current implementation

- Detailed OpenStreetMap-based basemap using the OpenFreeMap Liberty MapLibre style.
- Map tile error reporting and MapLibre navigation controls.
- Venue data loaded from `public/data/venues.json`.
- Venue search by venue code or room name, with ranked results and a selected venue marker.
- Venue selection flies to the venue and opens its popup; all venue markers are not displayed at once.
- Shuttle-stop data is loaded from the bundled `public/data/shuttle-network.json` model.
- Shuttle stops rendered as blue markers with route and opposite-stop information in popups.
- The transit model contains 8 internal shuttle routes, 33 stops, service associations, and ordered stop IDs.
- Transit model references are validated before shuttle markers are rendered.
- Venue markers, shuttle-stop markers, and popup creation organized in `src/map/markers.ts`.
- Shared JSON loading organized in `src/map/data.ts`.
- Shared data types are under `src/types`.

## Current data limitations

- `public/data/bus-routes.json` is the original route-name source; the app now consumes the normalized `shuttle-network.json` model.
- The model's stop ordering is inherited from the source stop dataset and must be verified before production use.
- The model does not yet contain road-following route geometry.
- Accurate route display therefore requires verified route directions, ordered stops, and road-following geometries.
- NUSMods is useful for venue/stop associations and bus arrival integration, but its current NextBus client does not provide route geometry. Live arrival data may also require a separate reliability check.
- The OpenFreeMap basemap is suitable for the prototype. NUS-specific paths, entrances, covered walkways, and indoor connections may require custom GeoJSON or another licensed data source.

## Recommended next milestones

Complete the functional transit foundation before a broad UI redesign:

1. Verify the static model's route directions and ordered stops.
2. Add route shapes as GeoJSON under `public/data`.
3. Render route shapes with MapLibre GeoJSON sources and line layers.
4. Add shuttle route selection and route highlighting.
5. Add origin and destination selection.
6. Add walking connections and routing.
7. Investigate live shuttle arrivals after static routes work reliably.

The current venue search is core functionality rather than general UI polish. Defer visual redesign until the route-selection flow is established.

## Routing principles

- MapLibre renders maps; it is not a routing engine.
- Do not implement A* or another routing algorithm from scratch unless existing options cannot support the required constraints.
- Prototype custom campus or indoor graphs with `ngraph.graph` and `ngraph.path` if client-side routing is needed quickly.
- Evaluate a backend routing engine before committing to a permanent architecture.
- Model stairs, lifts, accessibility, shelter, indoor floors, and bus transfers as graph edges, costs, or routing profiles.

## Development rules

- Keep `main` stable.
- Use a separate branch for each coherent feature or larger refactor.
- Branch names created by Codex must not be prefixed with `codex/`. Use direct names such as `venue-search`, `shuttle-route-layers`, or `live-arrivals`.
- Commit coherent milestones with clear messages.
- Do not commit `node_modules`, `dist`, secrets, or local environment files.
- Do not install future dependencies until their feature is being implemented.
- Validate with `npm run lint` and `npm run build` before committing.
- Preserve existing user changes and inspect `git status` before editing.

## Recent milestone commits

```text
401e062 Add venue search and selection
2abb96b Organize map data and marker logic
d1b08d8 Use detailed OpenStreetMap basemap
1cbaf98 Render static shuttle stops
```

## Agent skills

### Issue tracker

Issues and specs live in GitHub Issues. Use the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Use `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, and `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

This is a single-context repository. See `docs/agents/domain.md`.
