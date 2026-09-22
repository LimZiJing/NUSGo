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

These are planning estimates, not observed timetables. The current data marks
waiting time as unavailable because the available NUS service-window response
does not provide verified headways. The planner must not invent a waiting time
from a first or last service time.

To regenerate the local build data after reviewing the fallback decision, run:

```text
npm run shuttle:timing:generate:geometry
```

The explicit flag is required because geometry timing is a fallback until
validated stop-to-stop observations or headway data are available. Set
`NAVUS_TIMING_GENERATED_AT` when a reproducible generation date is needed.

`npm run dev` and `npm run build` run this generation step automatically.
