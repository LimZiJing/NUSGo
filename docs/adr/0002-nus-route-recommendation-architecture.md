# NUS route recommendation architecture

Status: accepted

Date: 2026-09-21

Issue: [#70](https://github.com/LimZiJing/NavUS/issues/70)

## Decision

NavUS will use a composed routing architecture for the first recommended-journey implementation:

- A self-hosted Valhalla instance will provide walking routes and walking travel-time/distance connections using pedestrian costing.
- NavUS will keep `public/data/shuttle-network.json` and its validated route geometry as the only canonical source for internal shuttle routes, stops, service associations, ordered stop lists, and shuttle map geometry.
- A pure NavUS planner will compose the walking connections with directed internal-shuttle edges and validated shuttle timing estimates.
- The application will return one complete `Journey` made of ordered `Journey leg` values. Walking and internal shuttle travel are modes inside that journey, not separate products.

The planner will not import the current shuttle model into Valhalla or OpenTripPlanner as a second transit source of truth. A combined transit engine can be reconsidered when NavUS has an intentional GTFS/timetable representation and a requirement for schedule-aware or live transit routing.

Valhalla is the first walking provider because its official API supports pedestrian costing, a matrix service for walking costs, and GeoJSON route shapes. The provider is replaceable behind the walking boundary; OSRM and other engines remain infrastructure alternatives rather than domain concepts. The public Valhalla demo is for development or limited manual investigation only and is not a production dependency.

## Journey model

The domain model must remain provider-neutral. A `Journey` contains:

- the resolved origin and destination endpoint references;
- an ordered list of `Journey leg` values that form a continuous chain from origin to destination;
- `totalDurationSeconds`, equal to the sum of all leg durations, including shuttle waiting time;
- `totalDistanceMeters`, equal to the sum of the reported leg distances; and
- an estimate status that makes clear that the recommendation uses estimated walking and shuttle timing data rather than live arrival certainty.

Each `Journey leg` contains its mode, from/to location references, duration, distance, and validated map geometry.

### Walking leg

A walking leg contains the provider-independent result of a walking route:

- a validated GeoJSON `LineString`;
- distance in metres; and
- duration in seconds.

The route provider, request URL, response fields, and provider-specific errors do not enter the domain model.

### Internal shuttle leg

An internal shuttle leg contains:

- the canonical internal route ID;
- the boarding and alighting stop IDs;
- the canonical route geometry for that stop-to-stop movement;
- the approved waiting estimate for boarding; and
- the approved ride-time estimate between the two stops.

Its duration is `waitingSeconds + rideSeconds`. Waiting is part of the shuttle leg's estimated cost and is shown as a wait detail in the plan; it is not a separate travel mode. A transfer is represented by another shuttle leg, optionally separated by a walking leg between stops. Consecutive legs must share the same location reference; a gap or a straight-line fallback is not a valid Journey.

## How the networks compose

For a complete trip request, the planner receives:

- a resolved origin and destination with stable endpoint IDs and coordinates;
- the validated canonical transit index;
- walking connections between the two endpoints and the shuttle-stop candidates; and
- validated shuttle timing estimates.

The walking adapter may use Valhalla's matrix service to obtain directed walking costs for the origin, destination, and all currently canonical shuttle stops. The selected walking legs are then enriched with individual route geometries. A matrix result is never treated as map geometry.

The pure planner builds a directed graph:

- walking edges connect the resolved endpoint and shuttle-stop locations using the returned walking connections;
- for every canonical route, each ordered stop can board and travel to every later stop in that route direction;
- each shuttle edge carries its route ID, boarding stop, alighting stop, waiting estimate, and ride-time estimate; and
- opposite stops are distinct stops. The planner may connect them only through a valid walking edge, not through an assumed interchange.

This graph supports direct walking, one or more internal shuttle legs, walking transfers, and direct walking between shuttle stops. It does not hard-code a one-shuttle result. The planner ranks complete paths and returns only the best valid path after deterministic tie-breaking.

The first implementation is still deliberately limited to walking and the current internal shuttle mode. It does not add cycling, driving, external public transit, turn-by-turn instructions, accessibility constraints, or live vehicle positions.

## Cost and ranking

The primary cost is total estimated journey duration:

```text
total duration = walking durations
               + shuttle waiting estimates
               + shuttle ride-time estimates
```

All durations are integer seconds and all distances are metres. The planner must not invent a default when a required estimate is absent.

Equal total durations use stable tie-breaking in this order:

1. fewer shuttle boardings;
2. shorter total walking distance;
3. fewer total legs; and
4. lexicographically smaller route/stop sequence.

The UI should call the output a `Recommended journey` and show that its duration is estimated. It must not claim that a journey is fastest when required timing data is unavailable or when the comparison cannot be made from complete estimates.

Issue #21 owns the verification and provenance of shuttle waiting and ride-time estimates. The planner consumes a validated estimate contract; it does not recalculate or silently replace those values.

## Route-engine boundary

Issue #71 will implement a framework-free walking boundary in infrastructure. Its public result must contain only validated domain-facing values:

- `from` and `to` request identities;
- distance in metres;
- duration in seconds; and
- a GeoJSON `LineString` when route geometry is requested.

The adapter must validate coordinates, HTTP status, numeric ranges, geometry type, coordinate order, and response completeness. It must translate provider failures into explicit routing failures and preserve abort behaviour. It must not expose Valhalla request/response types to React, MapLibre, or the pure planner.

The boundary should support a matrix request for ranking and a route request for selected-leg geometry. If geometry enrichment fails for the chosen path, that path is incomplete and must be discarded or the next complete ranked candidate must be tried; the map must never draw a straight-line approximation while presenting it as a routed Journey.

## Missing data and failure states

- An unmapped venue or invalid endpoint cannot be routed. The user receives an endpoint-specific status.
- A walking failure removes only the affected walking connection. A valid direct walking Journey may still be returned if the transit network or shuttle timing is unavailable.
- A missing or invalid shuttle timing estimate removes that shuttle edge. The planner may still return a walking-only Journey or another shuttle path with complete estimates.
- An invalid transit network fails closed for shuttle paths. Direct walking remains eligible when both endpoints are mapped and the walking service succeeds.
- If no complete Journey remains, NavUS shows that no recommended journey is currently available and explains whether route data, endpoint data, or shuttle timing data is missing. It does not present a partial Journey as a recommendation.
- Each trip request gets a request identity. Application state publishes results only for the latest active request; an abort or late response from an older request must not replace a newer result.

## Deployment, privacy, licensing, and rate limits

Production routing will use a server-side proxy or same-origin routing endpoint backed by a self-hosted Valhalla instance. The browser will not contain a provider credential or call the public demo server as a product dependency. Local development may use a configurable local Valhalla endpoint.

The routing endpoint must accept only validated NavUS endpoints or validated coordinates from the application boundary, enforce request timeouts and size limits, cache repeated static connection requests where appropriate, and apply per-client rate limits. It should avoid retaining raw origin/destination coordinates and request logs longer than needed for operations. Coordinates reveal a user's intended campus trip even though the endpoint catalogue is public, so production traffic must use HTTPS and operational logging should minimise or redact route details.

Valhalla is MIT licensed. Walking graph data derived from OpenStreetMap is subject to ODbL obligations, including visible OpenStreetMap attribution and documented licensing for any redistributed derived database. The existing map attribution and route-data provenance must remain accurate. Shuttle and venue snapshots sourced from NUS APIs or NUSMods require a separate provenance and reuse check before a public refresh or redistribution; this ADR does not grant a new licence to those datasets.

Self-hosting removes dependence on a third-party routing API key and its upstream quota, but it does not remove the need for capacity controls at the NavUS endpoint. If a hosted provider is used later, its key must remain server-side and its terms, retention, quota, and attribution requirements must be recorded before deployment.

## Consequences

Positive consequences:

- The canonical shuttle model remains one source of truth.
- The pure planner can be tested offline with small walking and timing fixtures.
- A Journey can contain any valid sequence of walking and shuttle legs without coupling the domain to a provider.
- Map and Plan trip can render the same ordered leg list and total estimate.
- The walking provider can be replaced without changing the Journey or transit model.

Costs and limitations:

- The first deployment needs a server-side routing service and an OSM walking graph.
- A matrix plus selected-route geometry requires more than one routing operation and careful request cancellation.
- OpenStreetMap coverage may miss NUS indoor links, covered walkways, entrances, or campus-only paths; NavUS may later need curated walking data or a custom graph.
- Static shuttle timing is an estimate. Live arrivals are optional server-side data; timetable-aware departure search remains future work.
- The public Valhalla demo, public OSM routing services, and unbounded client-side provider calls are not production fallbacks.

## Follow-up sequence

1. #21 verifies the shuttle timing estimates and publishes their validated input shape and provenance.
2. #71 implements the Valhalla-backed walking boundary and response validation.
3. #66 implements the pure composed Journey planner and deterministic ranking.
4. #67 connects planning to application state with request identity and cancellation.
5. #68 renders the selected Journey geometry and cleans it up on replacement/clear.
6. #69 presents the same Journey legs, wait/ride details, estimate status, and failure states in the responsive Plan trip panel.

## References

- [Issue #70](https://github.com/LimZiJing/NavUS/issues/70)
- [Issue #21](https://github.com/LimZiJing/NavUS/issues/21)
- [Valhalla API](https://valhalla.github.io/valhalla/api/)
- [Valhalla route API schema](https://github.com/valhalla/valhalla/blob/master/docs/docs/api/openapi.yaml)
- [Valhalla license](https://github.com/valhalla/valhalla/blob/master/COPYING)
- [OpenTripPlanner](https://www.opentripplanner.org/)
- [OSRM profiles](https://project-osrm.org/docs/v26.4.0/profiles)
- [NUSMods API](https://api.nusmods.com/v2/)
- [OpenStreetMap copyright and licence](https://www.openstreetmap.org/copyright)
- [Issue #70 routing options research](../research/issue-70-routing-options.md)
