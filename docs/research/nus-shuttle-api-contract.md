# NUS shuttle API contract

Status: implementation contract verified from the checked-in adapter and test
fixtures. A controlled live check on 2026-10-16 confirmed the provider stop name
needed for Botanic Gardens MRT; the private API wire format is not public.

## What the upstream service provides

The official [uNivUS Bus Arrival guide](https://about-univus.nus.edu.sg/univus-tips/)
confirms that NUS provides real-time internal shuttle timings and journey
planning. It does not publish the private mobile API wire format used by this
project. The request fields below are therefore recorded as implementation
evidence, not as a public NUS API specification.

## Server-side request contract

Express owns all NUS requests. The browser calls the `/api/shuttle-arrivals`
and `/api/shuttle-service-windows` endpoints; Vite proxies those paths to
Express during local development.

| Operation | Upstream request | Normalized result |
| --- | --- | --- |
| Shuttle arrivals | `POST /univus/api/bus-proxy/shuttle-service` with `busstopname` plus the common session body | Stop ID, observed time, cache expiry, route IDs, upcoming arrival seconds, and optional headway |
| Service windows | `POST /univus/api/bus-proxy/route-min-max-time` with `route_code` plus the common session body | Route ID and validated service-window rows |
| Access token | `POST` to `NUS_ACCESS_TOKEN_URL` with `deviceid`, `ipaddr`, and `version` | `data.token`, `data.userid`, and `data.domain` |

The common upstream request includes `deviceid`, `domain`, `ipaddr`, `token`,
`userid`, and `version`. The server sends the configured `X-HTD-API`,
`X-APP-API`, and `X-API-KEY` headers. Shuttle requests also send
`Authorization: Bearer <token>`.

The `busstopname` value comes from `bus-stops.json`, matched by its `name` ID.
This is the NUS provider label; it can differ from the display label in
`shuttle-network.json`. For example, NUS expects `Botanic Gardens MRT (PUDO)`
for `BG-MRT`. Sending the network display label `Botanic Gardens MRT` returns
`Record not found`, which prevents the first complete snapshot from publishing.

These details are implemented in the [Express live-data runtime](../../backend/src/live-data/runtime.ts),
[NUS client](../../backend/src/live-data/nus-client.ts), and the command-line
probe in [nus-bus-stops.ps1](../../scripts/nus-bus-stops.ps1).

## Authentication and retries

- A configured bootstrap session is reused in memory.
- If the upstream response contains code `10011`, the server refreshes the
  session once and retries the original request once.
- Concurrent expired requests share one refresh request.
- If the refreshed session is also expired, the request fails with
  `NusSessionExpiredError`.
- Network errors, malformed JSON, and other HTTP failures are not retried
  automatically.

The tests for this behavior are in
[client.test.ts](../../frontend/src/infrastructure/nus-api/client.test.ts).

## Normalized arrival contract

The browser-facing snapshot contains:

- parseable `observedAt` and `expiresAt` timestamps, with expiry after
  observation;
- non-negative, sorted, duplicate-free arrival seconds;
- `nextArrivalSeconds`, set to the first upcoming arrival;
- a headway only when its values are finite, ordered, positive, and supported
  by at least one positive gap between upcoming arrivals; and
- stop and route entries that can be partial when only some upstream data is
  available.

Invalid route entries are removed. An invalid snapshot envelope is rejected.
If no requested stop has usable data, the client reports that no arrival data
is available.

The provider parser is in
[shuttle-arrivals/response.ts](../../frontend/src/infrastructure/shuttle-arrivals/response.ts).
The browser-side boundary validation is in
[shuttle-arrivals/client.ts](../../frontend/src/infrastructure/shuttle-arrivals/client.ts).

## Freshness and failures

- The server cache uses the 30-second application cache and freshness window.
  The provider contract and response validation remain unchanged.
- Expired upstream data is not returned as normal live data.
- A failed refresh removes only the affected stop from the normalized result.
- If every requested stop fails, the server returns HTTP 503.
- Malformed service-hour envelopes also fail closed with HTTP 503.
- Individual malformed service-hour rows are ignored; valid rows remain usable.

This prevents stale or malformed data from silently becoming a live Journey
waiting estimate. The recommended 30-second and 120-second policy limits are
documented in [shuttle-timing.md](../shuttle-timing.md); the 120-second limit
is reserved for diagnostics or retry handling and is not used to rank a normal
Journey.

## Safe configuration

Configuration names and local setup are listed in [.env.example](../../.env.example).
Secret values must stay in the local environment or approved private test
environment. They must not be committed, placed in `VITE_*` variables, sent to
the browser, or recorded in an issue or research note.

Private endpoint verification and reproducible live smoke steps require a
controlled test environment with authorized credentials. Journey candidate
ranking is handled by the Pathfinding service.
