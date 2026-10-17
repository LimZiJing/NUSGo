# Express live transit data

Express owns provider calls and live transit state. HTTP routes and request validation live in `backend/src/http`. `backend/src/live-data/runtime.ts` composes the providers and manages snapshot lifecycle; provider-independent snapshot generations live in `live-data/bus-arrivals/snapshot.ts`. NUS authentication, mappings, bus-arrival parsing, and service-window loading live in `live-data/providers/nus`; LTA mappings, request selection, response parsing, arrivals, and service schedules live in `live-data/providers/lta`. Reusable concurrency, retry, and timeout controls live in `live-data/upstream`. Shared request and response types live in shared source.

During local development, Vite forwards /api requests to Express at http://127.0.0.1:3001. Vite does not poll NUS or LTA. The browser keeps using the existing same-origin API paths until issue #232 moves it to an explicit API origin.

## Endpoints

All live-data routes accept GET:

- /api/shuttle-arrivals?stops=<JSON array> returns selected canonical stop IDs from the latest bus-arrival snapshot. It includes a snapshot version and observation and expiry times for each stop.
- /api/shuttle-service-windows?routes=<comma-separated route IDs> returns NUS service windows and their observation and expiry times.
- /api/public-bus-arrivals?stops=<JSON array> accepts mapped canonical stop IDs and returns LTA arrivals with per-service live, no-estimate, not-in-operation, or provider-error status.

Requests are bounded and validated against the canonical network or checked-in LTA mapping. Unknown route or stop IDs return a safe 400 response. Public-bus data is for display only and is not consumed by Journey routing.

The health route reports process health. The ready route returns 503 until canonical data is loaded and the first bus-arrival snapshot generation is published. After a restart, readiness stays false until one complete cycle succeeds for all 33 stops. Once a complete generation exists, later partial cycles can publish by carrying each failed stop forward with its original observation time.

## Bus-arrival snapshot lifecycle

One Express process owns the in-memory bus-arrival snapshot. Run one backend instance for a deployment. If multiple instances are needed, they must coordinate through a shared snapshot store or distributed lock; independent in-memory snapshots would poll NUS separately and could serve inconsistent data.

The process starts its first refresh immediately, then targets a 30-second start-to-start interval by default. It keeps one cycle in flight; if a cycle runs past the next interval, the following cycle starts as soon as the current one finishes. Bus-stop requests are limited to six concurrent requests. Each upstream request has a five-second timeout and one retry by default, with a 200 ms exponential backoff.

Express publishes a generation only after the cycle settles. Successful stops replace their own value and observation time. Before the first complete generation, any partial cycle is discarded and readiness remains false. After a complete generation exists, a failed stop keeps its last good value and original observation time. If all stops fail, the previous generation stays in place.

NUS service-window results are cached for ten minutes. LTA stop results use their own short cache and distinguish an upstream failure from a valid response with no estimate.

## Backend configuration

Copy backend/.env.example to backend/.env for local settings. NUS live shuttle data requires all four values NUS_BUS_PROXY_BASE_URL, NUS_X_HTD_API, NUS_X_APP_API, and NUS_X_API_KEY; the token URL, app version, and device ID can use their defaults. An initial NUS_UNIVUS_JWT and NUS_USER_ID are optional; Express can obtain a session token when they are absent.

LTA_ACCOUNT_KEY enables public-bus arrivals. Credentials are read only by the backend and must not be exposed through Vite environment variables or frontend builds. Live-data timeout, concurrency, retry count, retry delay, and shuttle refresh interval settings are range-checked by backend configuration.

On SIGINT or SIGTERM, Express stops accepting requests, aborts the poller and upstream requests, clears its refresh timer, and waits for active live-data operations to finish.
