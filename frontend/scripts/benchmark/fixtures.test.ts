import { describe, expect, it } from 'vitest'
import { searchPathsWithinBudget } from '../../src/pathfinding/search/search-path-candidates'
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
      const result = await searchPathsWithinBudget(benchmarkCase.searchInput, {
        maxExpandedPaths: 10_000,
        now: () => clockTicks++,
        yieldEvery: 0,
      })
      const validations = result.candidates.map(({ path }) => validateJourneyBenchmarkOutcome(
        { kind: 'journey', path },
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
