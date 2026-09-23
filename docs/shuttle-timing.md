# Shuttle timing estimates

The build creates `public/data/shuttle-timing.json` with estimated directed
ride times for the ordered stop pairs in the canonical shuttle network. The
generated file is ignored by Git; the canonical sources and generator are the
files kept in the repository.

The estimates use the reviewed route geometry in
`public/data/shuttle-routes.geojson`:

- baseline speed: 15 mph, a common local-bus planning baseline;
- uncertainty range: 10–20 mph;
- intermediate-stop dwell: 20 seconds, with a 10–30 second uncertainty range;
- reverse-direction pairs are not created unless the canonical route has that
  direction; and
- every value records the geometry verification date and method version.

These are planning estimates, not observed timetables. When the development
server has the NUS bus API settings, NavUS also requests live stop arrivals
through its same-origin `/api/shuttle-arrivals` endpoint. The server caches
each stop response briefly and keeps the credentials out of the browser.

The planner uses the next live arrival for the first boarding and the first
arrival after the expected transfer time for later boardings. If the live
response does not cover that time, it uses half the observed headway. The
static ride estimate remains available when live data cannot be loaded.

The planner still keeps an explicit `zeroShuttleWaitingTime` fallback for
offline or unavailable live data. This is a fallback policy, not a claim that a
shuttle is immediately available.

To regenerate the local build data after reviewing the fallback decision, run:

```text
npm run shuttle:timing:generate:geometry
```

The explicit flag is required because geometry timing is a fallback until
validated stop-to-stop observations or headway data are available. Set
`NAVUS_TIMING_GENERATED_AT` when a reproducible generation date is needed.

`npm run dev` and `npm run build` run this generation step automatically.
