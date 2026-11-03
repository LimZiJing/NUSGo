import { spawn, execFileSync, spawnSync } from 'node:child_process'
import { mkdir, readFile, readdir, rm, writeFile, lstat } from 'node:fs/promises'
import { resolve, join, dirname, sep, basename } from 'node:path'
import { cpus, platform, release, totalmem } from 'node:os'
import { gzipSync, brotliCompressSync } from 'node:zlib'
import { setTimeout as delay } from 'node:timers/promises'

const repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()
const helperRoot = resolve(repoRoot, '.cache/performance-orchestration/real-performance')
const baseDist = resolve(helperRoot, 'base-dist')
const combinedDist = resolve(helperRoot, 'combined-dist')
const baseRoot = resolve(helperRoot, 'base-source')
const combinedRoot = resolve(helperRoot, 'combined-source')
const outputPath = resolve(process.env.PERF_OUTPUT ?? join(helperRoot, 'observed-comparison.json'))
const browserExecutable = process.env.PERF_BROWSER
const repetitions = process.env.PERF_SMOKE === '1' ? 1 : Number(process.env.PERF_REPETITIONS ?? 5)
const basePort = Number(process.env.PERF_BASE_PORT ?? 15177)
const combinedPort = Number(process.env.PERF_COMBINED_PORT ?? 15178)
const baseUrl = `http://127.0.0.1:${basePort}/performance.html`
const combinedUrl = `http://127.0.0.1:${combinedPort}/performance.html`
if (!browserExecutable) throw new Error('Set PERF_BROWSER to an installed Chromium or Edge executable')
if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 5) throw new Error('PERF_REPETITIONS must be an integer from 1 to 5')
for (const path of [baseDist, combinedDist]) {
  try { await readFile(join(path, 'index.html')) } catch { throw new Error(`Missing built snapshot: ${path}`) }
}
for (const path of [baseRoot, combinedRoot]) {
  try { await readFile(join(path, 'frontend/src/app/app.tsx')) } catch { throw new Error(`Missing source snapshot: ${path}`) }
}

const sleep = (ms) => delay(ms)
const versionInfo = [
  { name: 'base', root: baseRoot, dist: baseDist, url: baseUrl, port: basePort },
  { name: 'combined', root: combinedRoot, dist: combinedDist, url: combinedUrl, port: combinedPort },
]
const serverLogs = new Map()
const servers = []
let browser = null
let browserProfile = null
let socket = null
let activeControl = null
const pending = new Map()
const browserDiagnostics = []
let output = {
  recordedAt: new Date().toISOString(),
  baseCommit: 'f21964595968dde261973f7e2cb965ce0ba600b7',
  sourceFingerprint: {},
  environment: {
    os: `${platform()} ${release()}`,
    cpu: cpus()[0]?.model ?? null,
    logicalCpus: cpus().length,
    memoryBytes: totalmem(),
    node: process.version,
    browser: null,
  },
  conditions: {
    build: 'Vite local-rehearsal production build; local API origin; production module graph and minification',
    api: 'controlled browser fixtures on both builds; one canonical synthetic 1000-coordinate walking Path; no live provider calls',
    mapStyle: 'controlled empty basemap fixture; real map overlays; excludes live vector tiles and physical GPU attribution',
    cache: 'one isolated browser profile; warmed scenario run per build; five interleaved measured repetitions per build and scenario',
    throttling: 'no CPU or network throttling; 1440x900 and 390x844 CSS viewports at DPR 1; mobile width is not mobile hardware emulation',
    input: 'CDP mouse/touch/key input; Event Timing collected only when Chromium emits supported entries; no INP claim',
  },
  assets: {},
  startup: [],
  coldStarts: [],
  coldStartSummary: {},
  scenarios: [],
  diagnostics: browserDiagnostics,
}

async function fingerprintTree(root, include) {
  const files = []
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) await visit(path)
      else if (entry.isFile() && include(path)) files.push(path)
    }
  }
  await visit(root)
  files.sort((a, b) => a.localeCompare(b))
  const hash = await import('node:crypto').then(({ createHash }) => createHash('sha256'))
  for (const file of files) {
    const relativePath = file.slice(root.length + 1).replaceAll('\\', '/')
    hash.update(relativePath).update('\0').update(await readFile(file)).update('\0')
  }
  return { sha256: hash.digest('hex'), fileCount: files.length }
}

