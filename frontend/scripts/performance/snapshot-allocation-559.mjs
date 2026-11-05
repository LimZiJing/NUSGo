import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { performance, PerformanceObserver } from 'node:perf_hooks'
import { Session } from 'node:inspector/promises'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const baseRevision = process.env.PERF_BASE_REV ?? 'f21964595968dde261973f7e2cb965ce0ba600b7'
const repo = fileURLToPath(new URL('../../../', import.meta.url))
const modulePath = 'frontend/src/app/navigation-session-snapshot.ts'
const updateCount = Number(process.env.PERF_UPDATES ?? 60)
const coordinateCount = Number(process.env.PERF_COORDINATES ?? 1000)
const repetitions = Number(process.env.PERF_REPETITIONS ?? 3)
if (!globalThis.gc) throw new Error('Run with --expose-gc to measure post-GC heap')

const git = (...args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim()
const baseSource = git('show', baseRevision + ':' + modulePath)
const currentSource = await readFile(new URL('../../../' + modulePath, import.meta.url), 'utf8')
const currentRevision = git('rev-parse', 'HEAD')

function loadSnapshot(source, filename) {
  const result = ts.transpileModule(source, {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    reportDiagnostics: true,
  })
  const errors = (result.diagnostics ?? []).filter(({ category }) => category === ts.DiagnosticCategory.Error)
  if (errors.length) throw new Error(ts.formatDiagnostics(errors, {
    getCanonicalFileName: (name) => name,
    getCurrentDirectory: () => repo,
    getNewLine: () => '\n',
  }))
  return import('data:text/javascript;base64,' + Buffer.from(result.outputText).toString('base64'))
}
const [base, changed] = await Promise.all([
  loadSnapshot(baseSource, 'navigation-session-snapshot.base.ts'),
  loadSnapshot(currentSource, 'navigation-session-snapshot.changed.ts'),
])
const variants = [
  { name: 'base', freeze: base.freezeNavigationSessionSnapshot },
  { name: 'changed', freeze: changed.freezeNavigationSessionSnapshot },
]

function makePath(index) {
  const origin = { kind: 'venue', id: 'origin-' + index }
  const destination = { kind: 'venue', id: 'destination-' + index }
  return {
    origin, destination,
    totalDurationSeconds: 500 + index,
    totalDistanceMeters: 1000 + index,
    estimateStatus: 'estimated',
    planningQuality: 'exact',
    legs: [{
      mode: 'walking', from: origin, to: destination,
      durationSeconds: 500 + index, distanceMeters: 1000 + index,
      geometry: {
        type: 'LineString',
        coordinates: Array.from({ length: coordinateCount }, (_, pointIndex) => [
          103.7 + index * 0.001 + pointIndex * 0.000001,
          1.3 + index * 0.0001,
        ]),
      },
    }],
  }
}

function makeState(paths) {
  const candidates = paths.map((path, index) => ({
    candidateKey: 'candidate-' + index,
    path,
    adjustedDurationSeconds: path.totalDurationSeconds,
    score: 1 / path.totalDurationSeconds,
  }))
  return {
    venues: null, buildings: null, transitIndex: null,
    selectedRouteId: null, selectedRouteColor: null, rememberedMobileRouteId: null,
    exploreState: { mode: 'find-venue', query: '', selectedVenue: null, selectedBuildingId: null, history: [] },
    tripRequest: { origin: null, destination: null },
    path: {
      status: 'ready', path: paths[0] ?? null, candidates,
      displayedCandidates: [candidates[0], candidates[2]].filter(Boolean),
      selectedCandidateKey: candidates[0]?.candidateKey ?? null, error: null,
    },
    location: { status: 'tracking', latestFix: { longitude: 103.7, latitude: 1.3, accuracy: 5, timestamp: 0 } },
    originLocationRequest: { status: 'idle', error: null },
    locationMarkerVisible: true,
    resourceStatus: { venue: { status: 'pending' }, transit: { status: 'pending' } },
    mapError: null, startupFailure: null, status: '',
  }
}

function outputTupleCount(snapshot) {
  const paths = [snapshot.path.path, ...snapshot.path.candidates.map(({ path }) => path), ...snapshot.path.displayedCandidates.map(({ path }) => path)]
  const coordinates = new Set()
  for (const path of paths) {
    if (!path) continue
    for (const leg of path.legs) for (const point of leg.geometry.coordinates) coordinates.add(point)
  }
  return coordinates.size
}
function profileBytes(node) {
  return node.selfSize + (node.children ?? []).reduce((sum, child) => sum + profileBytes(child), 0)
}

const gcEntries = []
const observer = new PerformanceObserver((list) => gcEntries.push(...list.getEntries()))
observer.observe({ entryTypes: ['gc'] })
const session = new Session()
session.connect()

async function runSample(variant, profileAllocations) {
  globalThis.gc()
  await new Promise((resolve) => setImmediate(resolve))
  let snapshot = variant.freeze(makeState(Array.from({ length: 4 }, (_, index) => makePath(index))))
  await new Promise((resolve) => setImmediate(resolve))
  const gcBoundary = gcEntries.length
  const heapBefore = process.memoryUsage().heapUsed
  if (profileAllocations) await session.post('HeapProfiler.startSampling', { samplingInterval: 64 })
  const start = performance.now()
  for (let update = 0; update < updateCount; update += 1) {
    snapshot = variant.freeze({
      ...snapshot,
      exploreState: { ...snapshot.exploreState, query: 'venue ' + update },
      location: {
        status: 'tracking',
        latestFix: { longitude: 103.7 + update * 0.0001, latitude: 1.3, accuracy: 5, timestamp: update },
      },
    })
  }
  const end = performance.now()
  const durationMs = end - start
  const profile = profileAllocations ? (await session.post('HeapProfiler.stopSampling')).profile : null
  await new Promise((resolve) => setImmediate(resolve))
  gcEntries.push(...observer.takeRecords())
  const gc = gcEntries.slice(gcBoundary).filter((entry) => (
    entry.startTime >= start && entry.startTime < end
  ))
  return {
    durationMs: Number(durationMs.toFixed(3)),
    updatesPerSecond: Number((updateCount * 1000 / durationMs).toFixed(1)),
    finalSnapshotCoordinateTupleReferences: outputTupleCount(snapshot),
    liveHeapDeltaBytes: process.memoryUsage().heapUsed - heapBefore,
    gcCount: gc.length,
    gcDurationMs: Number(gc.reduce((sum, entry) => sum + entry.duration, 0).toFixed(3)),
    retainedSampledBytesAtProfileStop: profile ? profileBytes(profile.head) : null,
    retainedSampleCountAtProfileStop: profile?.samples?.length ?? null,
  }
}

try {
  const report = {
    baseRevision, currentRevision,
    workload: { candidatePaths: 4, displayedCandidates: 2, coordinatesPerPath: coordinateCount, unrelatedVenueAndLocationUpdates: updateCount, repetitions, samplingIntervalBytes: 64 },
    samples: [],
  }
  for (const variant of [...variants, ...variants.slice().reverse()]) await runSample(variant, false)
  for (let repetition = 0; repetition < repetitions; repetition += 1) {
    for (const variant of repetition % 2 === 0 ? variants : variants.slice().reverse()) {
      const allocation = await runSample(variant, true)
      const interaction = await runSample(variant, false)
      report.samples.push({ variant: variant.name, allocation, interaction })
    }
  }
  console.log(JSON.stringify(report, null, 2))
} finally {
  observer.disconnect()
  session.disconnect()
}
