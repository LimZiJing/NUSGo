import { access, readFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { dirname, isAbsolute, resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { createServer } from 'vite'
import { toViteFsModuleId } from './benchmark/vite-module-id.mjs'

const FIXED_OBSERVED_AT = '2026-10-01T00:00:00.000Z'
const FIXED_NOW_MS = Date.parse(FIXED_OBSERVED_AT)
const FIXED_EXPIRES_AT = '2026-10-01T03:00:00.000Z'
const DEFAULT_SAMPLES = 10
const DEFAULT_WARMUPS = 2
const MAX_RUNS = 1000

function parseCount(value, label, allowZero = false) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < (allowZero ? 0 : 1) || parsed > MAX_RUNS) {
    const lowerBound = allowZero ? '0' : '1'
    throw new Error(`${label} must be an integer from ${lowerBound} to ${MAX_RUNS}`)
  }
  return parsed
}

function validateLocalValhallaUrl(value) {
  let url
  try {
    url = new URL(value)
  } catch {
    throw new Error('valhalla-url must be a valid local HTTP URL')
  }
  if (
    url.protocol !== 'http:' ||
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error('valhalla-url must use HTTP on localhost, 127.0.0.1, or ::1 without credentials')
  }
  return url.toString().replace(/\/$/, '')
}

function parseArguments(args) {
  const options = {
    mode: 'all',
    samples: DEFAULT_SAMPLES,
    warmups: DEFAULT_WARMUPS,
    valhallaUrl: 'http://127.0.0.1:8002',
    adapterPaths: [],
  }
  for (const argument of args) {
    const equalsIndex = argument.indexOf('=')
    const key = equalsIndex < 0 ? argument : argument.slice(0, equalsIndex)
    const value = equalsIndex < 0 ? undefined : argument.slice(equalsIndex + 1)
    if (key === '--mode') options.mode = value
    else if (key === '--samples') options.samples = parseCount(value, 'samples')
    else if (key === '--warmups') options.warmups = parseCount(value, 'warmups', true)
    else if (key === '--valhalla-url') options.valhallaUrl = validateLocalValhallaUrl(value)
    else if (key === '--adapter') {
      if (!value || !isAbsolute(value)) throw new Error('--adapter requires an absolute TypeScript file path')
      options.adapterPaths.push(resolve(value))
    } else throw new Error(`Unknown benchmark option: ${key}`)
  }
  if (!['all', 'offline', 'local'].includes(options.mode)) {
    throw new Error('mode must be all, offline, or local')
  }
  if (options.adapterPaths.length === 0) {
    options.adapterPaths.push(resolve(process.cwd(), 'scripts/benchmark/adapters/current.ts'))
  }
  if (new Set(options.adapterPaths).size !== options.adapterPaths.length) {
    throw new Error('adapter paths must be unique')
  }
  return options
}

async function readJson(path) {
  return JSON.parse(await readFile(resolve(process.cwd(), path), 'utf8'))
}

function getGitIdentity() {
  const dotGitPath = resolve(process.cwd(), '.git')
  const dotGitContent = readFileSync(dotGitPath, 'utf8')
  const gitDirectory = dotGitContent.startsWith('gitdir: ')
    ? resolve(dirname(dotGitPath), dotGitContent.slice('gitdir: '.length).trim())
    : dotGitPath
  let commonDirectory = gitDirectory
  try {
    commonDirectory = resolve(gitDirectory, readFileSync(resolve(gitDirectory, 'commondir'), 'utf8').trim())
  } catch {
    // A regular checkout stores refs directly in .git.
  }
  const head = readFileSync(resolve(gitDirectory, 'HEAD'), 'utf8').trim()
  if (!head.startsWith('ref: ')) return { commit: head, branch: null }
  const branch = head.slice('ref: refs/heads/'.length)
  const refPath = resolve(commonDirectory, 'refs', 'heads', branch)
  try {
    return { commit: readFileSync(refPath, 'utf8').trim(), branch }
  } catch {
    const packedRefs = readFileSync(resolve(commonDirectory, 'packed-refs'), 'utf8')
    const packedRef = packedRefs.split('\n').find((line) => line.endsWith(` refs/heads/${branch}`))
    return { commit: packedRef?.split(' ')[0] ?? null, branch }
  }
}

