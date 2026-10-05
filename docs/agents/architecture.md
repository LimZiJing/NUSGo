# Application Architecture

Use these ownership seams to keep domain behavior, user workflows, presentation, and side effects easy to change and test. They describe the target layout for the sequenced architecture migration.

## Ownership

- `frontend/src/app` owns application composition, framework-free contracts, and application-level controllers such as the navigation session.
- `frontend/src/domain` owns pure transit, venue, location, and trip types, validation, lookup indexes, and domain transformations.
- `frontend/src/features` owns user workflows such as the Explore view, shuttle browsing, and trip endpoints, including their workflow state and intent commands.
- `frontend/src/ui` owns reusable React primitives, layouts, shared presentation styles, and desktop/mobile presentation seams.
- `frontend/src/infrastructure` owns MapLibre and network/data adapters, static-data loading, map lifecycle, markers, layers, popups, and other external side effects.

`frontend/public/data` remains the canonical checked-in data source. Infrastructure loaders parse external data as `unknown`, validate it, and return only validated domain data.

## Contracts and dependency direction

Application contracts must be small, framework-free interfaces in `frontend/src/app/contracts`. Define a contract there when it describes an effect the application needs, such as map presentation or data loading. Concrete MapLibre and network implementations belong in `frontend/src/infrastructure`; the app composition root wires those adapters and feature entry points together with runtime imports.

The intended direction is:

```text
             frontend/src/app (composition)
              | runtime --> frontend/src/features
              | runtime --> frontend/src/ui
              | runtime --> frontend/src/infrastructure --> frontend/src/domain

       frontend/src/app -- state/callbacks --> frontend/src/features
       frontend/src/features -------------------------------> frontend/src/domain
       frontend/src/features -------------------------------> frontend/src/ui contracts
       frontend/src/infrastructure - - import type only - -> frontend/src/app/contracts
```

- Domain modules must not import React, MapLibre, browser DOM APIs, network clients, or other infrastructure.
- The app composition root may runtime-import feature entry points, UI entry points, and infrastructure adapters to wire the application.
- Infrastructure may depend on domain types and implement framework-free app contracts. It may use `import type` from `frontend/src/app/contracts` for those ports only; this type-only edge is erased at runtime and does not create a runtime dependency cycle.
- Infrastructure must not make any other import from `frontend/src/app`, including runtime imports or imports from app controllers. It owns all MapLibre, network, DOM, listener, timer, and asynchronous effects.
- Features depend only on domain values and UI contracts or primitives. They must not import `frontend/src/app/contracts`, concrete infrastructure adapters, MapLibre, network clients, or another feature's internals.
- Cross-feature coordination is performed by app composition through passed state and callbacks rather than direct feature-to-feature or feature-to-app-contract imports.
- The app composition root passes application state and callbacks into feature entry points; features translate user intent through their UI contracts.
- UI modules must not reach into application internals or infrastructure. They receive state and callbacks through props or small framework-free interfaces.

The diagram describes allowed ownership and dependency direction; it does not require every module to import every lower layer.

## State, callbacks, and seams

- Feature modules own workflow state such as search queries, selections, and commands. UI modules may own only transient presentation state that has no domain meaning.
- UI callbacks express user intent and are passed down from the owning feature or app controller. UI components do not perform network, MapLibre, DOM, or controller side effects directly.
- Keep the domain model, feature state, and commands shared across desktop and mobile. Use separate UI seams only when layout, focus management, scrolling, or interaction order changes materially; keep viewport-specific presentation and responsive styles in `frontend/src/ui`.
- Pure transformations and validators remain free of I/O, mutation, DOM work, and MapLibre effects.

## Migration map and order

Split `frontend/src/transit/render.ts` at its pure/effect boundary: pure transit validation, geometry, and types—including pure validation currently embedded there—belong in `frontend/src/domain`; only its remaining MapLibre rendering and effect responsibilities belong in `frontend/src/infrastructure`.

| Current area | Target owner |
| --- | --- |
| Pure transit types, validation, and geometry in `frontend/src/types` and `frontend/src/transit/`, including `frontend/src/transit/overlap.ts` and pure validation embedded in `frontend/src/transit/render.ts`, plus `frontend/src/venue`, `frontend/src/location`, `frontend/src/trip`, and pure Explore view state | `frontend/src/domain` |
| Feature-specific components and React state currently under `frontend/src/components` | `frontend/src/features` |
| Genuinely reusable primitives and layouts currently under `frontend/src/components` | `frontend/src/ui` |
| Only the remaining MapLibre rendering and effect responsibilities in `frontend/src/transit/render.ts`, plus `frontend/src/map`, data loaders, MapLibre lifecycle, markers, layers, and popups | `frontend/src/infrastructure` |
| `frontend/src/app/app.tsx` and composition in `frontend/src/main.tsx` | `frontend/src/app` |

Apply the architecture work in this exact order: **#38 → #39 → #34 → #35 → #30 → #40 → #36 → #37**. Complete **#30 before starting #40 or #36**. Move imports atomically with each step and keep one canonical source of truth.

## Refactor gates

- Make no behavior change: preserve route, stop, venue, endpoint, popup, keyboard, responsive, camera, and error behavior.
- Add no global state library or global mutable state.
- Add no schema-validation dependency; validate at existing infrastructure boundaries with project-owned logic.
- Add no compatibility re-exports for obsolete module paths. Update imports atomically instead of maintaining duplicate paths or sources of truth.
- Every adapter-created listener, layer, source, marker, popup, timer, and asynchronous operation must have an explicit cleanup or cancellation path.
