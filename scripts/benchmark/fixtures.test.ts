import { describe, expect, it } from 'vitest'
import { planJourneyWithinBudget } from '../../src/domain/trip/planner'
import { loadJourneyBenchmarkManifest } from './manifest'
import { createJourneyBenchmarkCases, loadJourneyBenchmarkFixtures } from './fixtures'
import { validateJourneyBenchmarkOutcome } from './outcome'

describe('manifest Journey correctness cases', () => {
  it('runs and validates all 50 cases with fixed local fixtures', async () => {
    const [manifest, fixtures] = await Promise.all([
      loadJourneyBenchmarkManifest(),
      loadJourneyBenchmarkFixtures(),
    ])
    const cases = createJourneyBenchmarkCases(manifest, fixtures)
    const results = await Promise.all(cases.map(async (benchmarkCase) => {
      let clockTicks = 0
      const result = await planJourneyWithinBudget(benchmarkCase.searchInput, {
        maxDurationMs: 350,
        maxExpandedPaths: 10_000,
        now: () => clockTicks++,
        yieldEvery: 0,
      })
      const outcome = result.journey
        ? { kind: 'journey' as const, journey: result.journey }
        : { kind: 'no-route' as const, reason: 'No journey was found for the fixed case.' }
      return {
        id: benchmarkCase.id,
        validation: validateJourneyBenchmarkOutcome(
          outcome,
          benchmarkCase,
          benchmarkCase.transit,
          fixtures.venues,
        ),
      }
    }))

    expect(cases).toHaveLength(50)
    expect(results.filter(({ validation }) => !validation.valid).map(({ id, validation }) => ({
      id,
      errors: validation.errors,
    }))).toEqual([])
    expect(results.filter(({ validation }) => validation.valid)).toHaveLength(50)
  }, 120_000)
})
