# Live buses on the map and Load levels

Status: proposed

Date: 27/10/2026

Supersedes: the "live vehicle positions" exclusion in [ADR 0002](0002-nus-route-recommendation-architecture.md), for this feature only. Route recommendation stays as ADR 0003 describes; live positions and Load levels do not affect Path ranking.

## Context

Epic #500 adds moving buses to the map and a crowding colour on stop arrival times. The data source is the unofficial NUS NextBus API (`active-bus` and `shuttle-service`). Issue #487 checked it against real responses; see [the findings](../research/nus-active-bus-findings.md). The facts that shape these decisions:

- `active-bus` needs one call per route code and returns position, speed, heading and `loadInfo` for each bus.
- Positions change every 15 to 30 seconds. Load changes rarely, apparently after stops.
- `shuttle-service` carries no usable load (`passengers` is `"-"`), so load must come from `active-bus`.
- Joining arrivals to buses by plate works for most buses, not all.
- `crowdLevel` was only seen as `low` and `medium`. NUS does not document `loadInfo`.
- NUS has an Acceptable Use Policy and no published rate limit, so upstream traffic must stay modest.

## Decision

**Terms.** Add **Live bus**, **Load level** and **Load estimate** to `CONTEXT.md`.

**Load levels.** A fixed set: `low`, `medium`, `high`, `unknown`. `low`, `medium` and `high` map from NUS `crowdLevel`. `unknown` is used when the bus has no matching `active-bus` record, the fields are missing, or the value is not one of the three known levels. We never infer a level from `occupancy` ourselves.

**Transport.** The browser polls Express, as it does for arrivals. Express alone polls NUS, on a fixed cadence with a polling budget (#491). Streaming is rejected: the upstream is poll-only, so a stream would add moving parts without fresher data. Starting cadence is 30 seconds per route.

**Which routes are polled.** Express polls only routes that a client needs: the routes on the current Path, the selected route, and routes serving a selected stop. The map layer is off by default and shows those routes only. An "all routes" mode is out of scope until the polling budget has been measured, because every extra route is another upstream call per cycle.

**Stale positions.** Each Live bus carries the NUS `TimeStamp` and an Express observation time. A bus not refreshed for 90 seconds (three missed cycles) is hidden, not left frozen on the map. If a whole route fails to refresh, its buses expire the same way and the layer shows a short "Live buses unavailable" note. These numbers are starting values and can change after #491 is measured.

**Labelling.** Load is shown as an estimate ("Estimated crowding") because NUS does not document `loadInfo` as live passenger counts. We drop the word "estimate" only if NUS confirms the meaning.

**Accessibility.** Colour is never the only cue. Each Load level also gets text (Low, Medium, High, or no label for `unknown`) and a distinct icon or fill pattern. Colour tokens must keep contrast against both the arrival row and the map.

**Matching arrivals to buses.** Join by plate within the route, best effort. When there is no match, show the arrival time with no crowding cue (Load level `unknown`), never a guessed one.

## Consequences

- Positive: reuses the polling and snapshot patterns in Express, so the browser holds no NUS credentials and makes no upstream calls.
- Positive: `unknown` is a first-class level, so partial data degrades cleanly.
- Cost: polling only needed routes means the map can show fewer buses than are running.
- Cost: the 90-second expiry may hide a bus during a slow upstream spell. We accept that over showing wrong positions.
- Risk: the API is unofficial and could change; parsing must validate at the boundary and fail closed to `unknown`.
- Risk: the 30-second cadence and the polling budget are unverified against NUS limits.

## Open questions

1. Does NUS treat `loadInfo` as live passenger counts? Until answered, keep the "estimate" label.
2. What are the `crowdLevel` thresholds, and does `high` exist? No sample exceeded `medium`.
3. What is the unit of `speed`?
4. Can `active-bus` be called without a route code, to fetch all routes in one call?
5. Why do some `shuttle-service` plates not appear in `active-bus`?
6. What is the right polling budget (calls per minute) under the NUS Acceptable Use Policy?
7. Should an "all routes" mode ship later, and at what budget?
