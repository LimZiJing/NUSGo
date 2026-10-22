# Running the frontend, Express, and Valhalla separately

NavUS has three local processes: the static frontend, the Express API, and the private Valhalla walking service. Express owns API routes, provider credentials, live-data polling, and Journey calculations. Vite owns the frontend development server and, during development only, forwards `/api` requests to Express.

The root `npm run dev` command is a convenience that starts Vite, Express, and Valhalla together. The steps below exercise the same services as separate processes, including a built frontend.

## Local built-frontend rehearsal

Prerequisites are Node.js 22 or later, npm, and Docker Desktop with Docker Compose.

1. Install dependencies and start private Valhalla:

   ```bash
   npm install
   npm run valhalla:up
   ```

   On its first run, Docker downloads map data and builds routing tiles.

2. Copy `backend/.env.example` to `backend/.env`. The example points Express at the repository's canonical data directory and uses the local `development` data version. Set provider credentials there only when live NUS or LTA data is needed.

3. Build the local frontend bundle:

   ```bash
   npm run build:local-rehearsal
   ```

   The command uses the loopback API address in the checked-in `.env.local-rehearsal` profile and writes files to `frontend/dist-local-rehearsal`. It also generates the ignored shuttle-timing file. This bundle is for local rehearsal and must not be uploaded as the hosted Pages build.

4. In one terminal, start Express:

   ```bash
   npm run dev:backend
   ```

   Express reads `backend/.env` and loads its canonical data directly from disk. It does not need Vite to be running.

5. In another terminal, serve the built frontend:

   ```bash
   npm run preview:local-rehearsal
   ```

   The frontend is served at `http://127.0.0.1:5173` and sends API requests to `http://127.0.0.1:3001`. The sample backend CORS allowlist already includes this frontend address. If you change the preview address, add that exact origin to `API_CORS_ORIGINS` in `backend/.env`.

6. Open `http://127.0.0.1:3001/api/health` to check process health and `http://127.0.0.1:3001/api/ready` to check whether the API can serve requests. Stop each process with Ctrl+C, then stop Valhalla with `npm run valhalla:down`.

With provider credentials unset, Express can still serve the app and calculate walking Paths, but live NUS and LTA arrivals are unavailable. `LTA_ACCOUNT_KEY` enables public-bus arrivals; NUS live arrivals require the four NUS values documented in `backend/.env.example`.

## Canonical data and version matching

Express reads the following files from `NAVUS_DATA_DIR`:

- `venues.json`
- `buildings.json`
- `shuttle-network.json`
- `shuttle-routes.geojson`
- `shuttle-timing.json`
- `walking-stop-graph.json`
- `bus-stops.json` (NUS provider mapping)
- `lta-public-bus-stops.json` (LTA provider mapping)

The checked-in canonical data source is `frontend/public/data`. For a deployment where the backend cannot read the frontend checkout, copy the matching files into a backend data directory and set `NAVUS_DATA_DIR` to that directory. Express loads and validates the files itself; it does not ask Vite or the static web server for data.

Relative `NAVUS_DATA_DIR` paths resolve from the backend process working directory. The npm workspace commands run Express from `backend/`, so the example value `../frontend/public/data` points to the checked-in data directory. Use an absolute path when starting Express from a different working directory.

`VITE_DATA_VERSION` is embedded in the frontend build. `NAVUS_DATA_VERSION` identifies the matching backend data set. Keep them equal: both use `development` for the local rehearsal, while a hosted build uses the same source revision value for its frontend and backend data. A version mismatch means the frontend and API may be using different canonical data.

`shuttle-timing.json` is a generated, ignored runtime artifact, not a checked-in source file. `npm run shuttle:timing:generate:geometry` creates it from the canonical network and route geometry. The frontend's predev and prebuild hooks also generate it. Generate it before starting a standalone backend so the file exists in `NAVUS_DATA_DIR`.

`walking-stop-graph.json` is a checked-in derived artifact. Regenerate it with `npm run walking:graph:generate` while local Valhalla is running when the canonical bus stops, walking profile, or routing data changes. The backend validates that the graph's network version and stop IDs match the canonical transit network. Do not regenerate it for an ordinary app start.

## API addresses and credentials

The root `.env.example` contains frontend settings only. `VITE_API_ORIGIN` is public because Vite embeds it in the browser files. Leave it blank for the Vite development server, which forwards `/api` requests to Express. Hosted production builds require an explicit HTTPS API origin; GitHub Actions reads it from the `NAVUS_API_ORIGIN` repository variable. Until the API is deployed, the Development Pages workflow uses a reserved `.invalid` origin so the frontend can still build and deploy; API-backed features such as live shuttle timings and pathfinding remain unavailable until the real API origin is configured.

