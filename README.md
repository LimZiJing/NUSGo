# NavUS

An experimental campus transit and indoor navigation web app for the National University of Singapore.

## Current status

Early prototype built with React, TypeScript, and Vite. The map uses the OpenFreeMap Liberty vector style, which is based on OpenStreetMap data. Venue and static shuttle-stop markers are implemented; navigation, route geometry, live transit, and calendar import are not implemented yet.

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

## Local NUS bus API checks

The API credentials must stay outside the browser bundle. The repository includes
a local PowerShell wrapper around the verified `curl.exe` request for NUS internal
bus stops.

1. Copy `.env.example` to `.env`.
2. Fill in `NUS_X_API_KEY`, `NUS_UNIVUS_JWT`, and the matching `NUS_USER_ID`.
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
