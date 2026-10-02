import {
  createJourneyPlanningService,
  NoJourneyAvailableError,
} from '../../../src/app/journey-planning.js'
import { planJourney } from '../../../src/domain/trip/planner.js'
import type { Journey } from '../../../src/domain/trip/journey.js'
import { createWalkingConnectionProvider } from '../../../src/infrastructure/routing/walking-connections.js'
import type {
  JourneyBenchmarkAdapterFactory,
  JourneyBenchmarkOutcome,
} from '../contract.js'

function asOutcome(journey: Journey | null): JourneyBenchmarkOutcome {
  if (!journey) return { kind: 'no-route', reason: 'The Journey service returned no route.' }
  return { kind: 'journey', journey }
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
      const journey = planJourney(benchmarkCase.searchInput)
      if (signal.aborted) throw createAbortError()
      return asOutcome(journey)
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
