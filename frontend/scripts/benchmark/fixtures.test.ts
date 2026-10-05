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
        maxExpandedPaths: 10_000,
        now: () => clockTicks++,
        yieldEvery: 0,
      })
      const validations = result.candidates.map(({ journey }) => validateJourneyBenchmarkOutcome(
        { kind: 'journey', journey },
        benchmarkCase,
        benchmarkCase.transit,
        fixtures.venues,
        { mode: 'offline', valhallaRequestCounts: { matrix: 0, route: 0 } },
      ))
      const validation = validations.find((candidate) => candidate.valid) ?? (
        result.candidates.length === 0
          ? validateJourneyBenchmarkOutcome(
            { kind: 'no-route', reason: 'No journey was found for the fixed case.' },
            benchmarkCase,
            benchmarkCase.transit,
            fixtures.venues,
            { mode: 'offline', valhallaRequestCounts: { matrix: 0, route: 0 } },
          )
          : validations[0]!
      )
      return {
        id: benchmarkCase.id,
        validation,
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
