# Walking routing provider and fastest-trip cost model

Status: deprecated

This decision was too narrow: it chose OSRM for walking before the broader NUS journey architecture was decided. It is retained as historical research and is superseded by [ADR 0002](0002-nus-route-recommendation-architecture.md), which defines the composed provider-neutral route recommendation architecture and selects Valhalla for the first walking boundary.

## Considered options

- **OSRM backend — historical option.** Open-source, self-hostable, HTTP-based, and small enough for the walking-only boundary. The route service returns the fastest route for the selected profile and supports GeoJSON geometry. A production deployment must provide a walking profile; the public demo endpoint is not a production dependency.
- **GraphHopper.** Strong routing API and custom profiles ([GraphHopper API](https://docs.graphhopper.com/openapi/section/explore-our-apis/api-explorer)), but the hosted service and custom-profile choices add provider-account and configuration decisions that are not needed for the first walking boundary.
- **Valhalla.** Supports pedestrian and multimodal routing and can use GTFS for transit ([Valhalla overview](https://valhalla.github.io/valhalla/api/)), but its multimodal transit model would duplicate or require migrating the current NUSGo shuttle model. It remains a possible future engine.
- **openrouteservice.** Provides hosted walking directions and GeoJSON ([openrouteservice API](https://openrouteservice.org/dev/)), but its hosted API key and service limits make a server-side proxy or self-hosted deployment necessary for a durable account-free app.
- **Turf.js.** Useful for geometry calculations, but its `shortestPath` helper works from supplied obstacle polygons and is not a road-network router ([Turf shortestPath](https://turfjs.org/docs/api/shortestPath)). It is not a substitute for this decision.

## Routing boundary

The application-facing contract will accept two validated `[longitude, latitude]` coordinates and an abort signal. It will return either a validated walking route containing:

- GeoJSON LineString coordinates;
- distance in metres; and
- duration in seconds;

or an explicit routing failure. Provider response parsing, HTTP errors, invalid geometry, and provider-specific fields stay inside infrastructure. The browser must not contain a long-lived provider secret. A production endpoint should be self-hosted or protected by a server-side proxy; the endpoint remains configurable for local development.

## Fastest-trip cost model

The planner will compare these candidates:

1. **Direct walking:** the routed walking duration from origin to destination.
2. **One direct shuttle:** origin-to-boarding walking duration, approved waiting duration, approved shuttle ride duration, and alighting-to-destination walking duration.

The 200-metre venue-to-stop rule remains a product eligibility filter; the routing service supplies the actual walking path and duration for an eligible connection. Transfers, live arrivals, and turn-by-turn instructions remain out of scope.

Candidates are ranked by total duration in seconds. Equal totals use stable tie-breaking in this order: fewer shuttle rides, shorter total walking distance, then lexicographically smaller internal route ID. A journey is not labelled fastest when a required walking route or approved shuttle timing is unavailable. The timing decision and data provenance are defined in [the shuttle timing policy](../shuttle-timing.md).

## Consequences

- The walking adapter can stay framework-free without coupling the app to a provider response shape.
- The Pathfinding engine can stay pure by consuming validated walking-route results and approved shuttle estimates rather than performing network calls.
- The map can render returned walking geometry instead of drawing straight-line approximations.
- Routing requests expose venue and stop coordinates to the selected service, so provider privacy and retention terms must be accepted before production deployment.
- Changing routing engines later should affect the adapter and deployment configuration, not the planner, map contract, or trip-panel model.
