# NavUS

An experimental campus transit and indoor navigation web app for the National University of Singapore.

## Current status

Early prototype built with React, TypeScript, and Vite. The map uses the OpenFreeMap Liberty vector style, which is based on OpenStreetMap data. Venue and static shuttle-stop markers are implemented, and the navigation session can calculate an estimated Journey when a Valhalla walking endpoint is configured. Journey map rendering, Plan trip presentation, live transit, and calendar import are still pending.

See [`CONTEXT.md`](CONTEXT.md) for shared domain language and [`docs/project-status.md`](docs/project-status.md) for the detailed implementation status and milestones.

OpenFreeMap attribution is included by the MapLibre style. Review the provider's usage terms before deploying the app publicly or at scale.

## Development

Requirements: Node.js and npm.

```bash
npm install
npm run dev
```

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
2. Fill in `NUS_X_API_KEY`, `NUS_UNIVUS_JWT`, and the matching `NUS_USER_ID`.
   Keep `NUS_APP_VERSION` in the full ESB format used by the Android app, such
   as `univus_android_2.59.2_140`.
3. Run the internal bus-stop check:

```bash
npm run bus:call -- bus-stops
```

The wrapper builds the body with PowerShell and invokes `curl.exe` using the
same request shape as the known-good manual command. It uses the raw JWT in the
JSON body and adds `Bearer` only to the internal proxy's `Authorization` header.
The other documented internal endpoints are also available through the same
command; run `npm run bus:call -- help` for the full list.

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
