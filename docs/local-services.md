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

The checked-in canonical data source is `frontend/public/data`. For a deployment where the backend cannot read the frontend checkout, copy the matching files into a backend data directory and set `NAVUS_DATA_DIR` to that directory. Express loads and validates the files itself; it does not ask Vite or the static web server for data.

Relative `NAVUS_DATA_DIR` paths resolve from the backend process working directory. The npm workspace commands run Express from `backend/`, so the example value `../frontend/public/data` points to the checked-in data directory. Use an absolute path when starting Express from a different working directory.

`VITE_DATA_VERSION` is embedded in the frontend build. `NAVUS_DATA_VERSION` identifies the matching backend data set. Keep them equal: both use `development` for the local rehearsal, while a hosted build uses the same source revision value for its frontend and backend data. A version mismatch means the frontend and API may be using different canonical data.

`shuttle-timing.json` is a generated, ignored runtime artifact, not a checked-in source file. `npm run shuttle:timing:generate:geometry` creates it from the canonical network and route geometry. The frontend's predev and prebuild hooks also generate it. Generate it before starting a standalone backend so the file exists in `NAVUS_DATA_DIR`.

`walking-stop-graph.json` is a checked-in derived artifact. Regenerate it with `npm run walking:graph:generate` while local Valhalla is running when the canonical bus stops, walking profile, or routing data changes. The backend validates that the graph's network version and stop IDs match the canonical transit network. Do not regenerate it for an ordinary app start.

## API addresses and credentials

The root `.env.example` contains frontend settings only. `VITE_API_ORIGIN` is public because Vite embeds it in the browser files. Leave it blank for the Vite development server, which forwards `/api` requests to Express. Hosted production builds require an explicit HTTPS API origin; GitHub Actions reads it from the `NAVUS_API_ORIGIN` repository variable.

The local rehearsal uses `.env.local-rehearsal`, which points only to loopback Express. Its build mode accepts HTTP on a loopback address and writes to a separate output directory. The GitHub Pages workflow uploads only `frontend/dist`, the hosted build output.

Put NUS and LTA credentials in `backend/.env`. Never add them to root `.env`, Vite settings, GitHub frontend build variables, or the generated static files. `VALHALLA_BASE_URL` is also backend-only and must use a loopback or private-network address; the browser does not connect to Valhalla.

## Express readiness and process count

Run one Express instance per environment. The shuttle snapshot and its refresh scheduler live in process memory, so multiple backend instances would poll providers separately and could serve different snapshots. `/api/health` reports that Express is running. `/api/ready` stays unavailable until canonical data is loaded and the first complete bus-arrival snapshot has been published. After that first complete snapshot, later partial refreshes can keep last-known arrivals for stops whose request failed. See [backend live-data behavior](backend-live-data.md) for refresh and freshness details.
