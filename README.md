# NavUS

An experimental campus transit and indoor navigation web app for the National University of Singapore.

## Current status

Early prototype built with React, TypeScript, and Vite. The map uses the OpenFreeMap Liberty vector style, which is based on OpenStreetMap data. Venue and static shuttle-stop markers are implemented, and the navigation session can calculate an estimated Journey when a Valhalla walking endpoint is configured. Live shuttle waiting estimates depend on the server-side NUS settings; calendar import remains pending.

See [`CONTEXT.md`](CONTEXT.md) for shared domain language and [`docs/project-status.md`](docs/project-status.md) for the detailed implementation status and milestones.

OpenFreeMap attribution is included by the MapLibre style. Review the provider's usage terms before deploying the app publicly or at scale.

## Development

Requirements: Node.js, npm, and Docker Desktop with Docker Compose.

```bash
npm install
npm run dev
```

### Local Valhalla routing with Docker

NavUS uses [Valhalla](https://github.com/valhalla/valhalla) to calculate walking routes. Docker Desktop must be running before starting the app.

The normal development command starts Valhalla automatically:

```bash
npm run dev
```

On the first run, Docker downloads the Malaysia, Singapore, and Brunei OpenStreetMap extract and builds the routing tiles. This can take several minutes and uses local disk space. Later runs reuse the saved data.

To start Valhalla separately, run:

```bash
npm run valhalla:up
```

When it is ready, the service is available at `http://127.0.0.1:8002`. The Valhalla root URL may show a `404`; that is expected because the service exposes endpoints such as `/route` and `/sources_to_targets` instead.

Stop the service with:

```bash
npm run valhalla:down
```

Stopping the service does not delete the downloaded routing data. Set `NAVUS_VALHALLA_WAIT_MS` to change the startup timeout, or set `VITE_VALHALLA_BASE_URL` in `.env` to use another Valhalla endpoint. For the local Docker service, leave this variable unset or set it to `/valhalla`; NavUS uses the Vite proxy so browser requests do not hit local Valhalla directly.

Useful checks:

```bash
npm run lint
npm run build
```

Set `VITE_VALHALLA_BASE_URL` when the local Valhalla service is not running at
`http://localhost:8002`. This value is only a routing endpoint URL, not an API
credential.

## GitHub Pages deployment

The `development` workflow builds and deploys the app to GitHub Pages whenever
changes reach `main`. It uses a GitHub Actions environment named `development`.

After merging the deployment branch, a repository administrator must enable the
Pages source:

1. Open **Settings → Pages** in the repository.
2. Under **Build and deployment → Source**, select **GitHub Actions**.
3. Save the setting and check the **Actions** tab for the `development` workflow.

The project Pages URL is expected to be:
`https://limzijing.github.io/NavUS/`.

## Local NUS bus API checks

The API credentials must stay outside the browser bundle. The repository includes
a local PowerShell wrapper around the verified `curl.exe` request for NUS internal
bus stops.

1. Copy `.env.example` to `.env`.
2. Fill in `NUS_X_API_KEY` and the two API header values. `NUS_UNIVUS_JWT` and
   `NUS_USER_ID` may be supplied as bootstrap values, but they are optional when
   the access-token settings are configured. Keep `NUS_APP_VERSION` in the full
   ESB format used by the Android app, such as `univus_android_2.59.2_140`.
3. Keep `NUS_ACCESS_TOKEN_URL` pointed at the UniVus access-token endpoint. The
   server requests a replacement token when NUS returns code `10011`, retries
   the failed request once, and keeps the refreshed token in memory. Tokens are
   never sent to the browser or written to the repository.
4. Run the internal bus-stop check:

```bash
npm run bus:call -- bus-stops
```

The wrapper builds the body with PowerShell and invokes `curl.exe` using the
same request shape as the known-good manual command. It uses the raw JWT in the
JSON body and adds `Bearer` only to the internal proxy's `Authorization` header.
The other documented internal endpoints are also available through the same
command; run `npm run bus:call -- help` for the full list.

When `npm run dev` is running with these settings, the Vite development server
also exposes `/api/shuttle-arrivals`. The browser uses this same-origin endpoint
for live journey waiting estimates; the server caches stop responses and keeps
the NUS settings out of the client bundle. The GitHub Pages build has no server
endpoint, so it continues to use static timing estimates when live data is not
available.

Examples:

```bash
npm run bus:call -- active-bus D2
npm run bus:call -- pickup-point --route-code D2
npm run bus:call -- bus-location SBS1234A
npm run bus:call -- shuttle-service "Kent Ridge MRT"
```

Do not put these values in `VITE_` variables: Vite exposes those variables to
the client. For a deployed app, put the request behind a server-side API rather
than shipping the credentials in the React application.

## Planned

- NUS venue and timetable ingestion
- Indoor and outdoor walking routes
- Shuttle bus integration
- Custom paths and community POIs