async function assetSizes(directory) {
  const assetsPath = join(directory, 'assets')
  const result = []
  for (const name of (await readdir(assetsPath)).filter((value) => /\.(js|css)$/.test(value)).sort()) {
    const bytes = await readFile(join(assetsPath, name))
    result.push({ name, rawBytes: bytes.length, gzipBytes: gzipSync(bytes).length, brotliBytes: brotliCompressSync(bytes).length })
  }
  return {
    files: result,
    totalRawBytes: result.reduce((sum, item) => sum + item.rawBytes, 0),
    totalGzipBytes: result.reduce((sum, item) => sum + item.gzipBytes, 0),
    totalBrotliBytes: result.reduce((sum, item) => sum + item.brotliBytes, 0),
  }
}

function rememberServer(server, name) {
  const lines = []
  server.stdout?.on('data', (chunk) => lines.push(String(chunk).trim()))
  server.stderr?.on('data', (chunk) => lines.push(String(chunk).trim()))
  serverLogs.set(name, lines)
  servers.push(server)
}

async function preparePage(build) {
  const result = spawnSyncNode('frontend/scripts/performance/prepare-page.mjs', {
    PERF_DIST: build.dist,
  })
  if (result !== 0) throw new Error(`Could not prepare controlled fixture page for ${build.name}`)
}

function spawnSyncNode(scriptPath, variables) {
  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: repoRoot,
    env: { ...process.env, ...variables },
    stdio: 'inherit',
  })
  if (result.error) throw result.error
  return result.status
}

async function startPreview(build) {
  const vite = join(repoRoot, 'node_modules/vite/bin/vite.js')
  const server = spawn(process.execPath, [
    vite, 'preview', '--mode', 'local-rehearsal', '--outDir', build.dist,
    '--host', '127.0.0.1', '--port', String(build.port), '--strictPort',
  ], {
    cwd: join(build.root, 'frontend'),
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, VITE_API_ORIGIN: 'http://127.0.0.1:3001', VITE_DATA_VERSION: 'development' },
  })
  rememberServer(server, build.name)
  const began = Date.now()
  while (Date.now() - began < 20_000) {
    if (server.exitCode !== null) throw new Error(`${build.name} preview exited: ${(serverLogs.get(build.name) ?? []).join('\n')}`)
    try {
      const response = await fetch(build.url)
      if (response.ok) return
    } catch { /* Wait for Vite preview to bind its isolated port. */ }
    await sleep(100)
  }
  throw new Error(`${build.name} preview did not become ready: ${(serverLogs.get(build.name) ?? []).join('\n')}`)
}

