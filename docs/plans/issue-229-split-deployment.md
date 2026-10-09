# Issue 229: split deployment implementation plan

Date: 2026-10-10. Status: planning only; no application code or deployment changed.

## Goal

Keep the React/Vite frontend on GitHub Pages, optionally under a custom domain, and deploy the NavUS HTTP backend on Vercel. Preserve Stops, Plan, map, and local development behavior. Keep NUS and LTA credentials, provider payloads, and Valhalla requests behind a server interface. Production release remains a separate approval and verification step.

## What has changed since #229

- npm workspaces already exist; `frontend` contains the app while `backend` and `shared` are placeholders. #230 is complete. The Pages workflow already deploys `frontend/dist` from `main`.
- `frontend/vite.config.ts` still hosts NUS arrivals, service windows, and LTA public-bus endpoints, plus an in-memory 30-second NUS snapshot scheduler. None exists in the Pages build.
- The three browser clients form API URLs from `import.meta.env.BASE_URL`. Production `base` is `/NavUS/`, so they request `/NavUS/api/...` on Pages, where there is no backend.
- The browser still creates the Journey planner and Valhalla adapter. Its production fallback is `http://localhost:8002`, a visitor's machine. The Vite proxy works only in local development.
- #265 and #266 delivered up to three bus-inclusive Journey candidates plus one walking-only candidate, with four selectable Plan/map options. #233's three-Journey wording is stale.
- Public-bus arrivals through LTA DataMall now exist. They must move out of Vite as part of this split, even though #229 originally excluded them.
- `shuttle-timing.json` is generated during build and ignored; `walking-stop-graph.json` is checked in. Frontend and backend deployments must use compatible versions of the canonical transit data and generated timing artifact.

## Target deployment

```text
Browser -> GitHub Pages: HTML, JS, CSS, public map/transit data
        -> Vercel HTTPS API: validated NavUS responses
           -> durable shuttle snapshot store and one refresh worker
           -> NUS and LTA providers
           -> authenticated Valhalla endpoint on a separate host
```

Give the frontend an explicit, absolute API origin per build environment. Do not derive it from Vite's asset `BASE_URL`. With Pages at `https://limzijing.github.io/NavUS/` or `https://app.example.com` and the API at `https://api.example.com`, requests are cross-origin. Allowlist the exact frontend origins, respond to `OPTIONS`, and test failure responses as well as successful ones. A custom domain does not make sibling subdomains the same origin. Browser location fixes remain local except frozen endpoint coordinates intentionally sent in a Journey request; avoid logging them.

Keep one canonical transit source. Put reusable transport contracts and pure validators in `shared`, provider adapters and secrets in `backend`, and public display data in the frontend. Package the backend's validated venue, transit, walking graph, and timing inputs from the same source revision as the Pages build. Expose or record a data version/hash and detect incompatible frontend/backend releases. Keep Valhalla behind the backend walking adapter, reachable through a secured route from Vercel.

## Vercel feasibility gate

