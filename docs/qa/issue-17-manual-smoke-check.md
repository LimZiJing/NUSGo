# Issue #17 manual smoke check

Date: 2026-09-18 (Asia/Singapore)

## Checklist

| Check | Result | Evidence or blocker |
| --- | --- | --- |
| Desktop map presents a quiet basemap with rail, airport, and major campus context | Blocked | Interactive browser could not start in the WSL environment. |
| Narrow-screen controls remain stacked and usable | Blocked | Interactive browser could not start in the WSL environment. |
| Native route-control keyboard operation still works | Blocked | Interactive browser could not start in the WSL environment. |
| Shuttle stops appear at zoom 14 and focused route/stop content remains visible below it | Blocked | Interactive browser could not start in the WSL environment. |
| Stop labels use short names and collision-aware placement | Blocked | Interactive browser could not start in the WSL environment. |
| Venue search and neutral venue markers remain usable | Blocked | Interactive browser could not start in the WSL environment. |
| Route lines remain subdued in the all-routes state and have no click affordance | Blocked | Interactive browser could not start in the WSL environment. |

## Environment verification

- The Vite development server started successfully at `http://127.0.0.1:5175/`.
- A local `curl` request returned the application HTML successfully.
- BrowserAct was attempted with the confirmed isolated browser, but its bundled Chrome exited because `libnspr4.so` and related system libraries are unavailable. The environment does not permit installing those system packages.

No interactive pass is claimed until the browser dependency blocker is repaired and the checklist can be exercised on desktop and narrow-screen viewports.