async function launchBrowser() {
  browserProfile = join(helperRoot, `browser-profile-${Date.now()}`)
  browser = spawn(browserExecutable, [
    '--headless=new',
    '--disable-features=CalculateNativeWinOcclusion',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
    '--remote-debugging-port=0',
    `--user-data-dir=${browserProfile}`,
    '--no-first-run',
    '--no-default-browser-check',
    'about:blank',
  ], { windowsHide: true, stdio: 'ignore' })
  let launchError = null
  browser.on('error', (error) => { launchError = error })
  let port
  for (let attempt = 0; attempt < 150; attempt++) {
    if (launchError) throw launchError
    try { port = Number((await readFile(join(browserProfile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); break } catch { await sleep(100) }
  }
  if (!port) throw new Error('Headless browser did not publish its isolated debugging port')
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
  const target = targets.find(({ type }) => type === 'page')
  if (!target) throw new Error('Headless browser has no page target')
  socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolvePromise, reject) => {
    const timeout = setTimeout(() => reject(new Error('CDP connection timed out')), 15_000)
    socket.addEventListener('open', () => { clearTimeout(timeout); resolvePromise() }, { once: true })
    socket.addEventListener('error', () => { clearTimeout(timeout); reject(new Error('CDP connection failed')) }, { once: true })
  })
  let sequence = 0
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(String(data))
    if (message.method === 'Runtime.exceptionThrown') browserDiagnostics.push({ type: 'page-exception', text: message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text })
    if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') browserDiagnostics.push({ type: 'console-error', text: message.params.entry.text })
    if (message.method === 'Network.responseReceived') {
      const url = new URL(message.params.response.url)
      if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/data/')) browserDiagnostics.push({ type: 'response', path: url.pathname, status: message.params.response.status })
    }
    if (message.method === 'Network.loadingFailed') browserDiagnostics.push({ type: 'request-failed', error: message.params.errorText })
    const entry = pending.get(message.id)
    if (!entry) return
    clearTimeout(entry.timeout)
    pending.delete(message.id)
    if (message.error) entry.reject(new Error(JSON.stringify(message.error)))
    else entry.resolve(message.result)
  })
  const send = (method, params = {}) => new Promise((resolvePromise, reject) => {
    const id = ++sequence
    const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timed out`)) }, 20_000)
    pending.set(id, { resolve: resolvePromise, reject, timeout })
    socket.send(JSON.stringify({ id, method, params }))
  })
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text)
    return result.result.value
  }
  await Promise.all([send('Page.enable'), send('Runtime.enable'), send('Log.enable'), send('Network.enable'), send('Performance.enable')])
  await send('Network.setBypassServiceWorker', { bypass: true })
  await send('Page.setWebLifecycleState', { state: 'active' })
  const browserVersion = await send('Browser.getVersion')
  output.environment.browser = { product: browserVersion.product, userAgent: browserVersion.userAgent, protocolVersion: browserVersion.protocolVersion }
  return { send, evaluate }
}

async function removeIsolatedBrowserProfile() {
  if (!browserProfile) return
  const resolvedHelper = resolve(helperRoot)
  const resolvedProfile = resolve(browserProfile)
  if (!resolvedProfile.startsWith(`${resolvedHelper}${sep}`) || !basename(resolvedProfile).startsWith('browser-profile-')) {
    throw new Error(`Refusing to remove browser profile outside the measurement directory: ${resolvedProfile}`)
  }
  try {
    if (!(await lstat(resolvedProfile)).isSymbolicLink()) await rm(resolvedProfile, { recursive: true })
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  browserProfile = null
}

async function stopBrowserOnly() {
  socket?.close()
  socket = null
  if (browser) {
    const current = browser
    if (current.exitCode === null) current.kill()
    await new Promise((resolvePromise) => {
      if (current.exitCode !== null) return resolvePromise()
      current.once('close', resolvePromise)
      setTimeout(resolvePromise, 3_000).unref()
    })
    browser = null
  }
  activeControl = null
  await removeIsolatedBrowserProfile()
}

const observedProbe = `(() => {
  if (window.__realPerformanceObserver) return
  const supported = PerformanceObserver.supportedEntryTypes ?? []
  const entries = { event: [], longtask: [], loaf: [] }
  const observers = []
  const observe = (type, bucket, options = { type, buffered: true }) => {
    if (!supported.includes(type)) return
    try {
      const observer = new PerformanceObserver((list) => entries[bucket].push(...list.getEntries()))
      observer.observe(options)
      observers.push({ observer, bucket })
    } catch { /* Keep unsupported/invalid observer types explicit in the report. */ }
  }
  observe('event', 'event', { type: 'event', buffered: true, durationThreshold: 16 })
  observe('longtask', 'longtask')
  observe('long-animation-frame', 'loaf')
  let active = null
  let frameId = null
  const frame = (timestamp) => {
    if (!active) return
    if (active.previous !== null) active.frames.push(timestamp - active.previous)
    active.previous = timestamp
    frameId = requestAnimationFrame(frame)
  }
  const safeTarget = (target) => {
    if (!(target instanceof Element)) return null
    let label = target.tagName.toLowerCase()
    if (target.id) label += '#' + target.id
    if (typeof target.className === 'string' && target.className) label += '.' + target.className.trim().replace(/\\s+/g, '.')
    return label.slice(0, 160)
  }
  const observer = {
    supported: [...supported],
    start() {
      if (active) throw new Error('Observed sample already active')
      active = { start: performance.now(), previous: null, frames: [], hidden: document.hidden }
      frameId = requestAnimationFrame(frame)
    },
    stop() {
      if (!active) throw new Error('Observed sample missing')
      for (const item of observers) entries[item.bucket].push(...item.observer.takeRecords())
      const end = performance.now()
      const sample = active
      active = null
      cancelAnimationFrame(frameId)
      const inWindow = (entry) => entry.startTime >= sample.start && entry.startTime <= end
      const events = entries.event.filter(inWindow).map((entry) => ({
        name: entry.name,
        startTimeMs: entry.startTime,
        durationMs: entry.duration,
        processingStartMs: Number.isFinite(entry.processingStart) ? entry.processingStart : null,
        processingEndMs: Number.isFinite(entry.processingEnd) ? entry.processingEnd : null,
        presentationTimeMs: Number.isFinite(entry.presentationTime) ? entry.presentationTime : null,
        inputToPresentationMs: Number.isFinite(entry.presentationTime) ? entry.presentationTime - entry.startTime : entry.duration,
        inputToPresentationSource: Number.isFinite(entry.presentationTime) ? 'presentationTime-startTime' : 'EventTiming.duration (rounded by Chromium)',
        interactionId: entry.interactionId || 0,
        target: safeTarget(entry.target),
        cancelable: entry.cancelable,
      }))
      const tasks = entries.longtask.filter(inWindow).map((entry) => ({ startTimeMs: entry.startTime, durationMs: entry.duration }))
      const loafs = entries.loaf.filter(inWindow).map((entry) => ({
        startTimeMs: entry.startTime,
        durationMs: entry.duration,
        blockingDurationMs: entry.blockingDuration,
        renderStartMs: Number.isFinite(entry.renderStart) ? entry.renderStart : null,
        styleAndLayoutStartMs: Number.isFinite(entry.styleAndLayoutStart) ? entry.styleAndLayoutStart : null,
        scripts: Array.isArray(entry.scripts) ? entry.scripts.map((script) => ({
          invokerType: script.invokerType,
          invoker: script.invoker,
          durationMs: script.duration,
          forcedStyleAndLayoutDurationMs: script.forcedStyleAndLayoutDuration,
        })) : [],
      }))
      return {
        supportedEntryTypes: [...supported],
        durationMs: end - sample.start,
        frameIntervalsMs: sample.frames,
        frameP50Ms: sample.frames.length ? [...sample.frames].sort((a, b) => a - b)[Math.ceil(sample.frames.length * .5) - 1] : null,
        frameP95Ms: sample.frames.length ? [...sample.frames].sort((a, b) => a - b)[Math.ceil(sample.frames.length * .95) - 1] : null,
        frameMaxMs: sample.frames.length ? Math.max(...sample.frames) : null,
        hidden: sample.hidden || document.hidden,
        events,
        longTasks: tasks,
        longAnimationFrames: loafs,
      }
    },
  }
  window.__realPerformanceObserver = observer
})()`

async function pageMetrics(send) {
  const values = Object.fromEntries((await send('Performance.getMetrics')).metrics.map(({ name, value }) => [name, value]))
  return Object.fromEntries(['LayoutCount', 'RecalcStyleCount', 'LayoutDuration', 'RecalcStyleDuration', 'ScriptDuration', 'TaskDuration'].map((name) => [name, values[name] ?? null]))
}

function metricDelta(before, after) {
  return Object.fromEntries(Object.keys(before).map((name) => [name, before[name] === null || after[name] === null ? null : after[name] - before[name]]))
}

async function waitFor(evaluate, expression, timeoutMs = 15_000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    if (await evaluate(expression)) return
    await sleep(75)
  }
  throw new Error(`Timed out waiting for browser condition: ${expression}`)
}

async function loadApp(control, build, viewport, needPath = true) {
  await control.send('Emulation.setDeviceMetricsOverride', { ...viewport, deviceScaleFactor: 1, mobile: false })
  await control.send('Page.navigate', { url: build.url })
  await control.send('Page.bringToFront')
  await waitFor(control.evaluate, `!!document.querySelector('.bus-stop-marker') && typeof runNusgoPerformance === 'function'`)
  await sleep(350)
  const startup = await control.evaluate(`({ observedReadyMs: performance.now(), navigation: performance.getEntriesByType('navigation')[0]?.toJSON(), dpr: devicePixelRatio, viewport: { width: innerWidth, height: innerHeight } })`)
  await control.evaluate(observedProbe)
  await sleep(1_000)
  if (needPath) {
    const setup = await control.evaluate(`runNusgoPerformance('setup')`)
    if (!setup?.pathLoaded) throw new Error(`Path fixture setup failed on ${build.name}`)
  }
  return startup
}

async function pointFor(control, selector) {
  const point = await control.evaluate(`(() => { const node = document.querySelector(${JSON.stringify(selector)}); if (!node) throw new Error('Missing input target: ' + ${JSON.stringify(selector)}); const rect=node.getBoundingClientRect(); return {x:rect.left+rect.width/2,y:rect.top+rect.height/2,width:rect.width,height:rect.height,visible:rect.width>0&&rect.height>0} })()`)
  if (!point?.visible) throw new Error(`Target is not visible: ${selector}`)
  return point
}

async function clickSelector(control, selector) {
  const point = await pointFor(control, selector)
  await clickAt(control, point)
}

async function clickMatchingText(control, selector, text) {
  const point = await control.evaluate(`(() => { const node=Array.from(document.querySelectorAll(${JSON.stringify(selector)})).find((element)=>element.textContent.trim()===${JSON.stringify(text)}); if(!node) throw new Error('Missing text target: '+${JSON.stringify(text)}); const rect=node.getBoundingClientRect(); return {x:rect.left+rect.width/2,y:rect.top+rect.height/2,width:rect.width,height:rect.height,visible:rect.width>0&&rect.height>0} })()`)
  if (!point?.visible) throw new Error(`Text target is not visible: ${text}`)
  await clickAt(control, point)
}

async function clickAt(control, point) {
  await control.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x, y: point.y })
  await control.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 })
  await control.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1 })
}

async function wheel(control, deltaY, point) {
  await control.send('Input.dispatchMouseEvent', {
    type: 'mouseWheel', x: point.x, y: point.y, deltaX: 0, deltaY, pointerType: 'mouse',
  })
}

async function performScenario(control, name, warmup = false) {
  const evaluate = control.evaluate
  if (name === 'tabs-arrivals-plan-return') {
    const requestsAtPlanSetup = await evaluate('window.nusgoFixtureStats.arrivalRequests')
    await clickSelector(control, '.main-navigation button[aria-controls="stops-panel"]')
    await sleep(125)
    const arrivalsRendered = await evaluate("document.querySelector('#stops-panel')?.innerText.includes('Arrives in') ?? false")
    const requestsWhenStopsVisible = await evaluate('window.nusgoFixtureStats.arrivalRequests')
    await sleep(125)
    await clickSelector(control, '.main-navigation button[aria-controls="explore-panel"]')
    await sleep(125)
    await clickSelector(control, '.main-navigation button[aria-controls="plan-panel"]')
    await sleep(200)
    return { requestsAtPlanSetup, requestsWhenStopsVisible, arrivalsRendered, additionalArrivalGenerationObserved: requestsWhenStopsVisible > requestsAtPlanSetup, planResultsRetained: await evaluate("!!document.querySelector('.journey-results-item')"), arrivalRefreshLimit: 'the loaded stop set remained unchanged; no second snapshot request was observed during this tab-return sequence' }
  }
  if (name === 'sheet-touch-drag') {
    await control.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 })
    try {
    const handle = await pointFor(control, '.mobile-sheet-viewport[data-active="true"] .mobile-sheet-handle')
    const detentBefore = await evaluate("document.querySelector('.mobile-sheet-viewport[data-active=\"true\"]')?.getAttribute('data-detent') ?? null")
    const direction = -1
    const amount = direction < 0 ? -300 : 300
    const id = 1
    await control.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: handle.x, y: handle.y, id }] })
    for (let index = 1; index <= 8; index++) {
      await control.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: handle.x, y: handle.y + amount * index / 8, id }] })
      await sleep(20)
    }
    await control.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await sleep(500)
    const detentAfter = await evaluate("document.querySelector('.mobile-sheet-viewport[data-active=\"true\"]')?.getAttribute('data-detent') ?? null")
    return { dragDirection: direction < 0 ? 'up' : 'down', dragDistancePx: Math.abs(amount), inputMethod: 'trusted CDP touch input at a 390 CSS px viewport; no physical-device emulation', handleVisibleAtStart: handle.visible, detentBefore, detentAfter, detentChanged: detentBefore !== detentAfter }
    } finally {
      await control.send('Emulation.setTouchEmulationEnabled', { enabled: false, maxTouchPoints: 1 })
    }
  }
  if (name === 'stop-zoom-threshold-proxy') {
    const canvas = await pointFor(control, '.maplibregl-canvas')
    await wheel(control, 45, canvas)
    await sleep(250)
    await wheel(control, -90, canvas)
    await sleep(250)
    await wheel(control, 45, canvas)
    await sleep(250)
    return { nominalZoomSequence: '14.0 -> 13.9 -> 14.1 -> 14.0 from initial map zoom 15 and wheel deltas 45/-90/45', zoomValueReadFromMap: false }
  }
  if (name === 'plan-query-candidate-location') {
    const before = await evaluate('({...window.nusgoFixtureStats})')
    await clickSelector(control, '.plan-trip-line-origin .plan-trip-line-main')
    await sleep(100)
    await clickSelector(control, '.plan-search-input')
    await control.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Control', code: 'ControlLeft', modifiers: 2 })
    await control.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', code: 'KeyA', modifiers: 2 })
    await control.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', modifiers: 2 })
    await control.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Control', code: 'ControlLeft', modifiers: 0 })
    await control.send('Input.insertText', { text: 'Kent Ridge MRT' })
    await sleep(120)
    const busStops = await evaluate("Array.from(document.querySelectorAll('.plan-search-chip')).some((element) => element.textContent.trim() === 'Bus stops')")
    if (!busStops) throw new Error('Plan Bus stops filter was not available')
    await clickMatchingText(control, '.plan-search-chip', 'Bus stops')
    await sleep(120)
    await waitFor(evaluate, "!!document.querySelector('.plan-search-result')", 5_000)
    await clickSelector(control, '.plan-search-result')
    await sleep(100)
    await clickSelector(control, 'button[aria-label="Get route"]')
    await waitFor(evaluate, `window.nusgoFixtureStats.journeyRequests > ${before.journeyRequests} && !!document.querySelector('.journey-results-item')`, 5_000)
    await evaluate('window.nusgoFixtureLocation()')
    await sleep(150)
    return { journeyRequestsBefore: before.journeyRequests, journeyRequestsAfter: await evaluate('window.nusgoFixtureStats.journeyRequests'), locationFixesBefore: before.locationFixes, locationFixesAfter: await evaluate('window.nusgoFixtureStats.locationFixes'), pathResultPresent: true }
  }
  throw new Error(`Unknown observed scenario: ${name}`)
}

async function measureOne(control, build, scenario, viewport, warmup = false) {
  const startup = await loadApp(control, build, viewport, scenario !== 'stop-zoom-threshold-proxy')
  if (scenario === 'stop-zoom-threshold-proxy') {
    // Map lifecycle starts at zoom 15. A real zoom-control click establishes zoom 14
    // before the measured trackpad-wheel boundary sequence.
    await clickSelector(control, 'button.maplibregl-ctrl-zoom-out')
    await sleep(350)
  }
  const before = await pageMetrics(control.send)
  await control.evaluate(`window.nusgoPerformance.start(${JSON.stringify(scenario)})`)
  await control.evaluate('window.__realPerformanceObserver.start()')
  const action = await performScenario(control, scenario, warmup)
  await sleep(100)
  const browserSample = await control.evaluate(`({ baseline: window.nusgoPerformance.stop(), observed: window.__realPerformanceObserver.stop(), fixtureStats: { ...window.nusgoFixtureStats } })`)
  const after = await pageMetrics(control.send)
  return {
    build: build.name,
    scenario,
    viewport,
    startup,
    action,
    metrics: metricDelta(before, after),
    frame: {
      count: browserSample.baseline.frameCount,
      valid: browserSample.baseline.validFrameSample,
      p50Ms: browserSample.baseline.frameIntervalP50Ms,
      p95Ms: browserSample.baseline.frameIntervalP95Ms,
      maxMs: browserSample.baseline.frameIntervalMaxMs,
      delayedIntervalsOver25Ms: browserSample.baseline.delayedFrameIntervals,
      hidden: browserSample.baseline.hiddenAtBoundary,
    },
    eventTiming: browserSample.observed.events,
    supportedPerformanceEntryTypes: browserSample.observed.supportedEntryTypes,
    longTasks: browserSample.observed.longTasks,
    longAnimationFrames: browserSample.observed.longAnimationFrames,
    fixtureStats: browserSample.fixtureStats,
    automationDurationMs: browserSample.observed.durationMs,
    warmup,
  }
}

function percentile(values, fraction) {
  const sorted = [...values].filter(Number.isFinite).sort((a, b) => a - b)
  return sorted.length ? sorted[Math.ceil(sorted.length * fraction) - 1] : null
}

function summarizeScenario(samples) {
  const numbers = (select) => samples.map(select).filter(Number.isFinite)
  const summarize = (values) => ({ n: values.length, median: percentile(values, .5), p95: percentile(values, .95), min: values.length ? Math.min(...values) : null, max: values.length ? Math.max(...values) : null })
  const interactionDurations = samples.flatMap((sample) => {
    const grouped = new Map()
    for (const event of sample.eventTiming) {
      if (!event.interactionId) continue
      grouped.set(event.interactionId, Math.max(grouped.get(event.interactionId) ?? 0, event.inputToPresentationMs ?? 0))
    }
    return [...grouped.values()]
  }).filter(Number.isFinite)
  const frame95 = numbers((sample) => sample.frame.p95Ms)
  const taskDurations = samples.flatMap((sample) => sample.longTasks.map((task) => task.durationMs))
  const layoutDuration = numbers((sample) => sample.metrics.LayoutDuration === null ? null : sample.metrics.LayoutDuration * 1000)
  const scriptDuration = numbers((sample) => sample.metrics.ScriptDuration === null ? null : sample.metrics.ScriptDuration * 1000)
  const taskDuration = numbers((sample) => sample.metrics.TaskDuration === null ? null : sample.metrics.TaskDuration * 1000)
  const layoutCount = numbers((sample) => sample.metrics.LayoutCount)
  const styleCount = numbers((sample) => sample.metrics.RecalcStyleCount)
  return {
    repetitions: samples.filter((sample) => !sample.warmup).length,
    eventTimingEntries: samples.reduce((sum, sample) => sum + sample.eventTiming.length, 0),
    eventTimingInteractions: interactionDurations.length,
    inputToPresentationMs: summarize(interactionDurations),
    perRunFrameP95Ms: summarize(frame95),
    layoutCount: summarize(layoutCount),
    layoutDurationMs: summarize(layoutDuration),
    styleRecalculationCount: summarize(styleCount),
    scriptDurationMs: summarize(scriptDuration),
    taskDurationMs: summarize(taskDuration),
    longTaskCountPerRun: summarize(numbers((sample) => sample.longTasks.length)),
    longTaskMaxMs: summarize(taskDurations),
    longAnimationFrames: samples.reduce((sum, sample) => sum + sample.longAnimationFrames.length, 0),
  }
}

async function writeOutput() {
  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, JSON.stringify(output, null, 2) + '\n')
}

async function stopChildren() {
  await stopBrowserOnly()
  for (const child of servers) {
    if (child.exitCode === null) child.kill()
  }
  await Promise.all(servers.map((child) => new Promise((resolvePromise) => {
    if (child.exitCode !== null) return resolvePromise()
    child.once('close', resolvePromise)
    setTimeout(resolvePromise, 3_000).unref()
  })))
}

async function measureColdStart(build) {
  const control = await launchBrowser()
  activeControl = control
  await control.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
  await control.send('Page.navigate', { url: build.url })
  await control.send('Page.bringToFront')
  await waitFor(control.evaluate, `!!document.querySelector('.bus-stop-marker') && typeof runNusgoPerformance === 'function'`)
  const startup = await control.evaluate(`({
    markerReadyMs: performance.now(),
    firstPaintMs: performance.getEntriesByName('first-paint')[0]?.startTime ?? null,
    firstContentfulPaintMs: performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null,
    navigation: performance.getEntriesByType('navigation')[0]?.toJSON() ?? null,
    arrivalRequests: window.nusgoFixtureStats?.arrivalRequests ?? null,
    staticResources: performance.getEntriesByType('resource').filter((entry) => new URL(entry.name).pathname.startsWith('/data/')).length,
  })`)
  const sample = { build: build.name, firstNavigationInFreshBrowserProfile: true, ...startup }
  await stopBrowserOnly()
  return sample
}

function summarizeColdStarts(samples) {
  const summarize = (values) => {
    const sorted = values.filter(Number.isFinite).sort((a, b) => a - b)
    return { n: sorted.length, median: percentile(sorted, .5), p95: percentile(sorted, .95), min: sorted[0] ?? null, max: sorted.at(-1) ?? null }
  }
  return {
    markerReadyMs: summarize(samples.map((sample) => sample.markerReadyMs)),
    firstContentfulPaintMs: summarize(samples.map((sample) => sample.firstContentfulPaintMs)),
    domContentLoadedMs: summarize(samples.map((sample) => sample.navigation?.domContentLoadedEventEnd)),
    loadEventMs: summarize(samples.map((sample) => sample.navigation?.loadEventEnd)),
  }
}

async function main() {
  output.sourceFingerprint = {
    baseFrontend: await fingerprintTree(join(baseRoot, 'frontend/src'), (path) => /\.(ts|tsx|css|js)$/.test(path)),
    combinedFrontend: await fingerprintTree(join(combinedRoot, 'frontend/src'), (path) => /\.(ts|tsx|css|js)$/.test(path)),
    staticData: await fingerprintTree(join(baseRoot, 'frontend/public'), (path) => /\.(json|geojson|svg|webmanifest)$/.test(path)),
  }
  const expected = JSON.parse(await readFile(new URL('./recorded-comparison.json', import.meta.url), 'utf8'))
  for (const [name, sha256] of Object.entries(expected)) {
    if (output.sourceFingerprint[name]?.sha256 !== sha256) {
      throw new Error(`Recorded comparison ${name} fingerprint mismatch; recreate the measured source/data snapshots before collecting historical evidence`)
    }
  }
  const combinedData = await fingerprintTree(join(combinedRoot, 'frontend/public'), (path) => /\.(json|geojson|svg|webmanifest)$/.test(path))
  if (combinedData.sha256 !== expected.staticData) throw new Error('Combined static data differs from the recorded comparison')
  output.assets = { base: await assetSizes(baseDist), combined: await assetSizes(combinedDist) }
  await Promise.all(versionInfo.map(preparePage))
  await Promise.all(versionInfo.map(startPreview))
  const control = await launchBrowser()
  activeControl = control
  const startupSeen = new Set()
  const allScenarios = [
    { name: 'tabs-arrivals-plan-return', viewport: { width: 1440, height: 900 } },
    { name: 'plan-query-candidate-location', viewport: { width: 1440, height: 900 } },
    { name: 'stop-zoom-threshold-proxy', viewport: { width: 1440, height: 900 } },
    { name: 'sheet-touch-drag', viewport: { width: 390, height: 844 } },
  ]
  const requestedScenarios = process.env.PERF_SCENARIOS?.split(',').map((value) => value.trim()).filter(Boolean)
  const scenarios = requestedScenarios
    ? allScenarios.filter(({ name }) => requestedScenarios.includes(name))
    : allScenarios
  if (!scenarios.length) throw new Error(`No matching PERF_SCENARIOS: ${process.env.PERF_SCENARIOS}`)
  for (const scenario of scenarios) {
    for (const build of versionInfo) {
      const warmup = await measureOne(control, build, scenario.name, scenario.viewport, true)
      if (!startupSeen.has(build.name)) {
        startupSeen.add(build.name)
        output.startup.push({ build: build.name, viewport: scenario.viewport, observedMarkerReadyMs: warmup.startup.observedReadyMs, navigation: warmup.startup.navigation, firstNavigationInSharedProfile: true })
      }
      output.scenarios.push(warmup)
      await writeOutput()
    }
    for (let index = 0; index < repetitions; index++) {
      const order = index % 2 === 0 ? versionInfo : [...versionInfo].reverse()
      for (const build of order) {
        const sample = await measureOne(control, build, scenario.name, scenario.viewport)
        output.scenarios.push(sample)
        await writeOutput()
        const observedCount = sample.eventTiming.length
        console.log(`${scenario.name} ${build.name} ${index + 1}/${repetitions}: frames p95=${sample.frame.p95Ms?.toFixed(2) ?? 'n/a'}ms; layout=${sample.metrics.LayoutCount}; EventTiming=${observedCount}; longtasks=${sample.longTasks.length}`)
      }
    }
    for (const build of versionInfo) {
      const samples = output.scenarios.filter((sample) => sample.scenario === scenario.name && sample.build === build.name && !sample.warmup)
      output.scenarios.push({ build: build.name, scenario: scenario.name, summary: summarizeScenario(samples) })
    }
    await writeOutput()
  }
  await stopBrowserOnly()
  for (let index = 0; index < repetitions; index++) {
    const order = index % 2 === 0 ? versionInfo : [...versionInfo].reverse()
    for (const build of order) {
      const sample = await measureColdStart(build)
      output.coldStarts.push(sample)
      await writeOutput()
      console.log(`cold-start ${build.name} ${index + 1}/${repetitions}: marker-ready=${sample.markerReadyMs.toFixed(1)}ms; FCP=${sample.firstContentfulPaintMs?.toFixed(1) ?? 'n/a'}ms`)
    }
  }
  for (const build of versionInfo) {
    output.coldStartSummary[build.name] = summarizeColdStarts(output.coldStarts.filter((sample) => sample.build === build.name))
  }
  output.diagnostics = [...browserDiagnostics]
  await writeOutput()
  console.log(`Saved production comparison evidence to ${outputPath}`)
  console.log(`Base assets: ${JSON.stringify(output.assets.base)}`)
  console.log(`Combined assets: ${JSON.stringify(output.assets.combined)}`)
}

try {
  await main()
} catch (error) {
  output.error = String(error)
  if (activeControl) {
    try {
      output.failureState = await activeControl.evaluate(`({ url: location.href, readyState: document.readyState, activeTabs: Array.from(document.querySelectorAll('.main-navigation button')).map((node)=>({label:node.textContent.trim(),active:node.getAttribute('aria-current'),selected:node.getAttribute('aria-selected')})), fixtureStats: window.nusgoFixtureStats, stopsText: document.querySelector('#stops-panel')?.innerText?.slice(0,1800) ?? null, bodyText: document.body.innerText.slice(0,2500), stopMarkers: document.querySelectorAll('.bus-stop-marker').length, network: performance.getEntriesByType('resource').filter((item)=>new URL(item.name).pathname.startsWith('/api/')||new URL(item.name).pathname.startsWith('/data/')).map((item)=>new URL(item.name).pathname) })`)
    } catch (captureError) {
      output.failureStateError = String(captureError)
    }
  }
  output.diagnostics = [...browserDiagnostics]
  await writeOutput()
  throw error
} finally {
  await stopChildren()
}
