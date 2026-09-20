import type { LoadedTransitData, LoadedVenueData } from './contracts/data'
import { waitForAbortablePromise } from './navigation-session-startup'

type Resource = 'venue' | 'transit'

interface NavigationSessionResourceLoadingDependencies {
  readonly mapReady: Promise<void>
  readonly isDisposed: () => boolean
  readonly loadVenues: (signal: AbortSignal) => Promise<LoadedVenueData>
  readonly loadTransit: (signal: AbortSignal) => Promise<LoadedTransitData>
  readonly enqueue: (transition: () => void) => void
  readonly onVenueLoaded: (data: LoadedVenueData) => void
  readonly onTransitLoaded: (data: LoadedTransitData) => void
  readonly onLoadFailure: (resource: Resource, error: unknown) => void
}

interface NavigationSessionResourceLoading {
  readonly loadVenues: (signal: AbortSignal) => Promise<void>
  readonly loadTransit: (signal: AbortSignal) => Promise<void>
}

function isAbortError(error: unknown): boolean {
  return typeof error === 'object' && error !== null &&
    'name' in error && error.name === 'AbortError'
}

export function createNavigationSessionResourceLoading(
  dependencies: NavigationSessionResourceLoadingDependencies,
): NavigationSessionResourceLoading {
  const loadVenues = (signal: AbortSignal): Promise<void> => (
    Promise.resolve()
      .then(() => {
        if (dependencies.isDisposed() || signal.aborted) return
        return dependencies.loadVenues(signal)
      })
      .then((data) => {
        if (data === undefined) return
        if (!dependencies.isDisposed() && !signal.aborted) {
          dependencies.enqueue(() => {
            if (!dependencies.isDisposed() && !signal.aborted) {
              dependencies.onVenueLoaded(data)
            }
          })
        }
      }, (error: unknown) => {
        if (dependencies.isDisposed() || signal.aborted || isAbortError(error)) return
        dependencies.enqueue(() => dependencies.onLoadFailure('venue', error))
      })
  )

  const loadTransit = (signal: AbortSignal): Promise<void> => (
    Promise.resolve()
      .then(() => {
        if (dependencies.isDisposed() || signal.aborted) return
        return dependencies.loadTransit(signal)
      })
      .then((data) => {
        if (data === undefined) return
        return waitForAbortablePromise(dependencies.mapReady, signal).then(
          () => {
            if (!dependencies.isDisposed() && !signal.aborted) {
              dependencies.enqueue(() => {
                if (!dependencies.isDisposed() && !signal.aborted) {
                  dependencies.onTransitLoaded(data)
                }
              })
            }
          },
          (error: unknown) => {
            if (isAbortError(error)) return
            throw error
          },
        )
      }, (error: unknown) => {
        if (dependencies.isDisposed() || signal.aborted || isAbortError(error)) return
        dependencies.enqueue(() => dependencies.onLoadFailure('transit', error))
      })
  )

  return { loadVenues, loadTransit }
}
