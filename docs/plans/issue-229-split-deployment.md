# Issue 229: GitHub Pages frontend and Oracle Cloud backend plan

Date: 2026-10-10. Status: planning only; no application code or deployment changed.

## Goal

Keep the React/Vite frontend on GitHub Pages, with an optional custom domain, and run the NavUS HTTP backend on Oracle Cloud Infrastructure (OCI). Preserve Stops, Plan, public-bus display, local development, canonical data, and the current Journey behavior. Keep NUS/LTA credentials and Valhalla behind the backend. Production release remains a separate approval and verification step.

## What has changed since #229

- npm workspaces already exist; `frontend` contains the app while `backend` and `shared` are placeholders. #230 is complete. GitHub Actions already deploys `frontend/dist` from `main` to Pages.
- `frontend/vite.config.ts` still hosts the NUS snapshot scheduler, shuttle arrivals/service windows, and LTA public-bus endpoint. These handlers do not exist in the Pages deployment.
- The browser clients derive API paths from Vite's asset `BASE_URL`; production uses `/NavUS/`, so they request `/NavUS/api/...` on Pages where there is no backend.
- The browser still runs Journey planning and the Valhalla adapter. Its production fallback is `http://localhost:8002`, a visitor's machine. The Vite Valhalla proxy is development-only.
- #265/#266 delivered up to three bus-inclusive Journey candidates plus one walking-only candidate and a four-option Plan/map view. #233's original three-result wording is stale.
- LTA public-bus arrivals now exist and must migrate with the other Vite endpoints, even though #229 originally excluded them.
- `shuttle-timing.json` is generated and ignored; `walking-stop-graph.json` is checked in. Pages assets and backend inputs must come from compatible source revisions.

## Target deployment

```text
Browser -> GitHub Pages: HTML, JS, CSS, public map/transit data
        -> https://api.example.com: OCI reserved IP -> TLS reverse proxy
              /api/* -> long-running Express process
              Express -> NUS and LTA over HTTPS
              Express -> Valhalla on localhost/private VM network
```

Pages remains a separate origin from the API, including when using sibling custom subdomains. Configure a public, non-secret API origin at frontend build time and keep it separate from Vite's asset `BASE_URL`. Use exact CORS allowlists for the Pages project URL and chosen custom domain; handle `OPTIONS` and error responses. Use HTTPS. Keep browser location fixes local except frozen endpoint coordinates intentionally sent for Journey planning, and do not log those coordinates.

Use one OCI VM for the Express backend and private Valhalla in the prototype. Put a TLS reverse proxy such as Caddy or Nginx on the public HTTPS port; route `/api` to Express on loopback and keep Valhalla's port private. Restrict SSH to maintainer access and expose no NUS, LTA, or Valhalla port publicly. Assign a reserved public IP and point the API DNS name at it. Confirm the chosen OCI account tier, compute shape, home-region capacity, storage, backup, firewall, and cost before provisioning.

The Express process owns one 30-second NUS refresh scheduler and the atomically published in-memory snapshot, matching the existing single-process model. Run one backend instance; do not add replicas without shared storage and a distributed scheduler/lock. On process restart, the first refresh may leave arrivals temporarily unavailable until a complete new generation is ready. Health checks must distinguish process health from snapshot readiness. Keep service-window caches and NUS session state server-side. Valhalla runs on the same VM or private VCN and is called only by Express.

Keep the checked-in transit data as the canonical source. Put shared HTTP contracts and reusable pure validation in `shared`; backend-only NUS/LTA/Valhalla adapters and credentials belong in `backend`. Package the backend's venue, transit, walking graph, and generated timing inputs from the same commit as the Pages build. Record a data version/hash and detect incompatible deployments. Keep only public presentation data in the frontend.

