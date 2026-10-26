# Bounded scored Path candidate pool with one transfer

Status: accepted

Date: 2026-10-06

Supersedes: the application candidate-search scope in [ADR 0002](0002-nus-route-recommendation-architecture.md) and the previous single-shuttle decision in this ADR.

## Context

The Pathfinding engine needs to compare alternatives across directed walking
connectors, bus rides, and one transfer while keeping planning time predictable.
Candidate generation and scoring stay separate from bus-first selection and
display policy. The current code uses `Path`, `PathLeg`,
`ScoredPathCandidate`, and `BusRoute` as its canonical terminology.

## Decision

For each venue endpoint, select at most five reachable directed walking
connectors by estimated duration. Keep direct endpoint-to-endpoint walking as
an option. A user-selected stop endpoint remains an exact zero-walk option and
may connect to at most one other stop through a validated directed walking
link, for two nearby stops total including the selected stop. If its paired
opposite stop has a valid walking connection in the required direction, prefer
that stop; otherwise use the shortest estimated walking connector. This applies
to both origin boarding and destination egress. Stop-to-stop walking links come
from the validated directed walking graph.

Applying this cap to destination egress is a deliberate change from the previous
allowance of five incoming connectors. That allowance could admit destination
approaches through stops beyond the intended two-stop neighborhood. Applying
the same cap at both selected endpoints keeps the exact stop available while
allowing access from one valid directed neighbor, usually the paired opposite
stop. Issue #505's clarified acceptance applies this rule to both selected
origins and destinations; it supersedes the earlier #296 requirement to
preserve selected-stop connector fan-out, while keeping exact-stop routes
available. The tradeoff is that paths requiring a second or non-paired
destination connector are no longer considered.

The engine may generate Paths with zero, one, or two bus boardings. A
two-boarding Path must transfer by walking to a different route. A Path
cannot revisit a stop or planning state, and a BusRoute cannot be boarded again
after a transfer. Each boarding uses its time-dependent wait estimate at the
expected arrival time. A missing or invalid timing record removes that
candidate without removing valid alternatives.

Rank candidates by adjusted duration:

- each walking Path leg contributes `durationSeconds / 0.8`;
- the first bus leg contributes its wait plus ride duration unchanged;
- each bus leg after a transfer contributes `(wait + ride) / 0.9`;
- other Path leg durations contribute unchanged.

The score is the reciprocal of adjusted duration. Deterministic tie-breaks use
fewer boardings, shorter walking distance, fewer Path legs, then the lexical
route and stop sequence. Bus candidates are distinct by ordered BusRoute legs and
boarding/alighting stop IDs; different walking approaches alone do not make a
new bus candidate.

The engine returns up to three distinct bus-inclusive candidates plus the
highest-ranked walking-only candidate. Candidate generation does not apply
the separate bus-first display policy. Plan may display up to four Paths: up to three
bus-inclusive Paths plus one walking-only Path. It ranks bus Paths by adjusted
duration and places the walking Path first only when its adjusted duration is
strictly below 80% of the fastest bus Path; otherwise it follows the bus
options.

Path candidates require complete timing and routed walking geometry. If geometry
is missing or invalid, skip that candidate and examine the next-ranked
candidate until its category quota is filled, the search is exhausted, or the
budget ends. Duplicate walking route requests are shared across candidates.

Search is bounded by 350 ms and 10,000 expanded Path candidates, including
indexing and candidate generation. The engine indexes directed walking links
and ride timing, checks cancellation and elapsed time during enumeration, and
yields to the event loop during searches. Route-stop projections are cached per route
and stop so candidate rides reuse geometry work. Cancellation remains distinct
from budget exhaustion. When a search or geometry-enrichment budget is reached,
return only complete best-so-far candidates and mark them `bounded`. An
`exact` candidate pool means the supported search completed; it is not a
global optimum across connectors outside the selected endpoint limits or Paths
with more than one transfer.

## Consequences

- Up to five origin and five destination venue connectors produce at most 25
  endpoint combinations before route alternatives are considered. A selected
  stop endpoint keeps its exact stop plus at most one walkable alternative.
- One transfer expands the supported set without eagerly materializing every
  full path; indexed joins and the shared path/time budget constrain work.
- Navigation state retains the candidate pool while the map and current
  recommendation continue to use its highest-ranked complete Path.
- The Plan display policy can apply bus-first ordering without changing
  planner scoring or candidate generation.
- Benchmark comparisons use identical deterministic fixtures and the
  `d18386c` baseline adapter. Offline mode isolates planner cost; local mode
  measures the service including walking matrix and routed geometry calls.
