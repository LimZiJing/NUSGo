import { readFile } from 'node:fs/promises'

export type JourneyBenchmarkGroup = 'normal' | 'fallback' | 'timing'
export type JourneyBenchmarkScenario =
  | 'route-pair'
  | 'one-shuttle'
  | 'selection-tie'
  | 'missing-arrivals'
  | 'stale-expired-arrivals'
  | 'closed-service'
  | 'invalid-shuttle-timing'
  | 'multi-transfer-only'
  | 'fresh'
  | 'stale'
  | 'headway'
  | 'pre-service'
  | 'post-service'

export interface JourneyBenchmarkEndpoint {
  readonly kind: 'venue' | 'stop'
  readonly id: string
}

export interface JourneyBenchmarkExpectation {
  readonly outcome: 'journey' | 'no-route'
  readonly shuttleBoardings?: number
  readonly modes?: readonly ('walking' | 'shuttle')[]
  readonly routeIds?: readonly string[]
}

export interface JourneyBenchmarkDurationBounds {
  readonly min?: number
  readonly max?: number
}

export interface JourneyBenchmarkManifestCase {
  readonly id: string
  readonly label: string
  readonly group: JourneyBenchmarkGroup
  readonly scenario: JourneyBenchmarkScenario
  readonly origin: JourneyBenchmarkEndpoint
  readonly destination: JourneyBenchmarkEndpoint
  readonly timingProfile: string
  readonly arrivalRouteIds?: readonly string[]
  readonly expected: JourneyBenchmarkExpectation
  readonly durationBoundsSeconds?: JourneyBenchmarkDurationBounds
}

export interface JourneyBenchmarkTimingProfile {
  readonly id: string
  readonly arrivals: 'fresh' | 'stale' | 'expired' | 'headway' | 'missing'
  readonly observedAgeSeconds: number
  readonly expiresInSeconds: number
  readonly arrivalSeconds: number | null
  readonly headwayMedianSeconds: number | null
  readonly service: 'active' | 'before-start' | 'after-end'
  readonly shuttleTiming: 'canonical' | 'equal-rides' | 'unavailable'
  readonly shuttleRideSecondsOverride: number | null
}

export interface JourneyBenchmarkManifest {
  readonly version: 1
  readonly fixedNow: string
  readonly profiles: readonly JourneyBenchmarkTimingProfile[]
  readonly cases: readonly JourneyBenchmarkManifestCase[]
}

const EXPECTED_CASE_COUNTS = {
  normal: 40,
  fallback: 5,
  timing: 5,
  'route-pair': 20,
  'one-shuttle': 10,
  'selection-tie': 10,
} as const

const GROUP_SCENARIOS: Readonly<Record<JourneyBenchmarkGroup, readonly JourneyBenchmarkScenario[]>> = {
  normal: ['route-pair', 'one-shuttle', 'selection-tie'],
  fallback: [
    'missing-arrivals',
    'stale-expired-arrivals',
    'closed-service',
    'invalid-shuttle-timing',
    'multi-transfer-only',
  ],
  timing: ['fresh', 'stale', 'headway', 'pre-service', 'post-service'],
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requireText(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string`)
  }
  return value
}

function requireNonNegativeInteger(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer`)
  }
  return value
}

function validateEndpoint(value: unknown, label: string): JourneyBenchmarkEndpoint {
  if (!isRecord(value) || (value.kind !== 'venue' && value.kind !== 'stop')) {
    throw new Error(`${label} must reference a venue or stop`)
  }
  return {
    kind: value.kind,
    id: requireText(value.id, `${label}.id`),
  }
}

