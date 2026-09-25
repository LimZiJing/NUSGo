# Issue #101: route-query optimisation for a small shuttle network

## Short answer

The proposed Issue #101 design is realistic for NavUS. It is smaller than the
problem handled by normal public-transport routing systems. The route graph has
only 33 stops and 8 shuttle routes, so route search should stay in memory and
finish locally. Live arrival data should be treated as a short-lived snapshot,
not fetched once for every possible Journey.

The first optimisation should be to send one browser request containing all
uncached stops needed for the search. The current client accepts a list but
currently sends one same-origin request per stop. The server can still make one
upstream NUS request per stop because the private `shuttle-service` operation
currently accepts one `busstopname`.

## What established systems do

Public transit systems normally separate two kinds of data:

1. Static data: stops, routes, stop order, and scheduled service.
2. Realtime data: current arrivals, delays, vehicle positions, and alerts.

The [GTFS static reference](https://gtfs.org/documentation/schedule/reference/)
defines the static network. The [GTFS-Realtime overview](https://developers.google.com/transit/gtfs-realtime)
defines live trip updates, vehicle positions, and service alerts. The
[GTFS-Realtime best practices](https://gtfs.org/documentation/realtime/realtime-best-practices/)
recommend frequently refreshed current snapshots, freshness limits, stable
IDs, and conditional HTTP requests such as `If-Modified-Since` when supported.

[OpenTripPlanner's data-source design](https://docs.opentripplanner.org/en/v2.0.0/Interfaces-Data-Sources/)
is a useful reference implementation: it builds a multimodal graph from
static map and transit data, then applies realtime updates separately. Its
configuration also supports refreshing realtime data without rebuilding the
whole static graph.

A smaller open-source example follows the same pattern. OneBusAway's
[Maglev server](https://github.com/OneBusAway/maglev) polls realtime feeds on a
fixed interval, with a documented default of 30 seconds, and serves the latest
merged view to clients. It does not ask the upstream feed separately for every
candidate route.

## Recommended NavUS design

### Phase 1: use one live snapshot per planning request

1. Build the candidate shuttle graph from the existing static network.
2. Find the stops that can actually be used by any candidate path. This is not
   necessarily all 33 stops, but it may be all 33 for a broad origin and
   destination search.
3. Fetch those stops once as a batch.
4. Pass the resulting snapshot to the planner.
5. Let the planner rank every candidate using the live wait at boarding and
   transfer stops.

The planner should not call the NUS API. It should only read the snapshot. That
keeps route ranking deterministic and prevents the same stop being requested
again while another candidate is being evaluated.

### Phase 2: share the short-lived snapshot

Keep the existing 45-second server cache and in-flight request deduplication,
but make the cache the shared source for all planning requests. A later user
request should reuse fresh stop data instead of calling NUS again.

If NUS later provides a bulk arrival endpoint, the server can use it. Until
then, do not invent one: make the browser-to-server call a batch while keeping
the server-to-NUS calls per stop.

### Phase 3: only add background polling if traffic needs it

A background refresh for all 33 stops every 30 seconds would be about 66
upstream stop requests per minute. That is technically small, but it is wasteful
when nobody is planning a trip and could hit an upstream rate limit. It should
only be added after measuring real usage and confirming NUS limits.

## Approximate request cost

The current checked-in network has 33 stops and 8 routes. The current server
allows at most 16 stops per browser request and already coalesces simultaneous
requests for the same stop.

| Situation | Browser-to-NavUS calls | Cold-cache upstream calls |
| --- | ---: | ---: |
| 5 needed stops | 1 after batching | up to 5 |
| 16 needed stops | 1 | up to 16 |
| all 33 stops | 3 | up to 33 |
| service windows for 8 routes | 1 | up to 8, then cached for 10 minutes |

These are upper bounds for a cold cache. With a warm cache, the upstream count
is normally zero for already-fresh stops. The response data is only arrival
metadata, so memory use for 33 stops should be trivial compared with the map
tiles and route geometry already used by the application.

## Is this realistic?

Yes. For a small campus network, a static in-memory graph plus a short-lived
realtime cache is a normal and practical design. The expensive part is not
searching 33 stops; it is making unnecessary upstream requests and dealing with
stale or invalid live data.

The important limits are:

- do not request one live feed per candidate Journey;
- do not let a failed or stale stop silently become a zero-second wait;
- use one consistent snapshot for one planning result;
- measure upstream latency, failure rate, and rate limits before adding polling;
- keep live API credentials on the server.

## Implementation order for Issue #101

1. Change `src/infrastructure/shuttle-arrivals/client.ts` to batch uncached
   stops, chunking at the server limit of 16.
2. Change journey planning so it identifies all eligible boarding stops before
   live ranking, rather than using only the stops from the static winning
   Journey.
3. Run `planJourney` with the one live snapshot and apply waits to every
   boarding and transfer edge.
4. Keep the server cache and in-flight deduplication as the shared upstream
   protection.
5. Add tests for direct routes, transfers, missing stops, stale data, service
   windows, and walking-only Journeys.
6. Add request timing and cache-hit counters before considering background
   polling.

The current implementation evidence is in
[`vite.config.ts`](../../vite.config.ts),
[`shuttle-arrivals/client.ts`](../../src/infrastructure/shuttle-arrivals/client.ts),
and [`journey-planning.ts`](../../src/app/journey-planning.ts). The private NUS
wire format is documented separately in
[`issue-25-live-shuttle-contract.md`](issue-25-live-shuttle-contract.md).