function createArrivalSnapshot(transit, arrivalSeconds) {
  const stops = {}
  if (arrivalSeconds !== null) {
    for (const route of transit.index.routes) {
      for (const stopId of route.stopIds) {
        stops[stopId] ??= {}
        stops[stopId][route.id] = {
          nextArrivalSeconds: arrivalSeconds,
          upcomingArrivalSeconds: [arrivalSeconds],
          headwaySeconds: null,
        }
      }
    }
  }
  return {
    observedAt: FIXED_OBSERVED_AT,
    expiresAt: FIXED_EXPIRES_AT,
    snapshotVersion: `${FIXED_OBSERVED_AT}-1`,
    stops,
  }
}

function getEndpointCoordinate(endpoint, venues, transit) {
  if (endpoint.kind === 'stop') {
    const stop = transit.index.stopById.get(endpoint.id)
    if (!stop) throw new Error(`Unknown benchmark stop: ${endpoint.id}`)
    return { longitude: stop.longitude, latitude: stop.latitude }
  }
  const venue = venues[endpoint.id]
  if (!venue?.location) throw new Error(`Unknown benchmark venue: ${endpoint.id}`)
  return { longitude: venue.location.x, latitude: venue.location.y }
}

function distanceMeters(first, second) {
  const latitude = (first.latitude + second.latitude) / 2
  const longitudeScale = 111320 * Math.cos(latitude * Math.PI / 180)
  return Math.hypot(
    (second.longitude - first.longitude) * longitudeScale,
    (second.latitude - first.latitude) * 110540,
  )
}

function createOfflineWalkingConnections(benchmarkCase, fixtures) {
  const { transit, venues, walkingGraph } = fixtures
  if (benchmarkCase.id === 'no-shuttle-arrivals') {
    const from = getEndpointCoordinate(benchmarkCase.origin, venues, transit)
    const to = getEndpointCoordinate(benchmarkCase.destination, venues, transit)
    const distance = Math.round(distanceMeters(from, to))
    return [{
      from: benchmarkCase.origin,
      to: benchmarkCase.destination,
      durationSeconds: Math.max(1, Math.round(distance / 1.3)),
      distanceMeters: distance,
      geometry: {
        type: 'LineString',
        coordinates: [[from.longitude, from.latitude], [to.longitude, to.latitude]],
      },
    }]
  }
  return walkingGraph.connections.map((connection) => {
    const fromStopId = connection.fromKey.slice('stop:'.length)
    const toStopId = connection.toKey.slice('stop:'.length)
    const from = transit.index.stopById.get(fromStopId)
    const to = transit.index.stopById.get(toStopId)
    if (!from || !to) throw new Error('Walking stop graph does not match the transit fixture')
    return {
      from: { kind: 'stop', id: fromStopId },
      to: { kind: 'stop', id: toStopId },
      durationSeconds: connection.durationSeconds,
      distanceMeters: connection.distanceMeters,
      geometry: {
        type: 'LineString',
        coordinates: [[from.longitude, from.latitude], [to.longitude, to.latitude]],
      },
    }
  })
}

function createCaseDefinitions(fixtures, modules) {
  const definitions = [
    {
      id: 'direct-walk',
      label: 'Direct walk; shuttle arrivals delayed',
      origin: { kind: 'stop', id: 'MUSEUM' },
      destination: { kind: 'stop', id: 'UTOWN' },
      arrivalSeconds: 1800,
      expected: { outcome: 'journey', shuttleBoardings: 0, modes: ['walking'] },
    },
    {
      id: 'one-shuttle',
      label: 'One shuttle from OTH to UTOWN',
      origin: { kind: 'stop', id: 'OTH' },
      destination: { kind: 'stop', id: 'UTOWN' },
      arrivalSeconds: 30,
      expected: { outcome: 'journey', shuttleBoardings: 1, modes: ['shuttle'] },
    },
    {
      id: 'no-shuttle-arrivals',
      label: 'Direct venue walk with no shuttle arrivals',
      origin: { kind: 'venue', id: 'RC3-01-01' },
      destination: { kind: 'venue', id: 'RC3-01-04' },
      arrivalSeconds: null,
      expected: { outcome: 'journey', shuttleBoardings: 0, modes: ['walking'] },
    },
  ]
  return definitions.map((definition) => {
    const arrivalSnapshot = createArrivalSnapshot(fixtures.transit, definition.arrivalSeconds)
    const originCoordinate = getEndpointCoordinate(definition.origin, fixtures.venues, fixtures.transit)
    const destinationCoordinate = getEndpointCoordinate(definition.destination, fixtures.venues, fixtures.transit)
    return {
      ...definition,
      arrivalSnapshot,
      searchInput: {
        origin: { endpoint: definition.origin, coordinate: originCoordinate },
        destination: { endpoint: definition.destination, coordinate: destinationCoordinate },
        transitIndex: fixtures.transit.index,
        routeGeometry: fixtures.transit.geometry,
        shuttleTiming: fixtures.transit.shuttleTiming,
        walkingConnections: createOfflineWalkingConnections(definition, fixtures),
        getShuttleWaitingSeconds: modules.createLiveShuttleWaitingTimeProvider(arrivalSnapshot, FIXED_NOW_MS),
      },
    }
  })
}

