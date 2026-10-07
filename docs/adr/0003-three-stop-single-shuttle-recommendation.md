# Bounded scored Journey candidate pool with one transfer

Status: accepted

Date: 2026-10-06

Supersedes: the application candidate-search scope in [ADR 0002](0002-nus-route-recommendation-architecture.md) and the previous single-shuttle decision in this ADR.

## Context

The planner needs to compare alternatives across directed walking connectors,
shuttle rides, and one transfer while keeping planning time predictable. Issue
#266 defines candidate generation and scoring. Issue #265 owns the subsequent
bus-first selection and display policy, so candidate ranking and display
selection remain separate steps.

## Decision

For each venue endpoint, select at most five reachable directed walking
connectors by estimated duration. Keep direct endpoint-to-endpoint walking as
an option. A user-selected shuttle stop remains fixed and is not replaced by a
connector. Stop-to-stop walking links come from the validated directed walking
graph.

The planner may generate journeys with zero, one, or two shuttle boardings. A
two-boarding journey must transfer by walking to a different route. A journey
cannot revisit a stop or planning state, and a route cannot be boarded again
after a transfer. Each boarding uses its time-dependent wait estimate at the
expected arrival time. A missing or invalid timing record removes that
candidate without removing valid alternatives.

Rank candidates by adjusted duration:

- each walking leg contributes `durationSeconds / 0.8`;
- the first shuttle leg contributes its wait plus ride duration unchanged;
- each shuttle leg after a transfer contributes `(wait + ride) / 0.9`;
- other leg durations contribute unchanged.

The score is the reciprocal of adjusted duration. Deterministic tie-breaks use
fewer boardings, shorter walking distance, fewer Journey legs, then the lexical
route and stop sequence. Bus candidates are distinct by ordered route legs and
boarding/alighting stop IDs; different walking approaches alone do not make a
new bus candidate.

The planner returns up to three distinct bus-inclusive candidates plus the
highest-ranked walking-only candidate. Candidate generation does not apply
#265's bus-first display policy. The display layer may choose at most three
Journeys from this pool, using adjusted duration for its bus ranking and
walking exception.

Candidates require complete timing and routed walking geometry. If geometry
is missing or invalid, skip that candidate and examine the next-ranked
candidate until its category quota is filled, the search is exhausted, or the
budget ends. Duplicate walking route requests are shared across candidates.

Search is bounded by 350 ms and 10,000 expanded candidate paths, including
indexing and candidate generation. The planner indexes directed walking links
and ride timing, checks cancellation and elapsed time during enumeration, and
yields during browser searches. Route-stop projections are cached per route
and stop so candidate rides reuse geometry work. Cancellation remains distinct
from budget exhaustion. When a search or geometry-enrichment budget is reached,
return only complete best-so-far candidates and mark them `bounded`. An
`exact` candidate pool means the supported search completed; it is not a
global optimum across connectors outside the five selected or journeys with
more than one transfer.

## Consequences

- Up to five origin and five destination venue connectors produce at most 25
  endpoint combinations before route alternatives are considered.
- One transfer expands the supported set without eagerly materializing every
  full path; indexed joins and the shared path/time budget constrain work.
- Navigation state retains the candidate pool while the map and current
  recommendation continue to use its highest-ranked complete Journey.
- #265 can apply its bus-first policy without changing planner scoring or
  candidate generation.
- Benchmark comparisons use identical deterministic fixtures and the
  `d18386c` baseline adapter. Offline mode isolates planner cost; local mode
  measures the service including walking matrix and routed geometry calls.
