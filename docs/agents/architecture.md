# Application Architecture

Use these ownership seams to keep domain behavior, user workflows, presentation, and side effects easy to change and test. They describe the target layout for the sequenced architecture migration.

## Ownership

- `frontend/src/app` owns application composition, framework-free contracts, and application-level controllers such as the navigation session, cross-feature navigation, and responsive overlay layout.
- `shared/src` owns transport contracts and reusable, Node-free transit, venue, and walking-graph types and validation used by both applications. `frontend/src/domain` owns frontend-only location and trip models, lookup indexes, and domain transformations.
- `frontend/src/features` owns the Explore, Stops, and Plan workflows, including their state, intent commands, content components, and feature-specific styles.
- `frontend/src/ui` owns reusable React primitives, layouts, shared presentation styles, and cross-feature desktop/mobile presentation seams.
- `frontend/src/infrastructure` owns MapLibre and network/data adapters, static-data loading, map lifecycle, markers, layers, popups, and other external side effects.
- `frontend/src/pathfinding` owns the provider-injected Path model, bounded search, ordered planning pipeline, and its walking provider boundary. The app composition supplies validated transit data, timing callbacks, clocks, cooperative yields, and cancellation; Plan presentation and MapLibre rendering stay outside this folder.

`frontend/public/data` remains the canonical checked-in data source. Frontend infrastructure and the backend load external data as `unknown`, use the shared validators, and return only validated domain data.

## Contracts and dependency direction

Application contracts must be small, framework-free interfaces in `frontend/src/app/contracts`. Define a contract there when it describes an effect the application needs, such as map presentation or data loading. Pathfinding's walking-provider contract stays beside the engine because it is part of the engine's replaceable provider boundary. Concrete MapLibre and network implementations belong in `frontend/src/infrastructure` or in that focused Pathfinding boundary; the app composition root wires adapters and feature entry points together with runtime imports. The frontend and backend may both depend on `shared/src`; shared modules must remain free of Node, browser, and provider dependencies.

The intended direction is:

```text
             frontend/src/app (composition)
              | runtime --> frontend/src/features
              | runtime --> frontend/src/ui
              | runtime --> frontend/src/infrastructure --> frontend/src/domain
              | runtime --> frontend/src/pathfinding --> frontend/src/domain/shared

       frontend/src/app -- state/callbacks --> frontend/src/features
       frontend/src/features -------------------------------> frontend/src/domain
       frontend/src/features -------------------------------> frontend/src/ui contracts
       frontend/src/features -- import type --> frontend/src/pathfinding/path.ts
       frontend/src/infrastructure -- import type --> frontend/src/pathfinding/path.ts
       frontend/src/infrastructure - - import type only - -> frontend/src/app/contracts
```

- Domain modules must not import React, MapLibre, browser DOM APIs, network clients, or other infrastructure.
- The app composition root may runtime-import feature entry points, UI entry points, and infrastructure adapters to wire the application.
- Infrastructure may depend on frontend domain and shared types and implement framework-free app contracts. Map presentation may also use `import type` from the public `frontend/src/pathfinding/path.ts` model; it must not import Pathfinding runtime helpers or internals. Infrastructure may use `import type` from `frontend/src/app/contracts` for its ports; these type-only edges are erased at runtime and do not create runtime dependency cycles.
- Infrastructure must not make any other import from `frontend/src/app`, including runtime imports or imports from app controllers. It owns MapLibre, network/data-adapter, and integration-level DOM, listener, timer, and asynchronous effects.
- Application controllers may use browser measurements, observers, or listeners only to coordinate app-owned responsive layout or cross-feature keyboard navigation. Keep these effects in the owning app controller and clean them up with its lifecycle.
- Features depend on frontend domain or shared values, UI contracts or primitives, and may use `import type` from the public `frontend/src/pathfinding/path.ts` contract. They must not import Pathfinding runtime values or its search, pipeline, and walking internals. Features must not import `frontend/src/app/contracts`, concrete infrastructure adapters, MapLibre, network clients, or another feature's internals.
- Cross-feature coordination is performed by app composition through passed state and callbacks rather than direct feature-to-feature or feature-to-app-contract imports.
- The app composition root passes application state and callbacks into feature entry points; features translate user intent through their UI contracts.
- UI modules must not reach into application internals or infrastructure. They receive state and callbacks through props or small framework-free interfaces.

