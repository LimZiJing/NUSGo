# Application Architecture

Use these ownership seams to keep domain behavior, user workflows, presentation, and side effects easy to change and test. They describe the target layout for the sequenced architecture migration.

## Ownership

- `src/app` owns application composition, framework-free contracts, and application-level controllers such as the navigation session.
- `src/domain` owns pure transit, venue, location, and trip types, validation, lookup indexes, and domain transformations.
- `src/features` owns user workflows such as the contextual panel, shuttle browsing, and trip endpoints, including their workflow state and intent commands.
- `src/ui` owns reusable React primitives, layouts, shared presentation styles, and desktop/mobile presentation seams.
- `src/infrastructure` owns MapLibre and network/data adapters, static-data loading, map lifecycle, markers, layers, popups, and other external side effects.

`public/data` remains the canonical checked-in data source. Infrastructure loaders parse external data as `unknown`, validate it, and return only validated domain data.

## Contracts and dependency direction

Application contracts must be small, framework-free interfaces. Define a contract in `src/app` when it describes an effect the application needs, such as map presentation or data loading. Concrete MapLibre and network implementations belong in `src/infrastructure`; `src/app` wires those adapters into the application.

The intended direction is:

```text
                 src/app
              /     |      \
             v      v       v
       src/features  src/ui  src/infrastructure
             |        |          |
             +--------+----------+
                      v
                  src/domain
```

- Domain modules must not import React, MapLibre, browser DOM APIs, network clients, or other infrastructure.
- Infrastructure may depend on domain types and implement framework-free app contracts. It owns all MapLibre, network, DOM, listener, timer, and asynchronous effects.
- Features may depend on domain values, framework-free app contracts, and shared UI primitives, but must not import concrete infrastructure adapters, MapLibre, network clients, or another feature's internals.
- Cross-feature coordination goes through app-owned state, commands, or contracts rather than direct feature-to-feature imports.
- UI modules must not reach into application internals or infrastructure. They receive state and callbacks through props or small framework-free interfaces.

The diagram describes allowed ownership and dependency direction; it does not require every module to import every lower layer.

## State, callbacks, and seams

- Feature modules own workflow state such as search queries, selections, and commands. UI modules may own only transient presentation state that has no domain meaning.
- UI callbacks express user intent and are passed down from the owning feature or app controller. UI components do not perform network, MapLibre, DOM, or controller side effects directly.
- Keep the domain model, feature state, and commands shared across desktop and mobile. Use separate UI seams only when layout, focus management, scrolling, or interaction order changes materially; keep viewport-specific presentation and responsive styles in `src/ui`.
- Pure transformations and validators remain free of I/O, mutation, DOM work, and MapLibre effects.

## Migration map and order

| Current area | Target owner |
| --- | --- |
| `src/types`, `src/transit`, `src/venue`, `src/location`, `src/trip`, and pure contextual-panel state | `src/domain` |
| `src/components` and feature-specific React state | `src/features` |
| Shared React primitives and layouts | `src/ui` |
| `src/map`, data loaders, MapLibre lifecycle, markers, layers, and popups | `src/infrastructure` |
| `src/App.tsx` and composition in `src/main.tsx` | `src/app` |

Apply the architecture work in this exact order: **#38 → #39 → #34 → #35 → #30 → #40 → #36 → #37**. Complete **#30 before starting #40 or #36**. Move imports atomically with each step and keep one canonical source of truth.

## Refactor gates

- Make no behavior change: preserve route, stop, venue, endpoint, popup, keyboard, responsive, camera, and error behavior.
- Add no global state library or global mutable state.
- Add no schema-validation dependency; validate at existing infrastructure boundaries with project-owned logic.
- Add no compatibility re-exports for obsolete module paths. Update imports atomically instead of maintaining duplicate paths or sources of truth.
- Every adapter-created listener, layer, source, marker, popup, timer, and asynchronous operation must have an explicit cleanup or cancellation path.
