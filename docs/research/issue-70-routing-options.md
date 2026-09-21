# Issue #70 routing options research

Date: 2026-09-21

## Question

How should NavUS combine walking and the canonical NUS internal shuttle network into one recommended `Journey`, while keeping the first deployment account-free, privacy-conscious, and maintainable?

## Findings from primary sources

### Valhalla

[Valhalla's API documentation](https://valhalla.github.io/valhalla/api/) describes route and matrix services for foot travel and says that its multimodal mode uses OpenStreetMap for the main graph and user-supplied GTFS for transit. Its [route API schema](https://github.com/valhalla/valhalla/blob/master/docs/docs/api/openapi.yaml) includes `pedestrian` costing and `geojson` route shapes. This makes it suitable as a walking provider without requiring NavUS to move its shuttle model into GTFS.

Valhalla's [license](https://github.com/valhalla/valhalla/blob/master/COPYING) is MIT. Its [README](https://github.com/valhalla/valhalla/blob/master/README.md) describes the public server as a fair-use demo with rate limits, so the demo must not be a production dependency.

### OpenTripPlanner

[OpenTripPlanner's project documentation](https://www.opentripplanner.org/) describes a server that combines pedestrian and transit segments from OpenStreetMap and GTFS. It is a strong future option if NavUS publishes a maintained GTFS feed and wants a single timetable-aware multimodal engine. It is not the first implementation because converting the canonical `shuttle-network.json` into GTFS would add a second transit representation and make schedule freshness a new prerequisite.

### OSRM

[OSRM's profile documentation](https://project-osrm.org/docs/v26.4.0/profiles) confirms that OSRM supports foot profiles, including a bundled foot profile that can be changed at preprocessing time. OSRM remains a viable self-hosted walking alternative, but its profile is a preprocessing choice and does not provide the transit composition that NavUS needs. The old OSRM-only ADR is therefore not sufficient as the route architecture decision.

### NUSMods and source refreshes

The [NUSMods API documentation](https://api.nusmods.com/v2/) says that its data is extracted from official Registrar APIs, is read-only, and should generally not be fetched more than once per day. NavUS should continue to treat its checked-in shuttle snapshot as the canonical, reviewed input and refresh it deliberately rather than routing directly from a live upstream response.

### OpenStreetMap licensing and service use

[OpenStreetMap's copyright and licence page](https://www.openstreetmap.org/copyright) requires attribution and makes clear that the data is under ODbL. It also distinguishes the open data from free third-party map APIs. NavUS must show the required attribution, keep OSM-derived walking data and deployment provenance documented, and self-host or use an explicitly suitable provider rather than relying on public OSM services for routing.

## Decision implication

The lowest-risk first architecture is a composed planner:

1. A self-hosted Valhalla instance supplies validated pedestrian walking connections and geometry.
2. A pure NavUS planner composes those connections with directed shuttle edges derived from the canonical transit network and validated timing estimates.
3. A single `Journey` is returned only when every leg has valid geometry and approved timing data.

OpenTripPlanner and Valhalla multimodal transit remain future options after the shuttle model has an intentional GTFS/timetable representation. OSRM remains an interchangeable walking-provider alternative behind the same boundary, not a domain decision.
