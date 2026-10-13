# Pathfinding

`findPaths(request, dependencies)` is the frontend entry point for producing complete `Path` values. It receives resolved endpoint references and validated canonical transit data, then runs five stages in order:

1. `pipeline/resolve-path-endpoints.ts` resolves venue and stop IDs, or keeps the coordinate frozen in a Current location endpoint.
2. `pipeline/select-walking-connections.ts` keeps direct walks, directed endpoint connectors, and stop-to-stop transfers. `walking/walking-connections.ts` combines two endpoint matrix requests with the validated directed stop graph.
3. `search/` builds route and timing indexes, enumerates direct walk, one-bus, and one-transfer candidates, ranks them, and enforces cancellation and search budgets.
4. `pipeline/apply-bus-waits.ts` replaces preliminary zero-wait estimates with a separate time-dependent wait at every boarding, checks service windows, and removes only candidates whose timing is unavailable or invalid.
5. `pipeline/complete-path-geometry.ts` fetches and caches routed walking shapes, validates them, and skips incomplete candidates so the next ranked option can fill its category quota.

Search uses straight-line placeholders only to represent walking legs while ranking candidates. Those placeholders never leave `findPaths`: only complete candidates with validated Valhalla geometry are returned. A search status of `complete` means the supported connector and transfer space was exhausted; `bounded` means a time, candidate-count, or geometry budget ended the search. Cancellation remains a distinct outcome.

There are two rankings. The core search score uses adjusted duration, then fewer bus boardings, shorter walking distance, fewer legs, and a lexical stop sequence. The Plan feature separately applies its bus-first display rule: it can show up to three bus-inclusive Paths and one walking-only Path, and walking leads only when its adjusted duration is strictly below 80% of the fastest bus Path.

The app composition injects the walking route engine, required walking-connection provider, timing callbacks, clocks, cooperative yield function, and `AbortSignal`. Requiring the provider keeps production searches on the two-endpoint-matrix plus directed-stop-graph topology. The Pathfinding modules do not own the navigation session's request identity, Plan display selection, React state, or MapLibre layers. This keeps the same calculation seam usable when #233 moves execution to the backend.
