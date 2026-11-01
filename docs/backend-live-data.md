# Express live transit data

Express owns provider calls and live transit state. HTTP routes and request validation live in `backend/src/http`. `backend/src/live-data/runtime.ts` composes the providers and manages snapshot lifecycle; provider-independent snapshot generations live in `live-data/bus-arrivals/snapshot.ts`. NUS authentication, mappings, bus-arrival parsing, and service-window loading live in `live-data/providers/nus`; LTA mappings, request selection, response parsing, arrivals, and service schedules live in `live-data/providers/lta`. Reusable concurrency, retry, and timeout controls live in `live-data/upstream`. Shared request and response types live in shared source.

During local development, Vite forwards `/api` requests to Express at `http://127.0.0.1:3001`; the proxy only forwards requests and contains no API handlers. The browser's arrival clients call the Express endpoints, and Express alone polls NUS or LTA. A separately served frontend uses its configured `VITE_API_ORIGIN` directly. See the [local services guide](local-services.md) for process and data setup.

## Endpoints

All live-data routes accept GET:

- /api/shuttle-arrivals?stops=<JSON array> returns selected canonical stop IDs from the latest bus-arrival snapshot. It includes a snapshot version and observation and expiry times for each stop. It also returns `unavailableStopIds`, the requested stops that had no fresh result in the latest cycle (see the snapshot lifecycle below); clients should show these as having no live data, not as having no buses.
- /api/shuttle-service-windows?routes=<comma-separated route IDs> returns NUS service windows and their observation and expiry times.
- /api/shuttle-vehicles?routes=<comma-separated route IDs> returns the latest vehicle positions and Load levels for those routes, with snapshot observation and expiry times and `unavailableRouteIds` for routes without fresh data. An empty vehicles list with all routes unavailable means data has not arrived yet or NUS failed, not that no buses are running. The first request after an idle spell starts polling.
- /api/public-bus-arrivals?stops=<JSON array> accepts mapped canonical stop IDs and returns LTA arrivals with per-service live, no-estimate, not-in-operation, or provider-error status.

Requests are bounded and validated against the canonical network or checked-in LTA mapping. Unknown route or stop IDs return a safe 400 response. Public-bus data is for display only and is not consumed by Journey routing.

The health route reports process health. The ready route returns 503 until canonical data is loaded and the first bus-arrival snapshot generation is published. After a restart, readiness stays false until one complete cycle succeeds for all 33 stops. Once a complete generation exists, later partial cycles can publish by carrying each failed stop forward with its original observation time.

## Bus-arrival snapshot lifecycle

One Express process owns the in-memory bus-arrival snapshot. Run one backend instance for a deployment. If multiple instances are needed, they must coordinate through a shared snapshot store or distributed lock; independent in-memory snapshots would poll NUS separately and could serve inconsistent data.

The process starts its first refresh immediately, then targets a 30-second start-to-start interval by default. It keeps one cycle in flight; if a cycle runs past the next interval, the following cycle starts as soon as the current one finishes. Bus-stop requests are limited to six concurrent requests. Each upstream request has a five-second timeout and one retry by default, with a 200 ms exponential backoff.

Express publishes a generation only after the cycle settles. Successful stops replace their own value and observation time. Before the first complete generation, any partial cycle is discarded and readiness remains false. After a complete generation exists, a failed stop keeps its last good value and original observation time. If all stops fail, the previous generation stays in place.

A stop that did not succeed in the latest cycle is listed in the snapshot's `unavailableStopIds`, whether it has no earlier data or only carried-over data. Carried-over routes and observation times stay in the snapshot, but the stop is reported as unavailable so that nothing presents stale arrivals as live. A stop leaves the list as soon as a later cycle succeeds for it. Journey planning treats a listed boarding stop as having no live wait and uses the timetable. The field is optional in the response, and `/api/shuttle-arrivals` returns only the listed IDs that were requested.

NUS service-window results are cached for ten minutes. LTA stop results use their own short cache and distinguish an upstream failure from a valid response with no estimate.

## Live vehicle positions

Vehicle positions come from NUS active-bus data and run on their own timer, separate from the 30-second arrival cycle. Arrivals and readiness do not depend on vehicles: a vehicle failure never returns 503 for arrivals.

Each vehicle cycle covers every internal route, one call per route per cycle. The budget is routes x one call per interval, so 8 routes at a 30-second interval is 16 upstream calls a minute. Vehicle polling only runs while a client has asked for vehicles within the idle timeout (120 seconds by default). The first request after an idle spell starts a cycle at once. Requests through `/api/shuttle-vehicles` and the runtime's `getVehicles` return whatever the latest cycle holds.

A failed route keeps its last good vehicles, with their original observation times, until that route's expiry (90 seconds by default). Only then does its route ID move to `unavailableRouteIds`, so clients do not read it as having no buses. Unlike arrivals, a carried-over route is not listed as unavailable before it expires; clients should use each vehicle's `observedAt` to show its age. Expiry must be at least twice the refresh interval, so one missed cycle does not empty a route.

NUS's Acceptable Use Policy applies to this traffic. Keep upstream requests modest, and do not shorten the vehicle refresh interval without checking the policy and the request budget first. The minimum interval is 15 seconds.

Only one Express instance may poll NUS for vehicles. Each instance keeps its own in-memory snapshot and polls on its own, so running two instances multiplies the upstream traffic. The same single-instance rule as the arrival snapshot applies.

## Backend configuration

Copy backend/.env.example to backend/.env for local settings. NUS live shuttle data requires all four values NUS_BUS_PROXY_BASE_URL, NUS_X_HTD_API, NUS_X_APP_API, and NUS_X_API_KEY; the token URL, app version, and device ID can use their defaults. An initial NUS_UNIVUS_JWT and NUS_USER_ID are optional; Express can obtain a session token when they are absent.

LTA_ACCOUNT_KEY enables public-bus arrivals. Credentials are read only by the backend and must not be exposed through Vite environment variables or frontend builds. Live-data timeout, concurrency, retry count, retry delay, and shuttle refresh interval settings are range-checked by backend configuration.

Vehicle settings are NUS_VEHICLE_REFRESH_INTERVAL_MS (default 30000, minimum 15000), NUS_VEHICLE_EXPIRY_MS (default 90000, at least twice the refresh interval), and NUS_VEHICLE_IDLE_TIMEOUT_MS (default 120000). If you raise the refresh interval, raise the expiry too, or startup fails.

On SIGINT or SIGTERM, Express stops accepting requests, aborts the poller and upstream requests, clears its refresh timer, and waits for active live-data operations to finish.
