# Three-stop single-shuttle recommendation

Status: accepted

Date: 2026-10-02

Supersedes: the application candidate-search scope in [ADR 0002](0002-nus-route-recommendation-architecture.md).

## Context

ADR 0002 established a provider-neutral Journey model and initially allowed the
planner to search paths with multiple shuttle boardings and walking transfers.
The current application needs a bounded comparison whose connector set and
boarding timing can be explained directly. This decision narrows the planner's
candidate search while keeping the walking provider, canonical transit model,
Journey legs, and timing contracts unchanged.

## Decision

For each venue endpoint, the application selects up to three reachable shuttle
stop connectors with the shortest directed Valhalla walking durations. There is
no five-minute cutoff. A user-selected shuttle stop remains the fixed endpoint
for planning and is not replaced by another stop connector.

The planner compares:

1. the direct walking connection between the trip endpoints; and
2. every valid directed single-shuttle ride between the selected origin and
   destination stop connectors.

It does not compose stop-to-stop walking paths, transfers, or shuttle
reboardings. Each candidate shuttle boarding receives its own waiting estimate
at the time the traveler reaches the boarding stop. Route service windows are
checked at the expected boarding time. Missing shuttle timing removes only that
shuttle candidate; a valid direct walking journey remains eligible.

Candidates use the established deterministic ranking: total estimated
duration, fewer shuttle boardings, shorter walking distance, fewer Journey
legs, then the lexical route and stop sequence. Browser planning remains
cancellable and bounded. An `exact` result means all candidates in this
supported comparison were evaluated. It does not claim a global fastest route
across all stops or journeys with transfers. The result UI labels journeys
`Recommended` and does not present them as globally fastest.

## Consequences

- The application evaluates at most nine venue-connector pairs before
  considering each route's valid directed rides.
- Longer walking connectors remain eligible when they are among the three
  fastest reachable connectors for that endpoint.
- Journey geometry, request cancellation, live-arrival failures, service-hour
  failures, and the direct-walk fallback retain their existing boundaries.
- Journeys that require transfers or a fourth-best connector are outside this
  recommendation. Expanding the candidate set requires a separate decision and
  timing/performance review.
