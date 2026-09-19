# Application Architecture

NavUS uses explicit ownership areas so domain behavior, user workflows, presentation, and side effects remain easy to change and test.

## Target layout

- `src/app` owns application composition, framework-free contracts, and the navigation session controller.
- `src/domain` owns pure transit and venue types, validation, lookup indexes, and domain logic.
- `src/features` owns user workflows such as the contextual panel, shuttle browsing, and trip endpoints.
- `src/ui` owns reusable primitives, layouts, and shared presentation styles.
- `src/infrastructure` owns MapLibre, network/data loading, markers, popups, and other side effects.

The static data in `public/data` remains the canonical checked-in data source. Loaders validate it before returning domain data to the application.

## Dependency direction

```text
                 src/app
              /     |      \\
             v      v       v
       src/features  src/ui  src/infrastructure
             |        |          |
             +--------+----------+
                      v
                  src/domain
```

- Domain modules must not import React, MapLibre, browser DOM APIs, or network clients.
- Infrastructure modules may import domain modules and implement the framework-free contracts defined by `src/app`.
- Feature modules may depend on domain values and UI contracts, but must not import concrete infrastructure adapters.
- UI modules receive state and callbacks through props or small framework-free interfaces; they do not reach into application internals.
- `src/app` wires concrete adapters into the controller and feature workflows.

The diagram describes allowed dependencies, not a requirement that every module import every lower layer.

## Interface and adapter rules

Application contracts must be small and framework-free. A contract belongs in `src/app` when it describes what the application needs from an effectful implementation, such as map presentation or data loading. A concrete MapLibre or network implementation belongs in `src/infrastructure`.

The navigation session controller is a pure module with explicit state, commands, and subscriptions. A thin React adapter translates that interface for feature UI. Local input state, such as a search query, remains with its owning feature.

Transit and venue loaders parse external JSON as `unknown`, validate it, and fail the affected feature closed when the payload is malformed. Validated transit data is exposed through an immutable lookup index rather than repeated array scans.

## Desktop and mobile seams

Use a separate desktop/mobile UI seam when layout, focus management, scrolling, or interaction order changes materially across viewport sizes. Keep the domain model, feature state, and commands shared; put viewport-specific presentation in `src/ui` and its responsive styles.

## Migration map

| Current area | Target owner |
| --- | --- |
| `src/types`, `src/transit`, `src/venue`, `src/location`, `src/trip`, and pure contextual-panel state | `src/domain` |
| `src/components` and feature-specific React state | `src/features` |
| Shared React primitives and layouts | `src/ui` |
| `src/map`, `fetchJson`, MapLibre lifecycle, markers, layers, and popups | `src/infrastructure` |
| `src/App.tsx` orchestration | `src/app` |

Move imports atomically with each migration step. Do not preserve obsolete module paths as compatibility re-exports or create duplicate sources of truth.

## Refactor constraints

- Preserve current route, stop, venue, endpoint, popup, keyboard, responsive, camera, and error behavior.
- Do not add a global state library or a schema-validation dependency.
- Keep pure transformations and validators free of I/O, DOM work, MapLibre effects, and mutation.
- Every adapter-created listener, layer, source, marker, popup, timer, and asynchronous operation needs an explicit cleanup path.
