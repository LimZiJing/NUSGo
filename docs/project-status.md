# NUSGo Project Status

A one-page summary of what works, what doesn't and what's next. Detail lives in the linked docs. Stable domain vocabulary belongs in the root `CONTEXT.md`, and agent behaviour in `AGENTS.md`.

## Stack

- npm workspaces: `frontend`, `backend` and `shared`. `shared` owns HTTP contracts and pure data validation. See [Application Architecture](agents/architecture.md).
- Frontend: React 19, TypeScript and Vite, with MapLibre GL JS for the map and Base UI Drawer for mobile sheets. Static JSON data sits in `frontend/public/data`.
- Backend: Express, with a self-hosted Valhalla pedestrian service behind a server-side boundary. A pure planner combines walking connections with the bus network. OSRM and other engines remain possible replacements behind that boundary.
- Possible later tools: `@turf/turf` for spatial calculations, `ical.js` for calendar import, and PostgreSQL/PostGIS behind a future API.

## What works

| Area | Today | Detail |
| --- | --- | --- |
| Explore | Search 729 venues and 249 buildings, open venue details, browse the 8 shuttle routes | [UI behaviour](ui/behaviour.md#explore), [data](data-and-map.md) |
| Stops | Nearby and favourite stops with live NUS and public-bus arrivals | [UI behaviour](ui/behaviour.md#stops) |
| Plan | Walking and bus journeys with up to three bus options and one walking option, using Personal Waypoints as endpoints | [Pathfinding](pathfinding.md), [UI behaviour](ui/behaviour.md#plan) |
| Location | Browser location, one-tap recentre, frozen Current location endpoint | [UI behaviour](ui/behaviour.md#location) |
| More and Settings | My waypoints, Settings and Release notes destinations; themes, minute format for Stops timings, favourites, About and Waypoints | [UI behaviour](ui/behaviour.md#settings-and-themes), [release notes](release-notes.md) |
| Personal Waypoints | Save and manage private waypoints in this browser profile, browse places by category, stage map visibility changes, edit or remove saved places, and select saved coordinates as Plan endpoints | [UI behaviour](ui/behaviour.md#personal-waypoints), [data](data-and-map.md#code-layout) |
| Community Waypoints | Empty public GeoJSON file, validated browser loader, Settings download, and a no-photo private submission endpoint; map display and submission UI do not exist yet | [Data contract](community-waypoints/data-contract.md), [data and map](data-and-map.md#community-waypoints) |
| Layout | Desktop column and mobile bottom sheets | [UI behaviour](ui/behaviour.md#layout) |
| Map | OpenFreeMap Liberty basemap, stop markers, route lines, opt-in stylised 3D live buses with route-coloured badges, heading and route movement, next-stop/crowding popups and a layer toggle | [Data and map](data-and-map.md#basemap-and-markers), [live transit data](backend-live-data.md#browser-presentation) |
| PWA | Installable app shell with offline static data and install/update prompts | [PWA guide](pwa.md) |
| Express API | Journey planning, NUS and LTA arrivals, service windows, active-bus snapshots, best-effort Load level joins on shuttle arrivals | [Express live transit data](backend-live-data.md), [local services](local-services.md) |
| Hosting | Live at nusgo.app: frontend on Cloudflare Pages, API and Valhalla on one VM | [Production deployment](production-deploy.md) |

Also in place:
- A local Express container rehearsal (`backend/Dockerfile`, `docker-compose.rehearsal.yml`) with live NUS and LTA arrivals, checked locally on 22/10/2026. Results are in [local services](local-services.md#local-rehearsal-evidence--22-october-2026).
- Personal waypoint model, versioned local store, compact category picker, category-scoped searchable lists, persistent map markers with custom color and icon, staged category visibility, direct All places details and editing, category details, reorder and removal flows are in place. Recovery for unreadable and rejected data and concurrent-edit handling are also covered. Plan accepts Personal Waypoints and sends only the selected coordinate after `Get route`. See [UI behaviour](ui/behaviour.md#personal-waypoints) and [data and map](data-and-map.md#code-layout).
- A dev-only simulated clock for planning. See [Pathfinding](pathfinding.md#development-clock).
- A dev-only component gallery at `/?gallery`. See [Interface controls](ui/controls.md).
- Automated checks for resource validation, immutable indexes, loader failures and the transit manifest. The browser checklist is in [the manual smoke checklist](qa/manual-smoke-check.md), with past results in the [evidence log](qa/evidence-log.md).

## Limitations

- **Walking routes** rely on OpenStreetMap. NUS paths, covered walkways, entrances and indoor connections may need custom GeoJSON or another licensed source.
- **Building entrances** are unverified. 29 buildings use a provisional OpenStreetMap entrance, and the review in #260 is open.
- **Journey planning** needs a configured Valhalla endpoint. Search is bounded, so a recommended Path is complete and valid but not claimed to be the global best. See [Pathfinding](pathfinding.md#speed-and-limits).
- **Live data** needs server-side NUS credentials, and live-arrival reliability still needs separate verification. NUSMods' NextBus client provides no route geometry.
- **One Express instance only.** The shuttle snapshot and rate limiters live in process memory.
- **Location** depends on browser permission and device accuracy. It doesn't replan journeys or continue after the app closes.
- **Community Waypoints** have an empty public dataset, validated loader, and a no-photo endpoint for private review submissions. The endpoint needs a backend-only GitHub token and has no public submission UI yet. Map display belongs to #213. A plausible point still needs maintainer review before publication; code validation cannot confirm approval.
- **Browser evidence** is partial. Targeted checks exist at 1280 × 720. The exact release and mobile viewports and failure injection still need manual verification.
- **Website release history** starts empty until the first successful production promotion bundles reviewed notes. After each promotion, a trusted follow-up workflow records the exact deployment time and immutable commit tag. Backend deployment intervals still need to be reviewed and summarized by the release operator. See [release notes](release-notes.md).
- **Transit data** only behaves correctly while the checked-in network, geometry and verification manifest stay in sync. CI checks this.

## What's next

1. Finish the release desktop and map smoke checklist.
2. Verify the Valhalla walking boundary and optimised walking connections.
3. Verify private live bus arrivals and the server-side deployment boundary.
4. Collect regression and release evidence for the live journey flow.

After that: more mobile screen refinement, then the roadmap in the [README](../README.md#planned).
