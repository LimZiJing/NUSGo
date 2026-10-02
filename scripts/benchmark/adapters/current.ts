import {
  createJourneyPlanningService,
  NoJourneyAvailableError,
} from '../../../src/app/journey-planning.js'
import { planJourneyWithinBudget } from '../../../src/domain/trip/planner.js'
import type { Journey } from '../../../src/domain/trip/journey.js'
import { createWalkingConnectionProvider } from '../../../src/infrastructure/routing/walking-connections.js'
import type {
  JourneyBenchmarkAdapterFactory,
  JourneyBenchmarkOutcome,
} from '../contract.js'

const JOURNEY_SEARCH_MAX_DURATION_MS = 350
const JOURNEY_SEARCH_MAX_EXPANDED_PATHS = 10_000

function asOutcome(journey: Journey | null): JourneyBenchmarkOutcome {
  if (!journey) return { kind: 'no-route', reason: 'The Journey service returned no route.' }
  return { kind: 'journey', journey }
}

export const createJourneyBenchmarkAdapter: JourneyBenchmarkAdapterFactory = () => ({
  id: 'current-priority-queue',
  label: 'Current NavUS planner',

  createSearchRunner({ benchmarkCase }) {
    return async (signal) => {
      const result = await planJourneyWithinBudget(benchmarkCase.searchInput, {
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
      if (!result.journey) {
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
        journey: result.journey,
        diagnostics: {
          planningStatus: result.status,
          expandedPathCount: result.expandedPathCount,
        },
      }
    }
  },

  createJourneyRunner({ benchmarkCase, venues, transit, walkingGraph, routeEngine, now, createArrivalClient }) {
    const walkingConnectionProvider = createWalkingConnectionProvider({
      routeEngine,
      loadGraph: async () => walkingGraph,
    })
    const service = createJourneyPlanningService(
      routeEngine,
      createArrivalClient(benchmarkCase),
      undefined,
      now,
      walkingConnectionProvider,
    )

    return async (signal) => {
      try {
        const journey = await service({
          tripRequest: {
            origin: benchmarkCase.origin,
            destination: benchmarkCase.destination,
          },
          venues,
          transit,
          signal,
        })
        return asOutcome(journey)
      } catch (error) {
        if (error instanceof NoJourneyAvailableError) {
          return { kind: 'no-route', reason: error.message }
        }
        throw error
      }
    }
  },
})
