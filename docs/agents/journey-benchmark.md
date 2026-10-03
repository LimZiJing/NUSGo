# Journey benchmark CLI

Run the current planner in both benchmark modes with:

```sh
npm run benchmark:journey
```

The CLI prints a human-readable report followed by the complete JSON report. Defaults are 10 warmups and 2 measured samples per case. Select a mode or adjust counts with `--mode=offline`, `--mode=local`, `--samples=20`, and `--warmups=5`.

Pass absolute TypeScript adapter paths to compare algorithms from separate worktrees in one invocation:

```sh
npm run benchmark:journey -- \
  --adapter=/path/to/first-worktree/scripts/benchmark/adapter.ts \
  --adapter=/path/to/second-worktree/scripts/benchmark/adapter.ts
```

## Cases and measurements

`scripts/benchmark/cases.json` is the typed, validated source for exactly 50 named cases:

- 40 normal cases: 20 manually selected route pairs, 10 one-shuttle journeys, and 10 route-selection ties.
- 5 direct-walk fallback cases: missing arrivals, stale or expired arrivals, closed service, invalid shuttle timing, and a route requiring more than the transfer limit.
- 5 timing-profile cases: fresh arrivals, stale arrivals, headway fallback, before service, and after service.

The stale timing-profile case is 46 seconds old, beyond the current planner's 45-second live-arrival freshness cutoff; it expects a walking fallback.

Cases use the checked-in transit network, route geometry, venues, and walking graph. One fixed clock, arrival snapshots, timing profiles, and service windows are shared across adapters. The current and custom adapters receive each case's matching transit timing, arrival client, service-hours client, fixed clock, and the same instrumented local Valhalla route engine.

Search-only offline timing uses prepared in-memory walking connections and the case's fixed waiting provider; it must make zero Valhalla matrix or route requests. The CLI instruments every attempt, including requests that fail and whose errors an adapter catches; any offline request invalidates the sample and its matrix/route counts appear in the report. End-to-end timing invokes the full Journey service and reports local Valhalla matrix and route request duration separately from end-to-end wall time. Parallel request durations can add up to more than the wall time. `--valhalla-url` accepts only localhost, `127.0.0.1`, or `::1` over HTTP, with no credentials.

Each case reports mean, median, nearest-rank p95, measured sample count, result quality, and validation. Local cases also report Valhalla timing. Category and overall summaries average each case's mean equally, so a case with more samples cannot carry more weight. Validation checks endpoint continuity, route direction, geometry, walking metrics against prepared offline connections or captured local matrix results and the canonical stop graph, shuttle ride estimates against case timing records, and each wait against case arrivals, elapsed journey time, and service windows. It also checks expected modes and boardings, optional duration bounds, and exact route IDs for intentional tie cases. Timing is excluded from deterministic correctness assertions. Invalid outcomes and incomplete adapter runs are printed in full and make the CLI exit nonzero.

Treat timings as comparative measurements, not fixed performance guarantees. Host hardware and load, Node.js version, and the local Valhalla build and data can affect results. The JSON report does not capture this environment metadata, so record it alongside any published comparison and compare runs made under the same setup.

No-route, cancellation, and search-budget behavior remain separate non-timed resilience tests. The 50-case timed manifest requires Journey outcomes; missing arrivals are tested as a direct-walk fallback.

## Adapter contract

An adapter is a TypeScript module with this named factory export:

```ts
export const createJourneyBenchmarkAdapter = (context) => ({
  id: 'my-planner',
  label: 'My planner',
  createSearchRunner(caseContext) {
    return async (signal) => {
      // Run the pure in-memory planner using caseContext.benchmarkCase.searchInput.
      // Return { kind: 'journey', journey } or { kind: 'no-route', reason }.
    }
  },
  createJourneyRunner(caseContext) {
    // Build the full Journey service with caseContext.routeEngine,
    // caseContext.createArrivalClient(caseContext.benchmarkCase),
    // caseContext.createServiceHoursClient(caseContext.benchmarkCase),
    // and caseContext.now.
    return async (signal) => {
      // Run the service and return a Journey or explicit no-route outcome.
    }
  },
})
```

`context` provides the validated transit snapshot, venue map, walking stop graph, shared Valhalla route engine, fixed clock, per-case arrival and service-hours client factories, and complete case list. `caseContext` adds the selected case, expected result, prepared search input, and case-specific transit timing. Runners receive an `AbortSignal` and return either `{ kind: 'journey', journey }` or `{ kind: 'no-route', reason }`. Optional numeric, string, or boolean diagnostics may be attached to either result. Adapters must use the injected dependencies so comparisons use identical local inputs and Valhalla instrumentation.

Adapter IDs must be unique across all provided adapter paths. The CLI rejects duplicate IDs before starting any timed cases.

`scripts/benchmark/adapters/current.ts` is the reference adapter for the current priority-queue planner.

The benchmark's TypeScript helpers, adapters, and tests are included in the root TypeScript project references, so `npm run build` typechecks them with the application.
