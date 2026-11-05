import { readFile, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { join, resolve } from 'node:path'

const repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()
const cacheRoot = resolve(repoRoot, '.cache/performance-orchestration/real-performance')
const defaultInputs = [
  'sheet-smoke-touch-fixed.json',
  'sheet-validated-comparison.json',
  'sheet-touch-validated-comparison.json',
]
const inputs = process.argv.slice(2).length ? process.argv.slice(2) : defaultInputs
const resolvedInputs = inputs.map((name) => resolve(cacheRoot, name))
if (new Set(resolvedInputs).size !== resolvedInputs.length) throw new Error('Input report paths must be unique')
const expectedBase = 'f21964595968dde261973f7e2cb965ce0ba600b7'
const expected = JSON.parse(await readFile(new URL('./recorded-comparison.json', import.meta.url), 'utf8'))
const reports = []

for (const name of inputs) {
  const report = JSON.parse(await readFile(join(cacheRoot, name), 'utf8'))
  if (report.baseCommit !== expectedBase) throw new Error(`${name} has an unexpected base commit`)
  if (report.error && report.error !== 'Error: Input.dispatchTouchEvent timed out') {
    throw new Error(`${name} contains an unexpected measurement error: ${report.error}`)
  }
  for (const [part, sha256] of Object.entries(expected)) {
    if (report.sourceFingerprint?.[part]?.sha256 !== sha256) {
      throw new Error(`${name} does not match the recorded ${part} source/data fingerprint`)
    }
  }
  reports.push({ name, report })
}

const baseFingerprint = JSON.stringify(reports[0].report.sourceFingerprint)
for (const { name, report } of reports.slice(1)) {
  if (JSON.stringify(report.sourceFingerprint) !== baseFingerprint) throw new Error(`${name} used different source or static data`)
}

const samplesByBuild = { base: [], combined: [] }
for (const { name, report } of reports) {
  for (const sample of report.scenarios) {
    if (sample.scenario !== 'sheet-touch-drag' || sample.warmup || sample.summary) continue
    if (!sample.action?.detentChanged || sample.action.detentBefore !== 'partial' || sample.action.detentAfter !== 'full') continue
    samplesByBuild[sample.build].push({ sourceFile: name, action: sample.action, metrics: sample.metrics, frame: sample.frame, eventTiming: sample.eventTiming, longTasks: sample.longTasks, longAnimationFrames: sample.longAnimationFrames })
  }
}

function stats(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b)
  const at = (fraction) => sorted.length ? sorted[Math.ceil(sorted.length * fraction) - 1] : null
  return { n: sorted.length, median: at(.5), p95: at(.95), min: sorted[0] ?? null, max: sorted.at(-1) ?? null }
}

function summarize(samples) {
  const interactionDurations = samples.flatMap((sample) => {
    const byId = new Map()
    for (const event of sample.eventTiming ?? []) {
      if (!event.interactionId) continue
      byId.set(event.interactionId, Math.max(byId.get(event.interactionId) ?? 0, event.inputToPresentationMs ?? 0))
    }
    return [...byId.values()]
  })
  const metric = (name, scale = 1) => stats(samples.map((sample) => sample.metrics?.[name] == null ? null : sample.metrics[name] * scale))
  const longTaskDurations = samples.flatMap((sample) => (sample.longTasks ?? []).map((task) => task.durationMs))
  return {
    measuredRepeats: samples.length,
    detentChangeRepeats: samples.filter((sample) => sample.action.detentChanged).length,
    eventTimingInteractions: stats(interactionDurations),
    validPerRunFrameP95Ms: stats(samples.filter((sample) => sample.frame?.valid).map((sample) => sample.frame.p95Ms)),
    layoutCount: metric('LayoutCount'),
    layoutDurationMs: metric('LayoutDuration', 1000),
    styleRecalculationCount: metric('RecalcStyleCount'),
    scriptDurationMs: metric('ScriptDuration', 1000),
    taskDurationMs: metric('TaskDuration', 1000),
    longTaskCountPerRun: stats(samples.map((sample) => sample.longTasks?.length ?? 0)),
    longTaskDurationMs: stats(longTaskDurations),
    longAnimationFrames: samples.reduce((total, sample) => total + (sample.longAnimationFrames?.length ?? 0), 0),
  }
}

for (const [build, samples] of Object.entries(samplesByBuild)) {
  if (samples.length < 5) throw new Error(`${build} has only ${samples.length} valid detent-changing repeats`)
  samplesByBuild[build] = samples.slice(0, 5)
}

const result = {
  baseCommit: expectedBase,
  sourceFingerprint: reports[0].report.sourceFingerprint,
  environment: reports[0].report.environment,
  conditions: reports[0].report.conditions,
  inputFiles: inputs,
  excludedFailures: reports.filter(({ report }) => report.error).map(({ name, report }) => ({ sourceFile: name, error: report.error })),
  samples: samplesByBuild,
  summary: {
    base: summarize(samplesByBuild.base),
    combined: summarize(samplesByBuild.combined),
  },
}

const outputPath = join(cacheRoot, 'sheet-touch-five.json')
await writeFile(outputPath, JSON.stringify(result, null, 2) + '\n')
console.log(JSON.stringify({ outputPath, summary: result.summary, excludedFailures: result.excludedFailures }, null, 2))