async function loadBenchmarkModules(vite) {
  const [transitMapData, transitIndex, timing, walkingGraphModule, liveWaiting, venueValidation, valhalla, outcomeValidator] = await Promise.all([
    vite.ssrLoadModule('/src/domain/transit/map-data.ts'),
    vite.ssrLoadModule('/src/domain/transit/index.ts'),
    vite.ssrLoadModule('/src/domain/transit/timing.ts'),
    vite.ssrLoadModule('/src/infrastructure/routing/walking-stop-graph.ts'),
    vite.ssrLoadModule('/src/domain/trip/live-waiting.ts'),
    vite.ssrLoadModule('/src/domain/venue/validation.ts'),
    vite.ssrLoadModule('/src/infrastructure/routing/valhalla.ts'),
    vite.ssrLoadModule('/scripts/benchmark/outcome.ts'),
  ])
  return {
    validateTransitMapData: transitMapData.validateTransitMapData,
    createTransitIndex: transitIndex.createTransitIndex,
    generateShuttleTimingData: timing.generateShuttleTimingData,
    validateWalkingStopGraph: walkingGraphModule.validateWalkingStopGraph,
    createLiveShuttleWaitingTimeProvider: liveWaiting.createLiveShuttleWaitingTimeProvider,
    validateVenueLocationMap: venueValidation.validateVenueLocationMap,
    createValhallaRouteEngine: valhalla.createValhallaRouteEngine,
    validateOutcome: outcomeValidator.validateJourneyBenchmarkOutcome,
  }
}

async function loadFixtures(modules) {
  const [networkInput, geometryInput, venuesInput, walkingGraphInput] = await Promise.all([
    readJson('public/data/shuttle-network.json'),
    readJson('public/data/shuttle-routes.geojson'),
    readJson('public/data/venues.json'),
    readJson('public/data/walking-stop-graph.json'),
  ])
  const { network, geometry } = modules.validateTransitMapData(networkInput, geometryInput)
  const index = modules.createTransitIndex(network)
  const transit = {
    network: index.network,
    geometry,
    index,
    shuttleTiming: modules.generateShuttleTimingData(index.network, geometry, '2026-10-01'),
  }
  return {
    transit,
    venues: modules.validateVenueLocationMap(venuesInput),
    walkingGraph: modules.validateWalkingStopGraph(walkingGraphInput),
  }
}

async function findProjectRoot(adapterPath) {
  let current = dirname(adapterPath)
  while (true) {
    try {
      await Promise.all([access(resolve(current, 'package.json')), access(resolve(current, 'src'))])
      return current
    } catch {
      const parent = dirname(current)
      if (parent === current) throw new Error(`Could not find the project root for adapter: ${adapterPath}`)
      current = parent
    }
  }
}

async function loadAdapters(vite, paths, context) {
  const loaded = []
  for (const path of paths) {
    const module = await vite.ssrLoadModule(toViteFsModuleId(path))
    if (typeof module.createJourneyBenchmarkAdapter !== 'function') {
      throw new Error(`${path} must export createJourneyBenchmarkAdapter(context)`)
    }
    const adapter = await module.createJourneyBenchmarkAdapter(context)
    if (
      !adapter ||
      typeof adapter.id !== 'string' || adapter.id.trim().length === 0 ||
      typeof adapter.label !== 'string' || adapter.label.trim().length === 0 ||
      typeof adapter.createSearchRunner !== 'function' ||
      typeof adapter.createJourneyRunner !== 'function'
    ) {
      throw new Error(`${path} returned an invalid Journey benchmark adapter`)
    }
    loaded.push({ path, adapter })
  }
  const ids = loaded.map(({ adapter }) => adapter.id)
  if (new Set(ids).size !== ids.length) throw new Error('Adapter IDs must be unique in one benchmark run')
  return loaded
}

