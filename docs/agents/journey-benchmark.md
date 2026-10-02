# Journey benchmark CLI

Run the current planner in both benchmark modes with:

```sh
npm run benchmark:journey
```

The CLI prints a short human summary followed by a delimited JSON report. It uses 10 measured samples and 2 warmups per case by default. Select one mode or adjust counts with `--mode=offline`, `--mode=local`, `--samples=20`, and `--warmups=5`.

Pass absolute TypeScript adapter paths to compare algorithms from separate worktrees in one invocation:

```sh
npm run benchmark:journey -- \
  --adapter=/path/to/first-worktree/scripts/benchmark/adapter.ts \
  --adapter=/path/to/second-worktree/scripts/benchmark/adapter.ts
```

## Cases and measurements

The three fixed cases are a direct walk from Museum to UTown, a one-shuttle ride from Oei Tiong Ham to UTown, and a short direct venue walk between two RC3 rooms. The venue case receives an empty shuttle-arrival snapshot, so its expected walking result does not depend on an algorithm's endpoint eligibility cutoff. Each case has fixed shuttle-arrival input and an expected outcome, ordered modes, and shuttle boarding count. Fixtures, validation, adapter construction, and runner construction happen outside measured samples.

Search-only offline timing calls the algorithm with an in-memory walking graph and fixed waiting provider. It makes no routing requests. The no-eligible-shuttle case has a deterministic direct walking connection between its two fixture venues.

End-to-end timing calls the adapter's full Journey service with the same instrumented Valhalla route engine and per-case fixed arrival client for every adapter. `--valhalla-url` accepts only localhost, `127.0.0.1`, or `::1` over HTTP, with no credentials. Valhalla time reports the sum of local matrix and route request durations separately from end-to-end wall time; parallel request durations can add up to more than that wall time.

Each case reports mean, median, nearest-rank p95, sample count, result type, Journey planning quality, and validation status. The headline mean is the equal-weight average of the three per-case means. Every output is checked against Journey endpoint continuity, leg metrics, geometry, shuttle route order, and the case-specific expectations. A no-route outcome is valid only for a case that expects no route.

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
    // Build the full Journey service with context.routeEngine,
    // context.createArrivalClient(caseContext.benchmarkCase), and context.now.
    return async (signal) => {
      // Run the service and return a Journey or explicit no-route outcome.
    }
  },
})
```

`context` provides the validated transit snapshot, venue map, walking stop graph, shared Valhalla route engine, fixed clock, per-case fixed arrival client factory, and complete case list. `caseContext` adds the selected case, expected result, and prepared search input. Runners receive an `AbortSignal` and return either `{ kind: 'journey', journey }` or `{ kind: 'no-route', reason }`. Optional numeric, string, or boolean diagnostics may be attached to either result. Adapters must use the injected route engine and arrivals so every comparison uses identical local inputs and Valhalla instrumentation.

`scripts/benchmark/adapters/current.ts` is the reference adapter for the current priority-queue planner.
