import type { JourneyBenchmarkManifestCase } from './manifest.js'
import type { JourneyBenchmarkValidation } from './outcome.js'

export interface JourneyBenchmarkSample {
  readonly elapsedMs: number
  readonly valhallaMs?: number
  readonly validation: JourneyBenchmarkValidation
}

export interface JourneyBenchmarkCaseRun {
  readonly benchmarkCase: Pick<JourneyBenchmarkManifestCase, 'id' | 'label' | 'group' | 'scenario' | 'expected'>
  readonly samples: readonly JourneyBenchmarkSample[]
  readonly setupError?: string
}

export interface JourneyBenchmarkStatistics {
  readonly meanMs: number
  readonly medianMs: number
  readonly p95Ms: number
  readonly sampleCount: number
}

export interface JourneyBenchmarkQualityCounts {
  readonly journeys: number
  readonly noRoutes: number
  readonly exact: number
  readonly bounded: number
  readonly invalid: number
}

export interface JourneyBenchmarkValidationSummary {
  readonly status: 'valid' | 'invalid' | 'not-run'
  readonly validSampleCount: number
  readonly invalidSampleCount: number
  readonly errors: readonly string[]
}

export interface JourneyBenchmarkCaseReport {
  readonly id: string
  readonly label: string
  readonly group: string
  readonly scenario: string
  readonly status: 'available' | 'failed'
  readonly statistics: JourneyBenchmarkStatistics | null
  readonly valhalla: JourneyBenchmarkStatistics | null
  readonly resultQuality: JourneyBenchmarkQualityCounts
  readonly validation: JourneyBenchmarkValidationSummary
  readonly planning: Readonly<Record<string, unknown>> | null
  readonly resultStableAcrossSamples: boolean
  readonly error?: string
}

export interface JourneyBenchmarkAggregateReport {
  readonly caseCount: number
  readonly measuredCaseCount: number
  readonly sampleCount: number
  readonly statistics: JourneyBenchmarkStatistics | null
  readonly valhalla: JourneyBenchmarkStatistics | null
  readonly resultQuality: JourneyBenchmarkQualityCounts
  readonly validation: JourneyBenchmarkValidationSummary
}

export interface JourneyBenchmarkModeReport {
  readonly status: 'available' | 'partial'
  readonly cases: readonly JourneyBenchmarkCaseReport[]
  readonly overall: JourneyBenchmarkAggregateReport
  readonly categories: Readonly<Record<string, JourneyBenchmarkAggregateReport>>
}

function summarizeStatistics(values: readonly number[]): JourneyBenchmarkStatistics | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((first, second) => first - second)
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  const median = sorted.length % 2 === 0
    ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
    : sorted[Math.floor(sorted.length / 2)]
  const p95 = sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)]
  const round = (value: number) => Number(value.toFixed(3))
  return {
    meanMs: round(mean),
    medianMs: round(median),
    p95Ms: round(p95),
    sampleCount: values.length,
  }
}

function emptyQualityCounts(): JourneyBenchmarkQualityCounts {
  return { journeys: 0, noRoutes: 0, exact: 0, bounded: 0, invalid: 0 }
}

function countQuality(samples: readonly JourneyBenchmarkSample[]): JourneyBenchmarkQualityCounts {
  const counts = emptyQualityCounts()
  for (const sample of samples) {
    const result = sample.validation.result
    if (!sample.validation.valid) {
      counts.invalid += 1
      continue
    }
    if (result.kind === 'no-route') {
      counts.noRoutes += 1
      continue
    }
    if (result.kind !== 'journey') continue
    counts.journeys += 1
    if (result.planningQuality === 'exact') counts.exact += 1
    if (result.planningQuality === 'bounded') counts.bounded += 1
  }
  return counts
}

function summarizeValidation(
  samples: readonly JourneyBenchmarkSample[],
  expectedSamples: number,
  setupError?: string,
): JourneyBenchmarkValidationSummary {
  const invalidSampleCount = samples.filter(({ validation }) => !validation.valid).length
  const validSampleCount = samples.length - invalidSampleCount
  const errors = new Set<string>()
  for (const sample of samples) {
    for (const error of sample.validation.errors) errors.add(error)
  }
  if (setupError) errors.add(setupError)
  const status = samples.length === 0
    ? 'not-run'
    : invalidSampleCount > 0 || samples.length !== expectedSamples || setupError
      ? 'invalid'
      : 'valid'
  return { status, validSampleCount, invalidSampleCount, errors: [...errors] }
}

function createCaseReport(
  run: JourneyBenchmarkCaseRun,
  expectedSamples: number,
): JourneyBenchmarkCaseReport {
  const { benchmarkCase, samples, setupError } = run
  const validation = summarizeValidation(samples, expectedSamples, setupError)
  const timing = summarizeStatistics(samples.map(({ elapsedMs }) => elapsedMs))
  const valhalla = summarizeStatistics(
    samples.flatMap(({ valhallaMs }) => valhallaMs === undefined ? [] : [valhallaMs]),
  )
  const lastSample = samples.at(-1)
  const stableResults = new Set(samples.map(({ validation: result }) => JSON.stringify(result.result)))
  const failed = validation.status !== 'valid'
  return {
    id: benchmarkCase.id,
    label: benchmarkCase.label,
    group: benchmarkCase.group,
    scenario: benchmarkCase.scenario,
    status: failed ? 'failed' : 'available',
    statistics: timing,
    valhalla,
    resultQuality: countQuality(samples),
    validation,
    planning: lastSample?.validation.result ?? null,
    resultStableAcrossSamples: stableResults.size <= 1,
    ...(setupError ? { error: setupError } : {}),
  }
}