function validateStringArray(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${label} must be a non-empty array`)
  }
  const items = value.map((item, index) => requireText(item, `${label}[${index}]`))
  if (new Set(items).size !== items.length) throw new Error(`${label} must not contain duplicates`)
  return items
}

function validateProfile(value: unknown, index: number): JourneyBenchmarkTimingProfile {
  const label = `profiles[${index}]`
  if (!isRecord(value)) throw new Error(`${label} must be an object`)
  const arrivals = value.arrivals
  if (!['fresh', 'stale', 'expired', 'headway', 'missing'].includes(String(arrivals))) {
    throw new Error(`${label}.arrivals is unsupported`)
  }
  const service = value.service
  if (!['active', 'before-start', 'after-end'].includes(String(service))) {
    throw new Error(`${label}.service is unsupported`)
  }
  const shuttleTiming = value.shuttleTiming
  if (!['canonical', 'equal-rides', 'unavailable'].includes(String(shuttleTiming))) {
    throw new Error(`${label}.shuttleTiming is unsupported`)
  }
  const arrivalSeconds = value.arrivalSeconds === null
    ? null
    : requireNonNegativeInteger(value.arrivalSeconds, `${label}.arrivalSeconds`)
  const headwayMedianSeconds = value.headwayMedianSeconds === null
    ? null
    : requireNonNegativeInteger(value.headwayMedianSeconds, `${label}.headwayMedianSeconds`)
  const shuttleRideSecondsOverride = value.shuttleRideSecondsOverride === null
    ? null
    : requireNonNegativeInteger(value.shuttleRideSecondsOverride, `${label}.shuttleRideSecondsOverride`)
  if ((arrivals === 'missing' || arrivals === 'headway') && arrivalSeconds !== null) {
    throw new Error(`${label}.arrivalSeconds must be null for ${arrivals} arrivals`)
  }
  if (arrivals === 'headway' && headwayMedianSeconds === null) {
    throw new Error(`${label}.headwayMedianSeconds is required for headway arrivals`)
  }
  if (shuttleTiming === 'equal-rides' && shuttleRideSecondsOverride === null) {
    throw new Error(`${label}.shuttleRideSecondsOverride is required for equal-rides timing`)
  }

  return {
    id: requireText(value.id, `${label}.id`),
    arrivals,
    observedAgeSeconds: requireNonNegativeInteger(value.observedAgeSeconds, `${label}.observedAgeSeconds`),
    expiresInSeconds: typeof value.expiresInSeconds === 'number' && Number.isSafeInteger(value.expiresInSeconds)
      ? value.expiresInSeconds
      : (() => { throw new Error(`${label}.expiresInSeconds must be an integer`) })(),
    arrivalSeconds,
    headwayMedianSeconds,
    service,
    shuttleTiming,
    shuttleRideSecondsOverride,
  }
}

function validateExpectation(value: unknown, label: string): JourneyBenchmarkExpectation {
  if (!isRecord(value) || (value.outcome !== 'journey' && value.outcome !== 'no-route')) {
    throw new Error(`${label} must declare a journey or no-route outcome`)
  }
  const shuttleBoardings = value.shuttleBoardings === undefined
    ? undefined
    : requireNonNegativeInteger(value.shuttleBoardings, `${label}.shuttleBoardings`)
  let modes: readonly ('walking' | 'shuttle')[] | undefined
  if (value.modes !== undefined) {
    if (
      !Array.isArray(value.modes) ||
      value.modes.length === 0 ||
      !value.modes.every((mode) => mode === 'walking' || mode === 'shuttle')
    ) throw new Error(`${label}.modes must be a non-empty walking/shuttle sequence`)
    modes = value.modes
  }
  const routeIds = value.routeIds === undefined
    ? undefined
    : validateStringArray(value.routeIds, `${label}.routeIds`)
  if (routeIds && !modes?.includes('shuttle')) {
    throw new Error(`${label}.routeIds requires a shuttle mode expectation`)
  }
  return {
    outcome: value.outcome,
    ...(shuttleBoardings === undefined ? {} : { shuttleBoardings }),
    ...(modes === undefined ? {} : { modes }),
    ...(routeIds === undefined ? {} : { routeIds }),
  }
}

function validateCase(
  value: unknown,
  index: number,
  profiles: ReadonlySet<string>,
): JourneyBenchmarkManifestCase {
  const label = `cases[${index}]`
  if (!isRecord(value)) throw new Error(`${label} must be an object`)
  const group = value.group
  if (group !== 'normal' && group !== 'fallback' && group !== 'timing') {
    throw new Error(`${label}.group is unsupported`)
  }
  const scenario = value.scenario
  if (typeof scenario !== 'string' || !GROUP_SCENARIOS[group].includes(scenario as JourneyBenchmarkScenario)) {
    throw new Error(`${label}.scenario is unsupported for ${group}`)
  }
  const timingProfile = requireText(value.timingProfile, `${label}.timingProfile`)
  if (!profiles.has(timingProfile)) throw new Error(`${label} references unknown timing profile ${timingProfile}`)

  let arrivalRouteIds: readonly string[] | undefined
  if (value.arrivalRouteIds !== undefined) {
    if (!Array.isArray(value.arrivalRouteIds) || value.arrivalRouteIds.length === 0) {
      throw new Error(`${label}.arrivalRouteIds must be a non-empty array when provided`)
    }
    arrivalRouteIds = validateStringArray(value.arrivalRouteIds, `${label}.arrivalRouteIds`)
  }

  let durationBoundsSeconds: JourneyBenchmarkDurationBounds | undefined
  if (value.durationBoundsSeconds !== undefined) {
    if (!isRecord(value.durationBoundsSeconds)) {
      throw new Error(`${label}.durationBoundsSeconds must be an object`)
    }
    const min = value.durationBoundsSeconds.min === undefined
      ? undefined
      : requireNonNegativeInteger(value.durationBoundsSeconds.min, `${label}.durationBoundsSeconds.min`)
    const max = value.durationBoundsSeconds.max === undefined
      ? undefined
      : requireNonNegativeInteger(value.durationBoundsSeconds.max, `${label}.durationBoundsSeconds.max`)
    if (min === undefined && max === undefined) {
      throw new Error(`${label}.durationBoundsSeconds must include a min or max`)
    }
    if (min !== undefined && max !== undefined && min > max) {
      throw new Error(`${label}.durationBoundsSeconds.min must not exceed max`)
    }
    durationBoundsSeconds = { ...(min === undefined ? {} : { min }), ...(max === undefined ? {} : { max }) }
  }

  return {
    id: requireText(value.id, `${label}.id`),
    label: requireText(value.label, `${label}.label`),
    group,
    scenario: scenario as JourneyBenchmarkScenario,
    origin: validateEndpoint(value.origin, `${label}.origin`),
    destination: validateEndpoint(value.destination, `${label}.destination`),
    timingProfile,
    ...(arrivalRouteIds === undefined ? {} : { arrivalRouteIds }),
    expected: validateExpectation(value.expected, `${label}.expected`),
    ...(durationBoundsSeconds === undefined ? {} : { durationBoundsSeconds }),
  }
}

export function validateJourneyBenchmarkManifest(input: unknown): JourneyBenchmarkManifest {
  if (!isRecord(input) || input.version !== 1) {
    throw new Error('Journey benchmark manifest version must be 1')
  }
  if (typeof input.fixedNow !== 'string' || !Number.isFinite(Date.parse(input.fixedNow))) {
    throw new Error('Journey benchmark manifest fixedNow must be a valid timestamp')
  }
  if (!Array.isArray(input.profiles) || input.profiles.length === 0) {
    throw new Error('Journey benchmark manifest profiles must not be empty')
  }
  const profiles = input.profiles.map(validateProfile)
  const profileIds = profiles.map(({ id }) => id)
  if (new Set(profileIds).size !== profileIds.length) throw new Error('Journey benchmark timing profile IDs must be unique')
  const profileIdSet = new Set(profileIds)

  if (!Array.isArray(input.cases)) throw new Error('Journey benchmark manifest cases must be an array')
  const cases = input.cases.map((value, index) => validateCase(value, index, profileIdSet))
  if (cases.length !== 50) throw new Error(`Journey benchmark manifest must contain exactly 50 cases; got ${cases.length}`)
  const caseIds = cases.map(({ id }) => id)
  const caseLabels = cases.map(({ label }) => label)
  if (new Set(caseIds).size !== cases.length) throw new Error('Journey benchmark case IDs must be unique')
  if (new Set(caseLabels).size !== cases.length) throw new Error('Journey benchmark case labels must be unique')

  const groupCounts = new Map<JourneyBenchmarkGroup, number>()
  const scenarioCounts = new Map<string, number>()
  for (const benchmarkCase of cases) {
    groupCounts.set(benchmarkCase.group, (groupCounts.get(benchmarkCase.group) ?? 0) + 1)
    scenarioCounts.set(benchmarkCase.scenario, (scenarioCounts.get(benchmarkCase.scenario) ?? 0) + 1)
  }
  for (const [group, count] of Object.entries(EXPECTED_CASE_COUNTS).filter(([key]) => ['normal', 'fallback', 'timing'].includes(key))) {
    if (groupCounts.get(group as JourneyBenchmarkGroup) !== count) {
      throw new Error(`Journey benchmark manifest must contain ${count} ${group} cases`)
    }
  }
  for (const scenario of ['route-pair', 'one-shuttle', 'selection-tie'] as const) {
    if (scenarioCounts.get(scenario) !== EXPECTED_CASE_COUNTS[scenario]) {
      throw new Error(`Journey benchmark manifest must contain ${EXPECTED_CASE_COUNTS[scenario]} ${scenario} cases`)
    }
  }
  for (const group of ['fallback', 'timing'] as const) {
    for (const scenario of GROUP_SCENARIOS[group]) {
      if (scenarioCounts.get(scenario) !== 1) {
        throw new Error(`Journey benchmark manifest must contain exactly one ${scenario} case`)
      }
    }
  }

  return {
    version: 1,
    fixedNow: input.fixedNow,
    profiles: Object.freeze(profiles),
    cases: Object.freeze(cases),
  }
}

export async function loadJourneyBenchmarkManifest(): Promise<JourneyBenchmarkManifest> {
  const source = await readFile(new URL('./cases.json', import.meta.url), 'utf8')
  return validateJourneyBenchmarkManifest(JSON.parse(source) as unknown)
}
