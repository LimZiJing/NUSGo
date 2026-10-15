import { exploreReducer, type ExploreAction, type ExploreState } from '../features/explore/state/explore-state'
import type { VenueSearchResult } from '../domain/venue/search'
import type { BuildingIndex } from '../domain/venue/building-index'
import type { MapBuildingSelection } from './contracts/map'
import type { VenueLocation, VenueLocationMap } from '@navus/shared/venue/types'
import {
  createVenueSearchResultSnapshot,
  venuesMatch,
} from './navigation-session-validation'

interface NavigationSessionTransitionQueue {
  enqueue(transition: () => void): void
  clear(): void
}

export function createNavigationSessionTransitionQueue(
  isDisposed: () => boolean,
): NavigationSessionTransitionQueue {
  const transitions: Array<() => void> = []
  let processing = false

  return {
    enqueue(transition) {
      if (isDisposed()) return
      transitions.push(transition)
      if (processing) return

      processing = true
      try {
        while (!isDisposed() && transitions.length > 0) {
          transitions.shift()?.()
        }
      } catch (error) {
        transitions.length = 0
        throw error
      } finally {
        processing = false
        if (isDisposed()) transitions.length = 0
      }
    },

    clear() {
      transitions.length = 0
    },
  }
}

interface NavigationSessionPanelHost {
  readonly isDisposed: () => boolean
  readonly enqueue: (transition: () => void) => void
  readonly getExploreState: () => ExploreState
  readonly getVenues: () => VenueLocationMap | null
  readonly setExploreState: (panel: ExploreState) => void
  readonly selectVenue: (venue: VenueLocation) => void
  readonly getBuildings: () => BuildingIndex | null
  readonly selectBuilding: (building: MapBuildingSelection) => void
  readonly clearVenue: () => void
}

export function createNavigationSessionPanelTransitions(
  host: NavigationSessionPanelHost,
) {
  const updatePanel = (action: ExploreAction): void => {
    if (host.isDisposed()) return
    host.setExploreState(exploreReducer(host.getExploreState(), action))
  }

  return {
    setExploreQuery(query: string): void {
      host.enqueue(() => {
        if (host.isDisposed()) return
        updatePanel({ type: 'set-query', query })
      })
    },

    selectVenue(result: VenueSearchResult): void {
      host.enqueue(() => {
        if (host.isDisposed()) return
        if (typeof result?.code !== 'string') return
        const venue = host.getVenues()?.[result.code]
        if (!venue || !result.venue || !venuesMatch(result.venue, venue)) return
        host.selectVenue(venue)
        updatePanel({
          type: 'select-venue',
          result: createVenueSearchResultSnapshot(result.code, venue),
        })
      })
    },

    selectBuilding(buildingId: string): void {
      host.enqueue(() => {
        if (host.isDisposed()) return
        const entry = typeof buildingId === 'string' ? host.getBuildings()?.byId.get(buildingId) : undefined
        if (!entry) return
        host.selectBuilding({
          name: entry.name,
          locations: entry.parts.map((part) => part.location),
        })
        updatePanel({ type: 'select-building', buildingId: entry.id })
      })
    },

    openBusRoutes(): void {
      host.enqueue(() => {
        if (host.isDisposed()) return
        updatePanel({ type: 'open-bus-routes' })
      })
    },

    back(): void {
      host.enqueue(() => {
        if (host.isDisposed()) return
        const panel = host.getExploreState()
        const previousState = panel.history.at(-1)
        if (panel.mode === 'venue-detail' && previousState?.mode !== 'venue-detail') {
          host.clearVenue()
        }
        updatePanel({ type: 'back' })
      })
    },

    escape(): void {
      host.enqueue(() => {
        if (host.isDisposed()) return
        const panel = host.getExploreState()
        const previousState = panel.history.at(-1)
        if (
          !previousState ||
          (panel.mode === 'venue-detail' && previousState.mode !== 'venue-detail')
        ) {
          host.clearVenue()
        }
        updatePanel({ type: 'escape' })
      })
    },

    closeToRoot(): void {
      host.enqueue(() => {
        if (host.isDisposed()) return
        updatePanel({ type: 'close-to-root' })
      })
    },

    handleMapClick(): void {
      host.enqueue(() => {
        if (host.isDisposed()) return
        if (host.getExploreState().mode !== 'venue-detail') return
        host.clearVenue()
        updatePanel({ type: 'map-click' })
      })
    },
  }
}
