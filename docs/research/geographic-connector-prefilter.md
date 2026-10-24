# Geographic connector prefilter research

Date: 2026-10-23

Issue: [#425 — research geographic connector prefiltering](https://github.com/LimZiJing/NavUS/issues/425)

Status: research only; no production prefilter is implemented by this work.

## Question

Can a straight-line geographic shortlist reduce the endpoint-to-stop Valhalla matrix work while preserving the routed walking connectors currently considered by the journey search?

## Finding

The tested shortlists reduced cells per endpoint-direction matrix and were faster in this local sequential sample, but none retained every full-network top-five connector at every endpoint. Even k=12 missed one of the five routed connectors for Temasek Hall in each direction. Treat these results as evidence against adopting k=5, 8, or 12 as an exact-behavior prefilter. A future prefilter needs a correctness-preserving lower bound or a fallback to the full matrix; this sample cannot establish a globally safe threshold.

The current production cap of five is applied after the full endpoint matrices are fetched and candidates are ranked by routed duration, distance, and stable endpoint keys. It is not a geographic shortlist. The source requests the origin-to-stop and stop-to-destination matrices concurrently; the endpoint matrix work therefore remains until filtering moves before the provider boundary. See `backend/src/pathfinding/pipeline/select-walking-connections.ts:65-86`, `backend/src/pathfinding/search/path-search-types.ts:178`, and `backend/src/pathfinding/walking/walking-connections.ts:114-147`.

## Current provider-boundary cell count

For a validated complete canonical stop graph, the current provider sends these live matrix cells before connector ranking. “Non-stop” includes a venue/building endpoint and a current-location endpoint.

| Origin → destination | Live matrix cells | Matrix shape |
| --- | ---: | --- |
| Stop → stop | 0 | Directed pair comes from the static stop graph |
| Non-stop → stop | 33 | Origin → all stops, including the destination stop |
| Stop → non-stop | 33 | All stops → destination |
| Non-stop → non-stop | 67 | Origin → 33 stops plus direct destination (34); 33 stops → destination (33) |

The existing provider keeps a stop-stop directed pair in a live matrix query if that directed key is absent from the loaded graph; this research assumes the normal validated complete graph and does not change graph validation or fallback behavior. The selected walking-route geometry is fetched separately after connector selection; these matrix-cell counts do not include geometry requests or imply they can be skipped.

## Method

The experiment made direct read-only POST requests to the already-running local Valhalla `sources_to_targets` pedestrian matrix endpoint. It froze 20 endpoint coordinates: 16 building centroids or provisional entrances selected from the checked-in buildings data, plus four synthetic current-location coordinates spanning the west/south, UTown/north, PGP/south-east, and Bukit Timah edges. Each endpoint was tested in both directions: endpoint-to-stops and stops-to-endpoint. For each direction it queried all 33 stops and the geographically nearest 5, 8, and 12 stops by Haversine distance. Each query was one-to-many or many-to-one, not a set of individual route calls. Matrix request order rotated across the four sizes per endpoint and direction.

The 160 requests returned HTTP 200 with all requested cells reachable. The recorded CSV contains 2,320 matrix-cell observations (40 calls per size: 33, 5, 8, or 12 cells per call). It records endpoint and stop coordinates, direction, shortlist size, request elapsed time, and rounded routed duration/distance. Elapsed time covers the request through response-body read; it excludes application ranking, path search, and route-geometry calls.

The raw run used `bus-stops.json`. Before freezing this report, its 33 stop IDs and coordinates were compared with `shuttle-network.json`; there were zero mismatches. The original measurement hashes were bus-stops snapshot `46907fcb264785d40fbc515fa3055c5d401c7638c45891765747ae2b3f0bb136` and buildings `8377848cf85f9b6c5eb49e6aa825eac79167f782c8e4ced654dbd18bc0ca480e`. The replay script verifies canonical shuttle-network hash `8997d813c8ef3c3d0b7acfe163c06eb3ddb936bfbb0357d0d7fcea5c51d8d14f` and checks exact stop-coordinate equivalence against the bus-stop snapshot.

For each direction, the full 33-stop matrix was ranked using the application rule: routed duration, then routed distance, then stop key, with the same codepoint text comparison as the application. The measured question is whether the IDs in the full-network routed top five appear in each geographic shortlist. The “best walking connector gap” is only the difference between the fastest full-network and shortlist walking connectors for that endpoint; it is not a whole-journey or selected-path equivalence measure.

## Results

Each latency cell summarizes 20 successful calls. Times are milliseconds; p95 uses the nearest-rank percentile.

| Direction | Stops per matrix | Cells across 20 calls | Median | p95 | Max |
| --- | ---: | ---: | ---: | ---: | ---: |
| Endpoint → stops | 33 | 660 | 172.94 | 296.98 | 772.30 |
| Endpoint → stops | 5 | 100 | 46.27 | 88.36 | 162.75 |
| Endpoint → stops | 8 | 160 | 55.97 | 79.89 | 117.14 |
| Endpoint → stops | 12 | 240 | 65.68 | 77.22 | 240.62 |
| Stops → endpoint | 33 | 660 | 177.95 | 216.74 | 250.54 |
| Stops → endpoint | 5 | 100 | 48.55 | 72.26 | 99.40 |
| Stops → endpoint | 8 | 160 | 56.03 | 81.15 | 127.56 |
| Stops → endpoint | 12 | 240 | 65.28 | 86.58 | 157.70 |

| Geographic k | Direction | Full top-five entries retained | Endpoints retaining all five | Full top-one omitted | Max best-connector gap |
| ---: | --- | ---: | ---: | ---: | ---: |
| 5 | Endpoint → stops | 83/100 | 7/20 | 1/20 | 64 s |
| 5 | Stops → endpoint | 83/100 | 7/20 | 1/20 | 64 s |
| 8 | Endpoint → stops | 98/100 | 18/20 | 0/20 | 0 s |
| 8 | Stops → endpoint | 98/100 | 18/20 | 0/20 | 0 s |
| 12 | Endpoint → stops | 99/100 | 19/20 | 0/20 | 0 s |
| 12 | Stops → endpoint | 99/100 | 19/20 | 0/20 | 0 s |

At k=5, Temasek Hall’s fastest full-network connector, LT13-OPP, was seventh by straight-line distance. Its full routed walk was 548 seconds; the fastest retained connector was 612 seconds, a 64-second proxy gap. At k=8, PGP Residence 1 and Temasek Hall each lost one non-best member of their full top five. At k=12, Temasek Hall still lost SDE3-OPP, the thirteenth-nearest stop. Thus even the largest tested shortlist did not preserve the exact routed top five.

The full-network directional results also differed: 227 of 660 paired endpoint-stop cells had different rounded duration or distance when direction was reversed. The full top-five sets differed for one endpoint. A future shortlist must rank each direction independently; reverse-direction costs cannot be reused as a proxy.

For the connector cells alone, one matrix call per direction remains at every k; cells fall from 33 to k. In the current non-stop-to-non-stop provider shape, the origin matrix additionally carries the direct origin-to-destination cell, which this stop-connector comparison does not shortlist. So the tested connector-cell reduction would be 66 to 2k per journey, while the direct cell remains. Valhalla’s matrix API supports one-to-many and many-to-one source/target matrices; see its [official matrix API reference](https://github.com/valhalla/valhalla-docs/blob/master/matrix/api-reference.md).

## Limits and implication

This was a modest, frozen local sample, not a random sample of all possible venues or current locations. The synthetic coordinates are test points, not observed users. The existing Valhalla service and tile cache were already warm; calls ran sequentially in a rotated size order. Production invokes the two directional matrices concurrently, so these individual call latencies do not predict the full request’s critical path, nor isolate server CPU, cache, or network effects. The measurements do not quantify full journey quality or prove a safe geographic radius. No service configuration or source code was changed.

Recommendation for issue #425: keep the full lookup until a conservative correctness argument and a fallback strategy are demonstrated. Any future experiment should include additional endpoints, especially boundary, sparse-stop, and water/road-barrier cases, and compare the complete selected journey rather than only connector candidates.

For an exact connector-behavior claim, the minimum acceptance threshold is 100% retention of the full routed top-five set at every tested endpoint in both directions. Passing that bar in a finite sample is necessary, not proof of global safety or whole-journey equivalence. The tested k=5, 8, and 12 all fail this minimum.

An environment status check during this investigation reported Valhalla 3.5.1. The benchmark did not capture a tile-data fingerprint, so later results may differ if the local graph tiles change.

## Reproduction

From the repository root, run the benchmark script only when the existing local Valhalla at 127.0.0.1:8002 is intentionally available for 160 sequential requests:

    node docs/research/geographic-connector-prefilter-benchmark.mjs --run --output=<temporary-csv-path>

It verifies the frozen canonical-data hashes and the exact stop-coordinate equivalence before sending requests. It does not start or reconfigure Valhalla. Analyze the committed observations without any service calls using:

    node docs/research/geographic-connector-prefilter-analyze.mjs docs/research/geographic-connector-prefilter-observations.csv

The analyzer checks finite metrics, complete expected matrix groups, and a hand-worked ranking self-check (duration outranks distance; distance breaks a duration tie; stop key breaks a complete tie). It emits latency, retention, and directionality summaries as JSON.