function createMeasuredRouteEngine(routeEngine) {
  let elapsedMs = 0
  let matrixRequestCount = 0
  let routeRequestCount = 0
  const instrument = (method, counter) => async (...args) => {
    counter()
    const startedAt = performance.now()
    try {
      return await routeEngine[method](...args)
    } finally {
      elapsedMs += performance.now() - startedAt
    }
  }
  return {
    reset() {
      elapsedMs = 0
      matrixRequestCount = 0
      routeRequestCount = 0
    },
    get elapsedMs() {
      return elapsedMs
    },
    get requestCounts() {
      return { matrix: matrixRequestCount, route: routeRequestCount }
    },
    routeWalking: instrument('routeWalking', () => { routeRequestCount += 1 }),
    matrixWalking: instrument('matrixWalking', () => { matrixRequestCount += 1 }),
  }
}

function summarizeStatistics(samples) {
  if (samples.length === 0) return null
  const sorted = [...samples].sort((first, second) => first - second)
  const mean = samples.reduce((sum, sample) => sum + sample, 0) / samples.length
  const median = sorted.length % 2 === 0
    ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
    : sorted[Math.floor(sorted.length / 2)]
  const p95 = sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)]
  const round = (value) => Number(value.toFixed(3))
  return {
    meanMs: round(mean),
    medianMs: round(median),
    p95Ms: round(p95),
    sampleCount: samples.length,
  }
}

function equalWeightMean(caseReports, statsKey) {
  if (caseReports.some((report) => !report[statsKey])) return null
  return Number((caseReports.reduce((sum, report) => sum + report[statsKey].meanMs, 0) / caseReports.length).toFixed(3))
}

function createArrivalClient(benchmarkCase) {
  const snapshot = benchmarkCase.arrivalSnapshot
  return { getArrivals: async () => snapshot }
}

function createAdapterContext(fixtures, routeEngine, caseDefs) {
  return {
    transit: fixtures.transit,
    venues: fixtures.venues,
    walkingGraph: fixtures.walkingGraph,
    routeEngine,
    now: () => FIXED_NOW_MS,
    createArrivalClient,
    cases: caseDefs,
  }
}

function createCaseContext(adapterContext, benchmarkCase) {
  return { ...adapterContext, benchmarkCase }
}

async function measureRun(runner, mode, routeEngine, benchmarkCase, fixtures, modules) {
  if (mode === 'local') routeEngine.reset()
  const startedAt = performance.now()
  const outcome = await runner(new AbortController().signal)
  const elapsedMs = performance.now() - startedAt
  const validation = modules.validateOutcome(outcome, benchmarkCase, fixtures.transit, fixtures.venues)
  const result = {
    elapsedMs,
    validation,
    outcome,
  }
  if (mode === 'local') {
    result.valhallaMs = routeEngine.elapsedMs
    result.valhallaRequests = routeEngine.requestCounts
  }
  return result
}

