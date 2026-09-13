# NavUS

An experimental campus transit and indoor navigation web app for the National University of Singapore.

## Current status

Early prototype built with React, TypeScript, and Vite. The map uses the OpenFreeMap Liberty vector style, which is based on OpenStreetMap data. Venue and static shuttle-stop markers are implemented; navigation, route geometry, live transit, and calendar import are not implemented yet.

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

## Planned

- NUS venue and timetable ingestion
- Indoor and outdoor walking routes
- Shuttle bus integration
- Custom paths and community POIs
