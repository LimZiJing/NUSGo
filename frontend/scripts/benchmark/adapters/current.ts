import {
  createJourneyPlanningService,
  NoPathAvailableError,
} from '../../../src/app/journey-planning.js'
import { searchPathsWithinBudget } from '../../../src/domain/trip/planner.js'
import type { Path } from '../../../src/pathfinding/path.js'
import { createWalkingConnectionProvider } from '../../../src/infrastructure/routing/walking-connections.js'
import type {
  JourneyBenchmarkAdapterFactory,
  JourneyBenchmarkOutcome,
} from '../contract.js'

const JOURNEY_SEARCH_MAX_DURATION_MS = 350
const JOURNEY_SEARCH_MAX_EXPANDED_PATHS = 10_000

function asOutcome(path: Path | null): JourneyBenchmarkOutcome {
  if (!path) return { kind: 'no-route', reason: 'The Journey service returned no route.' }
  return { kind: 'journey', path }
}

export const createJourneyBenchmarkAdapter: JourneyBenchmarkAdapterFactory = () => ({
  id: 'current-priority-queue',
  label: 'Current NavUS planner',

  createSearchRunner({ benchmarkCase }) {
    return async (signal) => {
      const result = await searchPathsWithinBudget(benchmarkCase.searchInput, {
        maxDurationMs: JOURNEY_SEARCH_MAX_DURATION_MS,
        maxExpandedPaths: JOURNEY_SEARCH_MAX_EXPANDED_PATHS,
        shouldCancel: () => signal.aborted,
        yieldEvery: 0,
      })
      if (signal.aborted || result.status === 'cancelled') {
        const error = new Error('The benchmark search was cancelled')
        error.name = 'AbortError'
        throw error
      }
      if (!result.path) {
        return {
          kind: 'no-route',
          reason: `Planner returned no journey (${result.status}).`,
          diagnostics: {
            planningStatus: result.status,
            expandedPathCount: result.expandedPathCount,
          },
        }
      }
      return {
        kind: 'journey',
        path: result.path,
        diagnostics: {
          planningStatus: result.status,
          expandedPathCount: result.expandedPathCount,
        },
      }
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
