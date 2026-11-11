# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Anyone on the NUS campus who needs to find a place or work out how to get there. This includes people looking for a room or building, checking bus arrivals, or planning a trip across campus.

## Product Purpose

NUSGo helps people navigate NUS by combining campus venue search, bus arrival information, and walking and campus-bus journey planning. Its intended outcome is that a person can find a destination and choose an available way to reach it. No quantitative success measure is established.

## Positioning

NUSGo is an independent campus-navigation web app that brings venue search, nearby stops, bus arrivals, and walking-plus-campus-bus trip planning together on one map. It does not require an account. Public-bus arrivals are shown for information and are not used in journey planning.

## Operating Context

- People use NUSGo in a browser on a phone or desktop while finding places and moving around campus.
- Explore supports venue search and bus-route browsing; Stops supports nearby and favourite bus stops; Plan supports choosing endpoints and viewing a recommended journey.
- Favourites, settings, and Personal Waypoints are stored in the browser profile.
- Settings includes About and Waypoints sections; Waypoints provides a download link for the approved public Community Waypoints GeoJSON.

## Capabilities and Constraints

- The current app searches campus venues and buildings, shows the NUS internal bus network, provides NUS and public-bus arrivals, and plans journeys using walking and internal bus legs.
- Personal Waypoints are private to the browser profile. Community Waypoints have a checked-in public GeoJSON file, a base-path-aware loader that validates it, and a download link in Settings → Waypoints. The file contains only maintainer-reviewed locations and remains empty until one is approved. Explore shows approved Community Waypoints as map markers with category filters. People can send anonymous, text-only suggestions and corrections to a private review queue; photos are not accepted.
- Device location stays in the browser. When a person uses Current location as a Plan endpoint, the app freezes the active coordinates into that endpoint and sends them with the journey request.
- Public-bus arrivals are display-only. Journey recommendations depend on available route, timing, and endpoint data; walking data can miss covered paths, indoor links, and verified building entrances.
- NUSGo is independent and is not affiliated with NUS. Map and data sources require visible attribution.

## Brand Commitments

- Use the name NUSGo.
- Describe NUSGo as an independent project that is not affiliated with NUS.
- Keep source attribution visible and accurate.

## Evidence on Hand

- The running web app and checked-in campus venue, building, bus-stop, and route data are available in `frontend/`.
- Browser screenshots are available under `docs/qa/screenshots/`.
- The public Community Waypoints file and validated loader are in `frontend/public/data/` and `frontend/src/infrastructure/data/`; the download is in Settings → Waypoints.
- The repository documents OpenStreetMap/OpenFreeMap, NUS Digital Twin, NUSMods, uNivUS, and LTA DataMall as data or map sources.
- No user research, testimonials, or quantitative success measures are documented.

## Product Principles

1. Help anyone on campus find a destination and understand available ways to reach it.
2. Keep venues, buildings, bus stops, routes, and journey Paths distinct and traceable to their sources.
3. Be clear about data limits and live-data availability; do not claim a route is fastest when the required timing data is unavailable.
4. Keep personal location and Personal Waypoints private by default, and preserve attribution for shared data.

## Accessibility & Inclusion

- Support keyboard access and reduced-motion preferences.
- Keep interactive controls at least 36px tall and wide, except the documented mobile sheet handle, which has a separate size rationale.
- Communicate selected and status states with text or accessible semantics, not color alone.