If using OCI Always Free resources, account for home-region shape availability and idle-instance reclamation; do not promise uninterrupted production uptime based on the free tier. Oracle documents up to 2 Ampere OCPUs and 12 GB memory for Always Free and says an instance can be reclaimed after seven days below its CPU, network, and (A1) memory thresholds. A paid OCI account or a different service tier may be needed for reliable operation. Sources: [OCI Always Free resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm), [OCI public IP addresses](https://docs.oracle.com/en-us/iaas/Content/Network/Tasks/managingpublicIPs.htm).

## Ordered implementation

| Phase | Work and acceptance gate | Issue |
| --- | --- | --- |
| 0. OCI readiness | Choose account tier/shape/region; prove capacity; reserve IP and API DNS; record firewall, TLS, persistent process, backup, cost, and rollback approach. Verify VM resources can run Express plus Valhalla and the expected map data. | #229, #236 |
| 1. Backend seam | Build Express HTTP app, health/config validation, graceful shutdown, canonical-data loading, and shared contracts. Root development starts Vite, Express, and local Valhalla; add targeted commands and a local Vite `/api` proxy. Configure explicit API origin and CORS. | #231 |
| 2. Move live providers | Move NUS arrivals/snapshot, service windows, and LTA arrivals from Vite into backend modules. Keep one refresh scheduler and preserve atomic 30-second generations, per-stop observation times, 120-second expiry, partial/total failure distinctions, and bounded upstream work. | #237 |
| 3. Cut over browser timing | Point the NUS, service-window, and LTA clients to the configured API origin. Preserve generation ordering, stale display, Stops service windows, and public-bus display-only behavior. Remove Vite handlers after the browser checks pass. | #232 |
| 4. Move Journey planning | Move planner orchestration and the Valhalla adapter behind Express. Preserve the current four-candidate pool, one-transfer limit, scoring, exact/bounded semantics, cancellation, simulated-time development behavior, and complete geometry. | #233 |
| 5. Clean and deploy | Remove obsolete browser/Vite server paths. Align commands, docs, worktree guidance, data versioning, Pages build configuration, OCI provisioning/deploy configuration, secrets, proxy/TLS/firewall, monitoring, backups, rollback, and private smoke checks. | #235, #236, #102, #103 |

#234's benchmark harness is complete; reuse it to compare planner correctness and latency. Keep #184 closed as duplicate. #102 remains the integrated private and release gate.

## Verification and rollout

- Keep one root local command for Vite, Express, and local Valhalla, plus targeted frontend/backend commands. Never generate timing through a preview-worktree symlink.
- Test backend HTTP behavior offline for malformed requests, no-arrivals versus provider failure, partial/stale snapshots, service windows, LTA, CORS preflight, safe errors, and unsupported methods. Test scheduler atomic publication and shutdown separately.
- Test Journey HTTP behavior for up to four candidates, invalid endpoints, frozen coordinates, cancellation, provider failure, complete geometry, and exact/bounded status. Benchmark on the OCI VM with its intended Valhalla data/profile.
- Build and smoke-test the Pages project path and chosen custom-domain build against the OCI API: Stops, Plan, public buses, map assets, CORS failures, no `localhost` or `/NavUS/api` requests, and no secrets in browser assets.
- Deploy privately first. Verify HTTPS and DNS, reverse-proxy routing, VM restart/recovery, health/readiness, secure Valhalla reachability, provider quotas, logging, backups, and rollback. Record evidence in #102 before a public release decision.
- Each implementation ticket reports `npm test`, `npm run lint`, `npm run build`, and `git diff --check`. This plan has no runtime behavior to test.

## Issue updates and remaining choices

Related issue scopes: #231 builds the local Express foundation; #237 moves NUS snapshots, service windows, and LTA arrivals to the persistent process; #232 switches the browser clients to the cross-origin API; #233 moves the current four-candidate planner and private Valhalla calls behind Express; #235 removes obsolete Vite paths and updates guidance; #236 owns OCI provisioning and deployment; and #102 owns private verification and the release gate. #230, #234, #265, and #266 are complete; #184 stays closed.

The maintainer still needs to choose OCI account tier and region/shape, API DNS name, whether to use a custom Pages domain, and backup/availability expectations. This plan assumes a single OCI VM for the prototype and the current 30-second freshness policy. No public deployment or credentials are authorized by this planning document.
