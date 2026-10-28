# NUS active-bus and shuttle-service findings

Issue: #487 (epic #500). Captured 27/10/2026, about 10:06 to 10:09 SGT (service hours), from the production NUS NextBus API through the backend proxy (`npm run bus:call`). Six upstream calls in total.

Fixtures (plates kept as-is: they identify public shuttle vehicles, not people; no tokens, user IDs or device IDs appear in the response bodies):

- `backend/src/live-data/providers/nus/__fixtures__/active-bus-d2.json`
- `backend/src/live-data/providers/nus/__fixtures__/active-bus-a1.json`
- `backend/src/live-data/providers/nus/__fixtures__/shuttle-service-utown.json`

## `active-bus` (per route)

Envelope: `data.TimeStamp` (ISO 8601 with `+08:00`), `data.ActiveBusCount` (**string**, e.g. `"6"`), `data.activebus` (array).

| Field | Observed type | Notes |
| --- | --- | --- |
| `vehplate` | string | Present on every bus (`PD496S`, `PC4019R`). |
| `lat`, `lng` | number | Decimal degrees, 6 d.p. |
| `speed` | integer | Plausibly km/h (0 to 33 seen); unit not confirmed. |
| `direction` | number | Compass **degrees**, 0 to 360 (e.g. `309.8`, `2.9`, `162`). Sometimes a whole number, so parse as a float. Not an enum. |
| `loadInfo.capacity` | integer | 88 or 89. |
| `loadInfo.ridership` | integer | Passengers on board; 0 to 35 seen. |
| `loadInfo.occupancy` | number | `ridership / capacity`, 0 to 1 (e.g. `0.393` = 35/89). `0` is an integer, not `0.0`. |
| `loadInfo.crowdLevel` | string | Only `low` and `medium` seen. `high` is unverified. Thresholds look like `low` below about 0.3 and `medium` at 0.35 to 0.4; too few samples to be sure. |

Nullability: every field was present and non-null on all 26 bus records (5 samples across D2, A1, A2). We have **not** seen a null or missing field, so nullability is unverified; parse defensively.

## `shuttle-service` (per stop, UTown)

Envelope: `TimeStamp`, `caption` (`University Town`), `name` (`UTOWN`), `shuttles[]`, `hints[]`.

Each shuttle: `name`, `routeid` (int), `busstopcode`, `arrivalTime` and `nextArrivalTime` (strings, minutes), `passengers`, `nextPassengers`, `arrivalTime_veh_plate`, `nextArrivalTime_veh_plate`, `_etas[]`.

Each `_etas` entry: `eta` (int, minutes), `eta_s` (int, seconds), `ts` (string, `YYYY-MM-DD HH:mm:ss`), `plate`, `jobid` (int), `px`.

- **`passengers` / `nextPassengers`:** `"-"` on every route, even with buses running. `_etas[].px` is also `"-"`. So the stop-level load fields carry **no data** today. Load must come from `active-bus.loadInfo`.
- **`ts`** is not the current time or an arrival time we could reconcile with `eta`: it was earlier than the response time for some entries (e.g. `09:53:00` with `eta` 2). Do not use it.
- **`hints`** is an array of strings such as `[D2:201444]PD496S: Normal-Shuttle: passed stop University Town`. Not needed for now.
- Routes at UTown: D1, D2, R1, R2, P.
- R1 and R2 `_etas` repeat two plates (`PD649T`, `PD788A`) across five entries, so one bus appears several times for later laps. Do not assume plates in `_etas` are unique.

## Join verdict: `shuttle-service` to `active-bus`

Plates use the same format and the first/next plate fields match `_etas[0]`/`_etas[1]`. Joining on plate **works for most buses but is not complete**:

- D2 `arrivalTime_veh_plate` (`PD726D`) and `nextArrivalTime_veh_plate` (`PD679G`) were both in the D2 `active-bus` list.
- Of the five D2 `_etas` plates, three (`PD726D`, `PD679G`, `PD496S`) were in `active-bus`; `PD964H` and `PD760D` were not. They may be D1 or non-D2 buses reassigned, or not yet dispatched. Cause unconfirmed.
- `active-bus` D2 also listed three buses not in `_etas` (`PD810T`, `PD773S`, `PC4019R`). The `hints` show they had already passed UTown.
- Plates can belong to more than one route within a day (`PD649T`/`PD788A` under both R1 and R2), so join on plate within the route, not globally.

Recommendation: treat the join as best-effort. Show load when the plate is found, and fall back to "load unavailable" otherwise.

## Cadence

Three D2 samples, taken at 10:06:23, 10:07:20 and 10:07:39 SGT (57 s then 19 s apart; the NUS proxy adds latency, so the spacing was not an exact 30 s):

- **Position and speed** changed on every sample for moving buses (roughly 100 to 200 m per minute). Stationary buses (`speed` 0) kept identical coordinates.
- **`direction`** changed between samples even when the bus was stationary (`PD496S` 238.9 to 261), so it is noisy at a stop.
- **Load** changed rarely: `PD496S` 35 to 26 riders, `PD726D` 32 to 31, `PD810T` 4 to 14, `PC4019R` 0 to 1, over about 75 s. Most buses stayed the same. It looks stop-driven (changes after a stop), not continuous.
- A bus with identical position, `speed` 0 and load can repeat for a whole sample (`PC4019R`).

Practical polling: 15 to 20 s would catch most movement; load would be fresh enough at 30 s. Upstream limits are not documented, so start at 30 s and respect the NUS Acceptable Use Policy.

## One call or one per route?

`active-bus` **needs one call per route code**: D2 (6 buses), A1 (4), A2 (4) all returned only their own route. The backend wrapper (`scripts/nus-bus-stops.ps1`) refuses a call without `--route-code`; we did not test omitting the parameter against the upstream directly, so an all-routes call is **unverified**. `shuttle-service` is per stop but returns every route serving that stop.

## Off-hours behaviour

Known from the night run on 26/10/2026 at about 23:36 SGT (not re-captured here; D2 still had 3 buses at 23:03 SGT on 27/10/2026, so the cut-off varies by route): `ActiveBusCount` is `"0"`, `activebus` is an empty list, response code `00000`, and `shuttle-service` returns `"-"` placeholders with empty `_etas`.

## Not verified

- `crowdLevel` values above `medium`, and its thresholds.
- Unit of `speed`.
- Null or missing fields under unusual conditions (e.g. GPS loss).
- Why some `_etas` plates are absent from `active-bus`.
- Whether the upstream accepts an empty route code.
- Routes D1, K, R1, R2, P, BTC for `active-bus` (only D2, A1, A2 were called).
