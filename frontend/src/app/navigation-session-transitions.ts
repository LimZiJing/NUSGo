import { exploreViewReducer, type ExploreViewAction, type ExploreViewState } from '../features/explore-view/state'
import type { VenueSearchResult } from '../domain/venue/search'
import type { VenueLocation, VenueLocationMap } from '../domain/venue/types'
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
  readonly getExploreView: () => ExploreViewState
  readonly getVenues: () => VenueLocationMap | null
  readonly setExploreView: (panel: ExploreViewState) => void
  readonly selectVenue: (venue: VenueLocation) => void
  readonly clearVenue: () => void
}

export function createNavigationSessionPanelTransitions(
  host: NavigationSessionPanelHost,
) {
  const updatePanel = (action: ExploreViewAction): void => {
    if (host.isDisposed()) return
    host.setExploreView(exploreViewReducer(host.getExploreView(), action))
  }

  return {
    setExploreViewQuery(query: string): void {
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

    openShuttle(): void {
      host.enqueue(() => {
        if (host.isDisposed()) return
        updatePanel({ type: 'open-shuttle' })
      })
    },

    back(): void {
      host.enqueue(() => {
        if (host.isDisposed()) return
        const panel = host.getExploreView()
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
        const panel = host.getExploreView()
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
        if (host.getExploreView().mode !== 'venue-detail') return
        host.clearVenue()
        updatePanel({ type: 'map-click' })
      })
    },
  }
}