The local rehearsal uses `.env.local-rehearsal`, which points only to loopback Express. Its build mode accepts HTTP on a loopback address and writes to a separate output directory. The GitHub Pages workflow uploads only `frontend/dist`, the hosted build output.

Put NUS and LTA credentials in `backend/.env`. Never add them to root `.env`, Vite settings, GitHub frontend build variables, or the generated static files. `VALHALLA_BASE_URL` is also backend-only and must use a loopback or private-network address; the browser does not connect to Valhalla.

## Express readiness and process count

Run one Express instance per environment. The shuttle snapshot and its refresh scheduler live in process memory, so multiple backend instances would poll providers separately and could serve different snapshots. `/api/health` reports that Express is running. `/api/ready` stays unavailable until canonical data is loaded and the first complete bus-arrival snapshot has been published. After that first complete snapshot, later partial refreshes can keep last-known arrivals for stops whose request failed. See [backend live-data behavior](backend-live-data.md) for refresh and freshness details.

### API request limits

Express applies a shared per-client budget to every `/api` route, defaulting to 120 requests per 60 seconds. Journey planning has an additional per-client limit of 20 requests per 60 seconds and defaults to at most four concurrent calculations. Configure these values with `API_RATE_LIMIT_WINDOW_MS`, `API_RATE_LIMIT_MAX_REQUESTS`, `JOURNEY_RATE_LIMIT_MAX_REQUESTS`, and `JOURNEY_MAX_CONCURRENT_REQUESTS` in `backend/.env`; see [the example](../backend/.env.example). Limited requests receive HTTP 429 with `Retry-After`.

The counters and concurrency slots live in the Express process and reset when it restarts. Run one API instance. When requests arrive through Cloudflare Tunnel, the limiter uses `CF-Connecting-IP` only when the connection to Express comes from loopback; keep Express loopback-bound and run `cloudflared` on the same host. CORS does not authenticate API callers, so these controls reduce excess work while the API remains public. See [the HTTP guide](../backend/src/http/README.md) for the request flow and trust rules.

## Express container rehearsal (#236)

`backend/Dockerfile` defines an initial local-rehearsal image. Build from the repository root:

```bash
docker build -f backend/Dockerfile -t navus-express:236-local .
docker run --rm --name navus-express-236 -p 127.0.0.1:3001:3001 navus-express:236-local
```

The image contains Express, shared runtime modules, production npm dependencies, and the six canonical data artifacts and both provider stop mappings from the same checkout. Timing data is generated during the build using the existing geometry-fallback policy. The Dockerfile-specific context allowlist excludes environment files, host dependencies, unrelated checkout files, and local Valhalla tiles. The runtime uses the unprivileged Node user and launches Node directly so it receives shutdown signals.

This first rehearsal uses development application settings and the `development` data version. The container listens on all of its own interfaces; the run command publishes it only on host loopback. Production configuration currently requires Express itself to bind to loopback, so this definition is not a production deployment recipe. Resolve that constraint while preserving the reverse-proxy boundary before using production mode. Do not disable production validation to deploy it.

The command above tests startup without provider credentials. `/api/health` should return 200; `/api/ready` should return 503 until the first complete live snapshot exists. The container health check deliberately measures process health rather than provider readiness. Do not interpret a healthy container as proof of working live arrivals or Journey routing.

For the integrated rehearsal, provide backend-only configuration at runtime and connect Express to private Valhalla using a container-network service name such as `http://valhalla:8002`. Container loopback refers to Express's container, not the host Valhalla service. Keep Valhalla unpublished on that network; retain outbound connectivity for NUS/LTA. Never bake credentials into the image. Run exactly one Express container because the refresh scheduler and snapshot are process-owned.

Phase 0 verification includes the built frontend against this API, exact CORS and preflight, private Valhalla geometry, provider failure/recovery, restart/readiness, shutdown, and separate snapshot/Journey resource measurements. See issue #236 for the acceptance criteria; packaging alone does not complete Phase 0 or authorize hosting.
### Repeatable integrated container run

`docker-compose.rehearsal.yml` starts one API and a separate Valhalla service without publishing a Valhalla port. It consumes existing, prebuilt tiles read-only; first prepare them with the ordinary Valhalla setup. Set `NAVUS_VALHALLA_DATA_DIR` to the absolute directory containing `valhalla.json`, `valhalla_tiles`, and `valhalla_tiles.tar`, and `NAVUS_BACKEND_ENV_FILE` to the absolute backend-only environment-file path. Those variables locate files; do not place credential values in shell history. The API defaults to host port 13001 to avoid an existing API on 3001.