The diagram describes allowed ownership and dependency direction; it does not require every module to import every lower layer.

## State, callbacks, and seams

- Feature modules own workflow state such as search queries, selections, and commands. UI modules may own only transient presentation state that has no domain meaning.
- UI callbacks express user intent and are passed down from the owning feature or app controller. UI components do not perform network, MapLibre, or controller side effects directly. A UI component may observe nearby layout geometry to render itself; app controllers own measurements that coordinate layout across components or features.
- Keep the domain model, feature state, and commands shared across desktop and mobile. Use separate UI seams only when layout, focus management, scrolling, or interaction order changes materially. Keep feature-specific responsive rules beside the owning feature; keep reusable navigation, sheet, and layout rules in `frontend/src/ui/styles`.
- `NavigationPanelShell` keeps the desktop/mobile presentation seam. The app-owned `MobileSheet` module under `frontend/src/ui/mobile/` contains the Base UI Drawer integration; application navigation owns detents, and feature views receive state and callbacks without importing the library.
- Pure transformations and validators remain free of I/O, mutation, DOM work, and MapLibre effects.

The `pathfinding/` folder is the focused exception to the general infrastructure placement for walking effects: its `walking/` modules own the Valhalla client and directed stop-graph connection provider so walking effects stay with the pathfinding engine. Keep provider-specific payload parsing inside `valhalla-walking-client.ts`, and expose only the normalized `WalkingRouteEngine` contract to the pipeline.

## Migration map and order

Split `frontend/src/transit/render.ts` at its pure/effect boundary: reusable transit validation, geometry, and transport types belong in `shared/src`; frontend-only transformations remain in `frontend/src/domain`, and only MapLibre rendering and effect responsibilities belong in `frontend/src/infrastructure`.

| Current area | Target owner |
| --- | --- |
| Reusable transit and venue types and validation shared by the backend | `shared/src` |
| Frontend-only transit indexes and transformations, plus location and trip models | `frontend/src/domain` |
| Explore workflow state | `frontend/src/features/explore/state` |
| Feature-specific components and React state currently under `frontend/src/components` | `frontend/src/features` |
| Explore route browsing and venue workflows | `frontend/src/features/explore` |
| Nearby and favourite stop workflows and stop-specific UI | `frontend/src/features/stops` |
| Trip endpoints and Path presentation | `frontend/src/features/plan` |
| Path model, search, ordered planning stages, and walking boundary | `frontend/src/pathfinding` |
| Genuinely reusable primitives and layouts currently under `frontend/src/components` | `frontend/src/ui` |
| Shared navigation, desktop/mobile layout, mobile-sheet, route-chip, and reusable control styles | `frontend/src/ui/styles` |
| Only the remaining MapLibre rendering and effect responsibilities in `frontend/src/transit/render.ts`, plus `frontend/src/map`, data loaders, MapLibre lifecycle, markers, layers, and popups | `frontend/src/infrastructure` |
| `frontend/src/app/app.tsx` and composition in `frontend/src/main.tsx` | `frontend/src/app` |

Make architecture changes in small, behavior-preserving steps. Move imports atomically with each boundary change and keep one canonical source of truth.

## Refactor gates

- Make no behavior change: preserve route, stop, venue, endpoint, popup, keyboard, responsive, camera, and error behavior.
- Add no global state library or global mutable state.
- Add no schema-validation dependency; validate at existing infrastructure boundaries with project-owned logic.
- Add no compatibility re-exports for obsolete module paths. Update imports atomically instead of maintaining duplicate paths or sources of truth.
- Every adapter-created listener, layer, source, marker, popup, timer, and asynchronous operation must have an explicit cleanup or cancellation path.