async function benchmarkMode(loadedAdapter, mode, caseDefs, adapterContext, fixtures, modules, options) {
  const isSearch = mode === 'offline'
  const makeRunnerName = isSearch ? 'createSearchRunner' : 'createJourneyRunner'
  const caseReports = []
  let modeStatus = 'available'

  for (const benchmarkCase of caseDefs) {
    let runner
    try {
      runner = await loadedAdapter.adapter[makeRunnerName](createCaseContext(adapterContext, benchmarkCase))
      if (typeof runner !== 'function') throw new Error(`${makeRunnerName} must return a runner function`)
    } catch (error) {
      modeStatus = 'partial'
      caseReports.push({ id: benchmarkCase.id, status: 'failed', error: error instanceof Error ? error.message : 'Adapter setup failed' })
      continue
    }

    const runRecords = []
    let failure = null
    for (let index = 0; index < options.warmups + options.samples; index += 1) {
      try {
        const record = await measureRun(runner, mode, adapterContext.routeEngine, benchmarkCase, fixtures, modules)
        if (!record.validation.valid) {
          failure = record.validation.errors.join('; ')
          if (index >= options.warmups) runRecords.push(record)
          break
        }
        if (index >= options.warmups) runRecords.push(record)
      } catch (error) {
        failure = error instanceof Error ? error.message : 'Adapter run failed'
        break
      }
    }

    const lastRecord = runRecords.at(-1)
    const caseReport = {
      id: benchmarkCase.id,
      label: benchmarkCase.label,
      expected: benchmarkCase.expected,
      status: failure ? 'failed' : 'available',
      statistics: summarizeStatistics(runRecords.map((record) => record.elapsedMs)),
      planning: lastRecord?.validation.result ?? null,
      validationErrors: failure ? [failure] : [],
      resultStableAcrossSamples: new Set(runRecords.map((record) => JSON.stringify(record.validation.result))).size <= 1,
    }
    if (lastRecord?.outcome?.diagnostics) caseReport.diagnostics = lastRecord.outcome.diagnostics
    if (!isSearch) {
      caseReport.valhalla = {
        ...summarizeStatistics(runRecords.flatMap((record) => record.valhallaMs === undefined ? [] : [record.valhallaMs])),
        definition: 'sum of local Valhalla matrix and route request durations within one case run',
        meanMatrixRequestsPerRun: runRecords.length
          ? Number((runRecords.reduce((sum, record) => sum + record.valhallaRequests.matrix, 0) / runRecords.length).toFixed(2))
          : null,
        meanRouteRequestsPerRun: runRecords.length
          ? Number((runRecords.reduce((sum, record) => sum + record.valhallaRequests.route, 0) / runRecords.length).toFixed(2))
          : null,
      }
    }
    if (failure) modeStatus = 'partial'
    caseReports.push(caseReport)
  }

  const report = {
    status: modeStatus,
    cases: caseReports,
    headline: isSearch
      ? {
        definition: 'equal-weight mean of the three per-case mean search times',
        meanMs: equalWeightMean(caseReports, 'statistics'),
        sampleCountPerCase: options.samples,
      }
      : {
        endToEnd: {
          definition: 'equal-weight mean of the three per-case mean end-to-end times',
          meanMs: equalWeightMean(caseReports, 'statistics'),
          sampleCountPerCase: options.samples,
        },
        valhalla: {
          definition: 'equal-weight mean of the three per-case mean summed Valhalla request times',
          meanMs: equalWeightMean(caseReports, 'valhalla'),
          sampleCountPerCase: options.samples,
        },
      },
  }
  return report
}

function unavailableMode(reason, mode, options) {
  return {
    status: 'not-run',
    reason,
    sampleCountPerCase: options.samples,
    mode,
  }
}

function formatMode(name, modeReport, local = false) {
  const lines = [`  ${name}: ${modeReport.status}`]
  if (modeReport.status !== 'available' && modeReport.status !== 'partial') {
    if (modeReport.reason) lines.push(`    ${modeReport.reason}`)
    return lines
  }
  for (const benchmarkCase of modeReport.cases) {
    if (!benchmarkCase.statistics) {
      lines.push(`    ${benchmarkCase.id}: ${benchmarkCase.status}${benchmarkCase.error ? ` (${benchmarkCase.error})` : ''}`)
      continue
    }
    const stats = benchmarkCase.statistics
    const result = benchmarkCase.planning?.kind ?? 'invalid'
    const boardings = benchmarkCase.planning?.shuttleBoardings
    lines.push(`    ${benchmarkCase.id}: mean ${stats.meanMs} ms, median ${stats.medianMs} ms, p95 ${stats.p95Ms} ms, n=${stats.sampleCount}; ${result}${boardings === undefined ? '' : `, ${boardings} shuttle boardings`}`)
    if (local && benchmarkCase.valhalla?.sampleCount !== undefined) {
      lines.push(`      Valhalla: mean ${benchmarkCase.valhalla.meanMs} ms, median ${benchmarkCase.valhalla.medianMs} ms, p95 ${benchmarkCase.valhalla.p95Ms} ms, n=${benchmarkCase.valhalla.sampleCount}`)
    }
    if (benchmarkCase.validationErrors?.length) lines.push(`      validation: ${benchmarkCase.validationErrors.join('; ')}`)
  }
  const headline = local ? modeReport.headline.endToEnd : modeReport.headline
  lines.push(`    equal-weight headline mean: ${headline.meanMs ?? 'unavailable'} ms`)
  if (local) lines.push(`    equal-weight Valhalla mean: ${modeReport.headline.valhalla.meanMs ?? 'unavailable'} ms`)
  return lines
}

