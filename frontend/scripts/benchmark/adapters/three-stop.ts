import {
  createJourneyPlanningService,
  NoPathAvailableError,
} from '../../../src/app/journey-planning.js'
import { searchPaths } from '../../../src/domain/trip/planner.js'
import type { Path } from '../../../src/pathfinding/path.js'
import { createWalkingConnectionProvider } from '../../../src/infrastructure/routing/walking-connections.js'
import type {
  JourneyBenchmarkAdapterFactory,
  JourneyBenchmarkOutcome,
} from '../contract.js'

function asOutcome(path: Path | null): JourneyBenchmarkOutcome {
  if (!path) return { kind: 'no-route', reason: 'The Journey service returned no route.' }
  return { kind: 'journey', path }
}

function createAbortError(): Error {
  const error = new Error('The benchmark Journey was cancelled')
  error.name = 'AbortError'
  return error
}

export const createJourneyBenchmarkAdapter: JourneyBenchmarkAdapterFactory = () => ({
  id: 'three-stop-single-shuttle',
  label: 'Three-stop single-shuttle planner',

  createSearchRunner({ benchmarkCase }) {
    return async (signal) => {
      if (signal.aborted) throw createAbortError()
      const path = searchPaths(benchmarkCase.searchInput)
      if (signal.aborted) throw createAbortError()
      return asOutcome(path)
    }
  },

  createJourneyRunner({ benchmarkCase, venues, transit, walkingGraph, routeEngine, now, createArrivalClient, createServiceHoursClient }) {
    const walkingConnectionProvider = createWalkingConnectionProvider({
      routeEngine,
      loadGraph: async () => walkingGraph,
    })
    const service = createJourneyPlanningService(
      routeEngine,
      createArrivalClient(benchmarkCase),
      createServiceHoursClient?.(benchmarkCase),
      now,
      walkingConnectionProvider,
    )

    return async (signal) => {
      try {
        const result = await service({
          tripRequest: {
            origin: benchmarkCase.origin,
            destination: benchmarkCase.destination,
          },
          venues,
          transit,
          signal,
        })
        return asOutcome(result?.candidates[0]?.path ?? null)
      } catch (error) {
        if (error instanceof NoPathAvailableError) {
          return { kind: 'no-route', reason: error.message }
        }
        throw error
      }
    }
  },
})