From the repository root, with those path variables set:

```bash
docker compose -p navus-236 -f docker-compose.rehearsal.yml up --build -d
```

Build the frontend with `VITE_API_ORIGIN=http://127.0.0.1:13001` in the process environment and run `npm run build:local-rehearsal`, then `npm run preview:local-rehearsal`. If `NAVUS_API_HOST_PORT` is changed, use that same port in the frontend API origin. Serve on exactly `http://127.0.0.1:5173`, the rehearsal CORS allowlist. The frontend remains static and does not use Vite API handlers. The API overrides container paths, listener, routing URL, and local data version while receiving provider configuration from the environment file at runtime.

The composition deliberately uses development settings. Production still requires loopback binding and a local trusted proxy; preserve that policy. A production package must put its proxy in the API's network namespace or separately establish and verify a trusted container ingress design. Do not reuse this rehearsal composition as the hosted deployment.

Stop the static preview with Ctrl+C and clean up only this rehearsal project:

```bash
docker compose -p navus-236 -f docker-compose.rehearsal.yml down
```
To repeat the project-style asset-base check, set the same `VITE_API_ORIGIN` and run `npm --workspace @navus/frontend exec -- vite build --mode local-rehearsal --base=/NavUS/`, then `npm --workspace @navus/frontend exec -- vite preview --mode local-rehearsal --outDir dist-local-rehearsal --host 127.0.0.1 --port 5173 --base=/NavUS/`. Open `http://127.0.0.1:5173/NavUS/`. Build and preview must use the same asset base; API calls still target `/api` on port 13001.

### Local rehearsal evidence — 22 October 2026

Verified on Windows x64, Docker Desktop's Linux engine, with the pinned images above and a built static frontend. Existing NUS credentials were injected at runtime; LTA was unconfigured. These observations are local samples, not a concurrency or hosted-capacity claim.

| Check | Observed result |
| --- | --- |
| Express image | 333,160,061 bytes (333 MB / 318 MiB) |
| Packaged canonical/provider data | 994,904 bytes |
| Existing Valhalla files, including PBF and tile archive/tree | 1,578,724,593 bytes on disk; supplied separately from the Express image |
| Container memory after sample requests | Express 92.04 MiB; Valhalla 110 MiB; point-in-time working sets |
| Snapshot reads, 10 sequential HTTP requests for COM3 and UTOWN | 1.94 ms median; 1.70–32.57 ms range |
| Journey HTTP requests, 5 sequential requests COM3 to UTOWN | 184.56 ms median; 176.79–393.71 ms range; complete geometry including walking-only option |
| Restart to readiness, one sample | 1,242 ms; observed 503, 503, then 200; fresh snapshot generation |
| Live NUS | 33-stop snapshot ready after startup, live arrivals and D2 service windows returned; browser showed LIVE timing badges |
| Private walking service failure/recovery | Stopping rehearsal Valhalla returned 503 `provider_unavailable` for a frozen-coordinate Journey; restoring it returned 200 with complete geometry |
| API boundary | Allowed-origin preflight 204; unapproved-origin preflight 403 without an allow-origin header; malformed Journey body 400 |
| LTA without key | 503 `provider_unavailable`; browser displayed unavailable public timings while internal live arrivals worked |
| Browser | Headless installed Edge; Stops and Plan exercised from separate static origin; four candidates rendered; no page errors or direct NUS/LTA/Valhalla requests; API origin stayed on port 13001 |
| Network and lifecycle | Valhalla had no published host port; Express published only on host loopback; SIGTERM shutdown exited 0; temporary manual rehearsal containers removed |

Repository checks passed: `npm test` (905 frontend tests, 76 backend Node tests, 76 backend Pathfinding tests), `npm run lint`, `npm run build` with `VITE_API_ORIGIN=https://api.navus.invalid`, and `git diff --check`. `npm run build:local-rehearsal` passed against port 13001. The existing #234 harness also passed `npm run benchmark:pathfinding -- --mode=offline --samples=2 --warmups=1` across 50 cases. Live HTTP timings above are separate from that deterministic offline harness. The frontend build retains its existing large-chunk warning.

Outstanding #236 work: verify real LTA with the user's key; extend failure evidence beyond the tested unavailable-provider/restart paths to all required stale/partial/total snapshot states; complete the private-access boundary checks required by #102; decide and implement production ingress before deployment. The local bridge network is not a public ingress, but its unpublished Valhalla service is still reachable by local Docker administrators and other services attached to that network. No cloud provisioning, hosted sizing, TLS, public deployment, or release approval is implied.

`CONTEXT.md` reviewed; no update needed. Packaging changes no domain vocabulary.