function printReport(report) {
  const lines = [
    `NavUS Journey benchmark baseline ${report.baseline.commit ?? 'unknown'} (${report.baseline.branch ?? 'detached'})`,
    `Cases: ${report.configuration.samplesPerCase} samples and ${report.configuration.warmupsPerCase} warmups each; arrivals fixed at ${report.configuration.arrivalObservedAt}.`,
  ]
  for (const adapter of report.adapters) {
    lines.push(`\n${adapter.label} [${adapter.id}]`)
    if (adapter.loadError) {
      lines.push(`  adapter: unavailable (${adapter.loadError})`)
      continue
    }
    lines.push(...formatMode('Search-only offline', adapter.searchOnlyOffline))
    lines.push(...formatMode('End-to-end local Valhalla', adapter.endToEndLocalValhalla, true))
  }
  console.log(lines.join('\n'))
  console.log('\n--- JSON REPORT ---')
  console.log(JSON.stringify(report, null, 2))
  console.log('--- END JSON REPORT ---')
}

async function main() {
  const options = parseArguments(process.argv.slice(2))
  const adapterRoots = await Promise.all(options.adapterPaths.map(findProjectRoot))
  const vite = await createServer({
    appType: 'custom',
    configFile: false,
    logLevel: 'error',
    optimizeDeps: { noDiscovery: true, include: [] },
    root: process.cwd(),
    server: {
      fs: { allow: [...new Set([process.cwd(), ...adapterRoots])] },
      hmr: false,
      middlewareMode: true,
      ws: false,
    },
  })
  let loadedAdapters = []
  const report = {
    benchmark: 'NavUS Journey planner benchmark',
    baseline: getGitIdentity(),
    configuration: {
      mode: options.mode,
      samplesPerCase: options.samples,
      warmupsPerCase: options.warmups,
      adapterPaths: options.adapterPaths,
      fixedShuttleArrivals: true,
      arrivalObservedAt: FIXED_OBSERVED_AT,
      valhallaUrl: options.valhallaUrl,
    },
  }

  try {
    const modules = await loadBenchmarkModules(vite)
    const fixtures = await loadFixtures(modules)
    const caseDefs = createCaseDefinitions(fixtures, modules)
    const rawRouteEngine = modules.createValhallaRouteEngine({ baseUrl: options.valhallaUrl })
    const routeEngine = createMeasuredRouteEngine(rawRouteEngine)
    const adapterContext = createAdapterContext(fixtures, routeEngine, caseDefs)
    report.fixtures = {
      transitStops: fixtures.transit.index.stops.length,
      walkingConnections: fixtures.walkingGraph.connections.length,
      cases: caseDefs.map(({ id, label, origin, destination, arrivalSeconds, expected }) => ({
        id,
        label,
        origin,
        destination,
        fixedArrivalSeconds: arrivalSeconds,
        expected,
      })),
    }

    const adapterLoadResults = []
    for (const path of options.adapterPaths) {
      try {
        const [loaded] = await loadAdapters(vite, [path], adapterContext)
        loadedAdapters.push(loaded)
        adapterLoadResults.push({ loaded, path })
      } catch (error) {
        adapterLoadResults.push({ error: error instanceof Error ? error.message : 'Adapter loading failed', path })
      }
    }

    report.adapters = []
    for (const entry of adapterLoadResults) {
      if (entry.error) {
        report.adapters.push({
          id: entry.path,
          label: entry.path,
          path: entry.path,
          loadError: entry.error,
          searchOnlyOffline: unavailableMode('Adapter could not be loaded.', 'offline', options),
          endToEndLocalValhalla: unavailableMode('Adapter could not be loaded.', 'local', options),
        })
        process.exitCode = 2
        continue
      }
      const { adapter, path } = entry.loaded
      const adapterReport = { id: adapter.id, label: adapter.label, path }
      adapterReport.searchOnlyOffline = options.mode === 'all' || options.mode === 'offline'
        ? await benchmarkMode(entry.loaded, 'offline', caseDefs, adapterContext, fixtures, modules, options)
        : unavailableMode('Excluded by --mode=local.', 'offline', options)
      adapterReport.endToEndLocalValhalla = options.mode === 'all' || options.mode === 'local'
        ? await benchmarkMode(entry.loaded, 'local', caseDefs, adapterContext, fixtures, modules, options)
        : unavailableMode('Excluded by --mode=offline.', 'local', options)
      if (
        adapterReport.searchOnlyOffline.status === 'partial' ||
        adapterReport.endToEndLocalValhalla.status === 'partial'
      ) process.exitCode = 2
      report.adapters.push(adapterReport)
    }
    printReport(report)
  } finally {
    for (const { adapter } of loadedAdapters) await adapter.dispose?.()
    await vite.close()
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Journey benchmark failed')
  process.exitCode = 1
})
