import { describe, expect, it } from 'vitest'
import type { PathfindingBenchmarkValidation } from './outcome'
import type { PathfindingBenchmarkCaseRun } from './report'
import {
  compareBenchmarkCaseResults,
  createPathfindingBenchmarkModeReport,
  shouldFailBenchmarkRun,
} from './report'

function run(
  id: string,
  label: string,
  elapsedMs: number,
  valhallaMs: number,
  valid = true,
  planningQuality: 'exact' | 'bounded' = 'exact',
  routeId = 'P',
): PathfindingBenchmarkCaseRun {
  const validation: PathfindingBenchmarkValidation = {
    valid,
    errors: valid ? [] : ['wrong result'],
    result: {
      kind: 'path',
      modes: ['shuttle'],
      shuttleBoardings: 1,
      routeIds: [routeId],
      planningQuality,
      totalDurationSeconds: 100,
      searchDurationMs: 10,
      searchYieldWaitMs: 3,
      searchCpuMs: 7,
      maxSearchChunkDurationMs: 2,
    },
  }
  return {
    benchmarkCase: { id, label, group: 'normal', scenario: 'route-pair', expected: { outcome: 'path' } },
    samples: [{ elapsedMs, valhallaMs, validation }],
  }
}

describe('Path benchmark report aggregation', () => {
  it('reports per-case and equal-weight aggregate timing, Valhalla, quality, and validation', () => {
    const report = createPathfindingBenchmarkModeReport([
      {
        benchmarkCase: { id: 'quick', label: 'Quick', group: 'normal', scenario: 'route-pair', expected: { outcome: 'path' } },
        samples: [
          run('quick', 'Quick', 10, 4).samples[0],
          run('quick', 'Quick', 20, 6).samples[0],
        ],
      },
      {
        benchmarkCase: { id: 'slow', label: 'Slow', group: 'fallback', scenario: 'missing-arrivals', expected: { outcome: 'path' } },
        samples: [
          run('slow', 'Slow', 50, 20, true, 'bounded').samples[0],
          run('slow', 'Slow', 70, 40, true, 'bounded').samples[0],
        ],
      },
    ], 2)

    expect(report.cases[0].statistics).toMatchObject({ meanMs: 15, medianMs: 15, p95Ms: 20, sampleCount: 2 })
    expect(report.overall.statistics).toMatchObject({ meanMs: 37.5, medianMs: 37.5, p95Ms: 60, sampleCount: 2 })
    expect(report.overall.valhalla).toMatchObject({ meanMs: 17.5, sampleCount: 2 })
    expect(report.overall.sampleCount).toBe(4)
    expect(report.overall.resultQuality).toMatchObject({ paths: 4, exact: 2, bounded: 2, invalid: 0 })
    expect(report.cases[0].planningWork).toMatchObject({
      searchDurationMs: { mean: 10 },
      searchYieldWaitMs: { mean: 3 },
      searchCpuMs: { mean: 7 },
      maxSearchChunkDurationMs: { mean: 2, max: 2 },
    })
    expect(report.overall.validation.status).toBe('valid')
    expect(report.categories.normal.caseCount).toBe(1)
    expect(report.categories.fallback.caseCount).toBe(1)
  })

  it('reports matrix and routed geometry time and request counts separately', () => {
    const sample = run('local', 'Local', 80, 40).samples[0]
    const report = createPathfindingBenchmarkModeReport([{
      benchmarkCase: {
        id: 'local',
        label: 'Local',
        group: 'normal',
        scenario: 'route-pair',
        expected: { outcome: 'path' },
      },
      samples: [{
        ...sample,
        valhallaMatrixMs: 15,
        valhallaRouteMs: 25,
        valhallaMatrixRequests: 2,
        valhallaRouteRequests: 3,
      }],
    }], 1)

    expect(report.cases[0]).toMatchObject({
      valhallaMatrixMs: { meanMs: 15 },
      valhallaRouteMs: { meanMs: 25 },
      valhallaMatrixRequests: { mean: 2, median: 2, p95: 2, sampleCount: 1 },
      valhallaRouteRequests: { mean: 3, median: 3, p95: 3, sampleCount: 1 },
    })
    expect(report.cases[0].valhallaMatrixRequests).not.toHaveProperty('meanMs')
    expect(report.overall.valhallaMatrixRequests).toEqual({
      mean: 2,
      median: 2,
      p95: 2,
      sampleCount: 1,
    })
    expect(report.overall.valhallaRouteMs).toMatchObject({ meanMs: 25 })
  })

  it('marks any invalid or incomplete case as partial', () => {
    const report = createPathfindingBenchmarkModeReport([
      { ...run('invalid', 'Invalid', 10, 0, false), samples: run('invalid', 'Invalid', 10, 0, false).samples },
      { ...run('missing', 'Missing', 0, 0), samples: [], setupError: 'Adapter runner failed' },
    ], 2)

    expect(report.status).toBe('partial')
    expect(report.cases[0].validation).toMatchObject({ status: 'invalid', invalidSampleCount: 1 })
    expect(report.cases[1].validation).toMatchObject({ status: 'not-run', errors: ['Adapter runner failed'] })
    expect(report.overall.validation.status).toBe('invalid')
  })

  it('compares semantic outcomes separately from duration differences', () => {
    const first = createPathfindingBenchmarkModeReport([run('one', 'One', 10, 1)], 1)
    const second = createPathfindingBenchmarkModeReport([run('one', 'One', 20, 5)], 1)
    const differentRoute = createPathfindingBenchmarkModeReport([run('one', 'One', 15, 2, true, 'exact', 'R1')], 1)

    expect(compareBenchmarkCaseResults([
      { id: 'first', cases: first.cases },
      { id: 'second', cases: second.cases },
    ])[0].outcomesMatch).toBe(true)
    expect(compareBenchmarkCaseResults([
      { id: 'first', cases: first.cases },
      { id: 'different', cases: differentRoute.cases },
    ])[0].outcomesMatch).toBe(false)
  })

  it('requests a failing process exit for invalid cases and adapter load failures', () => {
    const partial = createPathfindingBenchmarkModeReport([run('invalid', 'Invalid', 10, 0, false)], 1)
    const available = createPathfindingBenchmarkModeReport([run('valid', 'Valid', 10, 0)], 1)

    expect(shouldFailBenchmarkRun({ adapters: [{ searchOnlyOffline: partial }] })).toBe(true)
    expect(shouldFailBenchmarkRun({ adapters: [{ loadError: 'Missing factory' }] })).toBe(true)
    expect(shouldFailBenchmarkRun({ adapters: [{ searchOnlyOffline: available }] })).toBe(false)
    expect(shouldFailBenchmarkRun({ adapters: [{ searchOnlyOffline: { status: 'not-run' } }] })).toBe(false)
  })
})