function sumQualityCounts(reports: readonly JourneyBenchmarkCaseReport[]): JourneyBenchmarkQualityCounts {
  return reports.reduce((sum, report) => ({
    journeys: sum.journeys + report.resultQuality.journeys,
    noRoutes: sum.noRoutes + report.resultQuality.noRoutes,
    exact: sum.exact + report.resultQuality.exact,
    bounded: sum.bounded + report.resultQuality.bounded,
    invalid: sum.invalid + report.resultQuality.invalid,
  }), emptyQualityCounts())
}

function aggregateValidation(reports: readonly JourneyBenchmarkCaseReport[]): JourneyBenchmarkValidationSummary {
  const validSampleCount = reports.reduce((sum, report) => sum + report.validation.validSampleCount, 0)
  const invalidSampleCount = reports.reduce((sum, report) => sum + report.validation.invalidSampleCount, 0)
  const errors = [...new Set(reports.flatMap((report) => report.validation.errors))]
  const notRun = reports.some((report) => report.validation.status === 'not-run')
  const status = invalidSampleCount > 0 || reports.some((report) => report.status === 'failed')
    ? 'invalid'
    : notRun
      ? 'not-run'
      : 'valid'
  return { status, validSampleCount, invalidSampleCount, errors }
}

function createAggregate(reports: readonly JourneyBenchmarkCaseReport[]): JourneyBenchmarkAggregateReport {
  const timedCases = reports.flatMap((report) => report.statistics ? [report.statistics.meanMs] : [])
  const valhallaCases = reports.flatMap((report) => report.valhalla ? [report.valhalla.meanMs] : [])
  return {
    caseCount: reports.length,
    measuredCaseCount: timedCases.length,
    sampleCount: reports.reduce((sum, report) => sum + (report.statistics?.sampleCount ?? 0), 0),
    statistics: summarizeStatistics(timedCases),
    valhalla: summarizeStatistics(valhallaCases),
    resultQuality: sumQualityCounts(reports),
    validation: aggregateValidation(reports),
  }
}

export function createJourneyBenchmarkModeReport(
  runs: readonly JourneyBenchmarkCaseRun[],
  expectedSamples: number,
): JourneyBenchmarkModeReport {
  if (!Number.isSafeInteger(expectedSamples) || expectedSamples < 1) {
    throw new Error('Expected benchmark sample count must be a positive integer')
  }
  const cases = runs.map((run) => createCaseReport(run, expectedSamples))
  const categories = Object.fromEntries(
    [...new Set(cases.map(({ group }) => group))]
      .map((group) => [group, createAggregate(cases.filter((report) => report.group === group))]),
  )
  return {
    status: cases.every(({ status }) => status === 'available') ? 'available' : 'partial',
    cases,
    overall: createAggregate(cases),
    categories,
  }
}

export function shouldFailBenchmarkRun(report: {
  readonly adapters?: readonly {
    readonly loadError?: string
    readonly searchOnlyOffline?: { readonly status?: string }
    readonly endToEndLocalValhalla?: { readonly status?: string }
  }[]
}): boolean {
  return report.adapters?.some((adapter) => Boolean(
    adapter.loadError ||
    (adapter.searchOnlyOffline && adapter.searchOnlyOffline.status !== 'available' && adapter.searchOnlyOffline.status !== 'not-run') ||
    (adapter.endToEndLocalValhalla && adapter.endToEndLocalValhalla.status !== 'available' && adapter.endToEndLocalValhalla.status !== 'not-run'),
  )) ?? false
}

export function compareBenchmarkCaseResults(
  reports: readonly { readonly id: string; readonly cases: readonly JourneyBenchmarkCaseReport[] }[],
): readonly {
  readonly caseId: string
  readonly results: readonly {
    readonly adapterId: string
    readonly status: JourneyBenchmarkCaseReport['status']
    readonly meanMs: number | null
    readonly planningQuality: unknown
    readonly validation: JourneyBenchmarkValidationSummary['status']
  }[]
  readonly outcomesMatch: boolean
}[] {
  const caseIds = [...new Set(reports.flatMap(({ cases }) => cases.map(({ id }) => id)))]
  return caseIds.map((caseId) => {
    const matching = reports.flatMap(({ id, cases }) => {
      const report = cases.find((item) => item.id === caseId)
      return report ? [{ adapterId: id, report }] : []
    })
    const semanticOutcome = (planning: Readonly<Record<string, unknown>> | null) => planning
      ? JSON.stringify({
        kind: planning.kind,
        modes: planning.modes,
        shuttleBoardings: planning.shuttleBoardings,
        routeIds: planning.routeIds,
      })
      : null
    const outcomes = matching.map(({ report }) => semanticOutcome(report.planning))
    return {
      caseId,
      results: matching.map(({ adapterId, report }) => ({
        adapterId,
        status: report.status,
        meanMs: report.statistics?.meanMs ?? null,
        planningQuality: report.planning?.planningQuality ?? null,
        validation: report.validation.status,
      })),
      outcomesMatch: outcomes.length > 0 && outcomes.every((outcome) => outcome === outcomes[0]),
    }
  })
}
