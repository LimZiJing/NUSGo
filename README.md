# NUSGo

An experimental campus-navigation prototype for the National University of Singapore. Explore venues and bus routes, plan estimated walking-and-bus journeys, and check bus arrivals.

The website is a static frontend. Journey planning needs the Express API and a private Valhalla service; live arrivals need provider settings in Express. See [project status](docs/project-status.md) for current capabilities and limitations.

## Demo

Try the [GitHub Pages frontend](https://limzijing.github.io/NUSGo/). It is built separately from Express; live features depend on the API origin configured for that build and the availability of its backend services.

## Screenshots

| Nearby stops | Live journey |
| --- | --- |
| <img src="docs/qa/screenshots/prototype-nearby-stops-live.png" width="180" alt="Nearby stops with live arrivals and favourite stops"> | <img src="docs/qa/screenshots/prototype-journey-live.png" width="180" alt="Recommended live journey from Prince George's Park to UTown Auditorium 2"> |

| Shuttle routes (dark) | LT17 venue details (dark) |
| --- | --- |
| <img src="docs/qa/screenshots/prototype-shuttle-routes-dark.png" width="180" alt="Dark Shuttle Routes view with route A1 selected"> | <img src="docs/qa/screenshots/prototype-venue-lt17-dark.png" width="180" alt="Dark venue details for LT17 with nearby stops"> |

## Run locally

Requirements: Node.js 22 or later, npm, and Docker Desktop with Docker Compose.

```bash
npm install
npm run dev
```

The root command starts Vite, Express, and local Valhalla together for convenience. On the first run, Docker downloads map data and builds routing tiles; this can take several minutes and use local disk space. To run the services separately or rehearse a built frontend against local Express, follow the [local services guide](docs/local-services.md).

## Optional live data

Copy `.env.example` to `.env` for frontend settings and `backend/.env.example` to `backend/.env` for Express settings and provider credentials. Keep credentials in `backend/.env`; variables prefixed with `VITE_` are included in the public browser build. The local development frontend can leave `VITE_API_ORIGIN` blank to use Vite's proxy, while hosted builds require an explicit HTTPS API origin.

## Useful commands

```bash
npm test
npm run lint
npm run build
npm run build:local-rehearsal
npm run preview:local-rehearsal
npm run preview
```

`npm run build` creates the hosted frontend and requires `VITE_API_ORIGIN`. The local rehearsal commands use the checked-in loopback profile and write to a separate output directory, so the Pages workflow does not publish that build.

For detailed arrival timing behavior, see [shuttle timing](docs/shuttle-timing.md). The [manual smoke checklist](docs/qa/manual-smoke-check.md) covers the main user flows.

The map uses the OpenFreeMap Liberty style and OpenStreetMap data. Attribution appears in the app. Review OpenFreeMap's usage terms before deploying publicly or at scale.
