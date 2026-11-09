# Data and map

What data the app ships with and how the map is built. For a one-page summary see [project status](project-status.md). The Express side (live arrivals, snapshots, configuration) is in [Express live transit data](backend-live-data.md).

## Venues

- `frontend/public/data/venues.json` holds 729 venues, searchable by venue code or room name.

## Buildings

- `frontend/public/data/buildings.json` holds 251 NUS Digital Twin buildings from a one-off import (snapshot of 13/10/2026). The frontend loader (`loadBuildingCatalogue`) and backend startup both validate it.
- Buildings are separate from `venues.json`. A room links to its building through the building's `roomCodePrefixes`, and rooms that match no building still work as venues. Some venues are whole buildings, such as LT17, and show only as the building.
- Locations are API centroids, except 29 buildings that use an accepted but unverified OpenStreetMap entrance (`locationKind: "provisional-entrance"`). No entrance is verified yet. The entrance review in #260 is open.
- Buildings that belong to one complex are grouped into a single search entry with block labels (#399). A group sits at the part nearest the centre of all its parts, and Navigate resolves to that part.
- A building opens a details panel with its address, room count and nearby stops. Plan endpoints, markers and the map camera all accept a building or a group.
- How to re-run the import, the overrides and the credit are in [the Digital Twin research notes](research/nus-digital-twin/README.md).

## Bus network

- `frontend/public/data/shuttle-network.json` has 8 internal routes, 33 stops, service associations and ordered stop IDs. Route geometry is bundled road-following GeoJSON.
- The transit loader returns one immutable canonical network through `index.network`. Network and geometry fetches start in parallel and are validated deterministically, and references are validated before any marker renders.
- `frontend/public/data/bus-routes.json` is the original route-name source. The app now uses the normalised network model.
- A checked-in verification manifest ties the network and geometry together. CI checks that they stay in sync.
- Timing estimates are generated at build time. See [shuttle timing](shuttle-timing.md).

## Community Waypoints

- `frontend/public/data/community-waypoints.geojson` is the public source for reviewed Community Waypoints. It is an empty FeatureCollection until locations have been reviewed and approved; submissions, Personal Waypoints, the private review queue, and test fixtures are not published from this file.
- The browser loader is `loadCommunityWaypoints` under `frontend/src/infrastructure/data/`. It fetches the public file through the base-path-aware JSON client and validates the whole response with the shared parser. Fetch and validation failures reject instead of appearing as an empty dataset.
- `npm run community-waypoints:validate` checks the checked-in file with that same parser. Normal and local-rehearsal frontend builds run the check. Maintainer review, GIS edits, duplicates, periodic checks, and rollback are defined in the [publication runbook](community-waypoints/publication.md).
- Download the public GeoJSON from Settings → Waypoints → Community waypoints. Explore loads the same validated collection for its Community Waypoints list and distinct map markers; category filters control both when Waypoints are available. With an empty collection, Explore offers a centered Suggest a waypoint action. Selecting a map marker opens its published details. More → Suggest a waypoint and approved-waypoint details → Suggest a correction accept anonymous, text-only submissions. New suggestions start from a current device-location fix when available, require a map-selected point otherwise, and collect a category with optional reviewer notes and structured details. The backend validates and rate-limits submissions before creating issues in the private review repository with a backend-only credential. Every submission is reviewed before publication and receives a generic receipt without a private issue link. Photos, photo links, and contact details are not accepted. The [data contract](community-waypoints/data-contract.md) defines the public schema; publication review remains a separate maintainer step.

## Basemap and markers

- The basemap is the OpenFreeMap Liberty style on OpenStreetMap data. Bus POI labels are hidden and low-priority local POIs are reduced, while rail, airport and major campus context stay visible. Map source attribution appears for five seconds at startup, then disappears; Settings → About → Data sources → Basemap keeps the source links.
- The map reports tile errors and has the standard MapLibre navigation controls.
- Bus stops are neutral transit-ring markers with collision-aware short-name labels from zoom 14. Stops and labels outside the selected route fade to 20% from zoom 14, and open stops stay visible below that zoom.
- Route lines are neutral and subdued when all routes show. Official route colours are used for the selected route only.
- Venue markers are neutral pins.
- Community Waypoint markers use a diamond badge with a category token, separate from Personal Waypoint pins. Their accessible labels identify the place and category; category filters update the marker set.

## Code layout

Module ownership is in [Application Architecture](agents/architecture.md). In short:
- MapLibre lifecycle, the basemap, transit layers and markers sit in focused adapters under `frontend/src/infrastructure/map/`. The app uses the framework-free MapSession contract in `frontend/src/app/contracts/`.
- `frontend/src/app/navigation-session.ts` owns application state and commands: loaded data, Explore history, route selection, trip endpoints, resource status, errors and map coordination. `app.tsx` only composes and adapts to React.
- JSON fetching and validated loaders are in `frontend/src/infrastructure/data/`.
- Community Waypoint publication data is kept in `frontend/public/data/community-waypoints.geojson`; Settings links to that same file for download.
- Shared transit, venue and walking-graph types and validation live in `shared/src/`. Frontend-only location, trip and Explore state is in `frontend/src/domain/`.
- Personal waypoints: the model and versioned browser store live in `frontend/src/domain/waypoints/personal/` and `frontend/src/infrastructure/data/`, with collections capped at 500 records. The waypoint key remains `navus:personal-waypoints:v1`; records missing marker appearance fields load with the blue/general defaults without a schema migration. Category visibility is stored separately at `navus:personal-waypoint-category-visibility:v1`; only the map projection is filtered. Reads keep valid records and report rejected ones, and malformed or unsupported waypoint data stays available for recovery. localStorage cannot make cross-tab writes atomic. The More menu lives in `frontend/src/features/more/`; Settings and Personal Waypoint screens live in their own feature folders. The app composes these screens and the map/store adapters.