Vercel runs Express as one Function, not a continuously running server. Instances can scale to zero. In-memory NUS sessions, timers, caches, and the 30-second atomically published snapshot cannot be the authoritative state across instances. Vercel cron has minute precision at best, Hobby cron allows only daily runs, and scheduled invocations can overlap or duplicate work. It cannot directly preserve the current 30-second refresh contract. `express.static()` is ignored by Vercel, which is fine because Pages serves static files. See [Express on Vercel](https://vercel.com/docs/frameworks/backend/express), [Functions lifecycle](https://vercel.com/docs/functions), and [cron management](https://vercel.com/docs/cron-jobs/manage-cron-jobs).

Before implementation, verify the actual Vercel plan, function region/duration/bundle limit, NUS and LTA outbound access and quota, Valhalla latency, and a secure Valhalla host. Select one snapshot design:

1. **Preferred while 30-second freshness is required:** a single persistent worker outside Vercel maintains provider sessions and publishes complete generations atomically to durable shared storage. Vercel reads the latest validated snapshot. The Valhalla host could also run the worker. Use locks/version checks, per-stop observation times, and expiry.
2. **Only after an explicit policy change:** reduce refresh frequency and use a scheduled or request-driven refresh with durable storage, bounded upstream work, and honest stale/unavailable states. Amend `docs/shuttle-timing.md` and issue acceptance criteria first.

If secure Vercel-to-Valhalla access, provider egress, or an affordable durable refresh design cannot be demonstrated, keep Pages and deploy the full backend on a persistent host. Do not weaken freshness or Journey validity silently. Vercel documents private-network Secure Compute as an Enterprise capability; verify the available plan before relying on it. See [Vercel security guidance](https://vercel.com/docs/security/compliance).

## Ordered work

| Phase | Work and acceptance gate | Issue |
| --- | --- | --- |
| 0. Hosting proof | Record plan/region, NUS/LTA egress, Valhalla connectivity, worker/store design, quotas, cost, URLs, and fallback. | #229, #236 |
| 1. Backend interface | Build Express app, health/config validation, server-only canonical loading, shared request/response validation, local Vite `/api` proxy, frontend API-origin setting, and exact CORS policy. Pages remains the static host. | #231 |
| 2. Live providers | Move NUS snapshots, service windows, and LTA arrivals out of Vite. Preserve atomic 30-second generations, 120-second expiry, per-stop observations, partial/total failure, valid no-arrivals, bounded upstream work, and safe logs using the selected durable design. | #237 |
| 3. Timing cutover | Point all three browser clients to the configured API origin. Preserve Stops/Journey shared generation ordering, stale display, service windows, and public-bus display-only behavior. Remove Vite handlers after tests pass. | #232 |
| 4. Journey cutover | Move planner orchestration and Valhalla adapter behind the backend. Preserve the current four-candidate pool, one-transfer limit, scoring, exact/bounded result, simulated time, cancellation, and complete geometry. Send endpoint IDs or frozen coordinates, not whole frontend state. | #233 |
| 5. Cleanup and deploy | Remove obsolete browser/Vite paths; align docs and worktree guidance; configure Pages, Vercel secrets, CORS, data version, rollout/rollback, and private smoke checks. | #235, #236, #102, #103 |

#234's benchmark harness is complete; reuse it to compare server-side correctness and latency. Keep #184 closed as duplicate. #102 remains the integrated private and release gate.

## Verification and rollout

- Keep one root local command for Vite, Express, and local Valhalla, plus targeted frontend/backend commands. Never generate timing through a preview-worktree symlink.
- Test backend HTTP contracts offline for malformed requests, no-arrivals, provider failure, partial/stale snapshots, service windows, LTA, CORS preflight, safe errors, and unsupported methods. Test worker locking, expiry, and atomic publication separately.
- Test Journey HTTP behavior for all four current option types, invalid endpoints, frozen coordinates, cancellation, upstream failures, complete geometry, and exact/bounded status. Benchmark in the target Vercel region against the Valhalla host.
- Build Pages for both the project path and chosen custom domain. Smoke-test served assets, Stops, Plan, public buses, map, cross-origin failures, no `localhost` or `/NavUS/api` requests, and no browser secrets.
- Deploy the backend privately first. Release the frontend against a compatible data version, retain both previous deployments for rollback, and record health, quotas, latency, and failure evidence in #102 before a public release decision.
- Each implementation ticket reports `npm test`, `npm run lint`, `npm run build`, and `git diff --check`. This plan has no runtime behavior to test.

## Issue updates and open decisions

Update #229's target; #231's single-origin/static-serving requirements; #237's in-process scheduler and LTA scope; #232's API-origin, CORS, and public-bus scope; #233's four-candidate and Valhalla-host requirements; #235's cleanup; #236's Oracle deployment target; and #102's split-origin release gate. #230, #234, and #266 are complete; #184 stays closed.

The maintainer still needs to choose the public frontend/API URLs, Vercel plan and region, worker/store and Valhalla host, and whether 30-second freshness remains mandatory. This plan assumes the existing 30-second policy until explicitly changed. No public deployment or credentials are authorized by this planning document.
