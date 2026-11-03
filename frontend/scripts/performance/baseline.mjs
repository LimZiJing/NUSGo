import { spawn, execFileSync } from 'node:child_process'
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { cpus, platform, release, totalmem } from 'node:os'
import { gzipSync, brotliCompressSync } from 'node:zlib'
import { setTimeout as delay } from 'node:timers/promises'

const url = process.env.PERF_URL ?? 'http://127.0.0.1:5173/performance.html'
const executable = process.env.PERF_BROWSER
const output = resolve(process.env.PERF_OUTPUT ?? '.cache/performance-baseline')
const assets = resolve(process.env.PERF_ASSETS ?? 'frontend/dist-local-rehearsal/assets')
const mobile = process.env.PERF_VIEWPORT === 'mobile'
const profiling = process.env.PERF_REACT_PROFILE === '1'
const reportPath = join(output, `baseline-${profiling ? 'profile-' : ''}${mobile ? 'mobile' : 'desktop'}.json`)
if (!executable) throw new Error('Set PERF_BROWSER to a Chromium/Edge executable')
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname)) throw new Error('Use a local production build')
await mkdir(output, { recursive: true })
const profile = join(output, `browser-profile-${Date.now()}`)
const browser = spawn(executable, ['--headless=new', '--disable-features=CalculateNativeWinOcclusion', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', 'about:blank'], { windowsHide: true, stdio: 'ignore' })
let launchError = null
browser.on('error', (error) => { launchError = error })
let socket
const pending = new Map()
try {
  let port
  for (let attempt = 0; attempt < 100; attempt++) {
    if (launchError) throw launchError
    try { port = Number((await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); break } catch { await delay(100) }
  }
  if (!port) throw new Error('Browser did not publish its isolated debugging port')
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
  socket = new WebSocket(targets.find(({ type }) => type === 'page').webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('CDP connection timed out')), 15_000)
    socket.addEventListener('open', () => { clearTimeout(timeout); resolve() }, { once: true })
    socket.addEventListener('error', () => { clearTimeout(timeout); reject(new Error('CDP connection failed')) }, { once: true })
  })
  let sequence = 0
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(String(data))
    const entry = pending.get(message.id)
    if (!entry) return
    clearTimeout(entry.timeout)
    pending.delete(message.id)
    if (message.error) entry.reject(new Error(JSON.stringify(message.error)))
    else entry.resolve(message.result)
  })
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence
    const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timed out`)) }, 20_000)
    pending.set(id, { resolve, reject, timeout })
    socket.send(JSON.stringify({ id, method, params }))
  })
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text)
    return result.result.value
  }
  await send('Page.enable')
  await send('Performance.enable')
  const report = {
    revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    recordedAt: new Date().toISOString(),
    environment: { platform: platform(), release: release(), cpu: cpus()[0]?.model, logicalCpus: cpus().length, memoryBytes: totalmem(), node: process.version },
    conditions: { url, headless: true, cpuThrottling: 'none', networkThrottling: 'none', build: profiling ? 'React profiling diagnostic build' : 'production local rehearsal', cache: 'fresh isolated profile; one cold-browser-cache navigation; no warm-start sample', physicalMobile: false, repetitions: 3, warmupMs: 2000, basemap: 'controlled empty background; excludes real tile/GPU load', api: 'controlled browser fixtures; one synthetic 1000-coordinate walking Path; not live-provider evidence', input: 'DOM actions for standard cases; CDP mouse/touch for drag/pan; not input latency measurements' },
    assets: [], runs: [],
  }
  for (const name of await readdir(assets)) {
    if (!/\.(js|css)$/.test(name)) continue
    const bytes = await readFile(join(assets, name))
    report.assets.push({ name, bytes: bytes.length, gzipBytes: gzipSync(bytes).length, brotliBytes: brotliCompressSync(bytes).length })
  }
  const metrics = async () => Object.fromEntries((await send('Performance.getMetrics')).metrics.map(({ name, value }) => [name, value]))
  // A fresh browser per viewport avoids carrying rendering/lifecycle state between layouts.
  for (const viewport of [mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 }]) {
    await send('Emulation.setDeviceMetricsOverride', { ...viewport, deviceScaleFactor: 1, mobile: false })
    await send('Page.navigate', { url })
    await send('Page.bringToFront')
    await send('Emulation.setFocusEmulationEnabled', { enabled: true })
    await send('Page.setWebLifecycleState', { state: 'active' })
    let ready = false
    for (let attempt = 0; attempt < 150; attempt++) {
      ready = await evaluate(`!!document.querySelector('.bus-stop-marker') && typeof runNusgoPerformance === 'function'`)
      if (ready) break
      await delay(100)
    }
    if (!ready) throw new Error('Fixture map/markers not ready within 15 seconds')
    const startup = await evaluate(`({ observedReadyMs: performance.now(), navigation: performance.getEntriesByType('navigation')[0]?.toJSON(), userAgent: navigator.userAgent, dpr: devicePixelRatio })`)
    await delay(2000)
    await evaluate(`runNusgoPerformance('setup')`)
    const run = { viewport, startup, scenarios: [] }
    for (const scenario of ['idle', 'tabs', ...(viewport.width < 769 ? ['sheet'] : []), 'search', 'zoom', 'refresh']) {
      const before = await metrics()
      const result = await evaluate(`runNusgoPerformance(${JSON.stringify(scenario)})`)
      const after = await metrics()
      result.cdpDelta = Object.fromEntries(['LayoutCount', 'RecalcStyleCount', 'LayoutDuration', 'RecalcStyleDuration', 'ScriptDuration', 'TaskDuration'].map((key) => [key, after[key] - before[key]]))
      run.scenarios.push(result)
      console.log(`${viewport.width} ${scenario}: ${result.samples.map((sample) => sample.frameIntervalP95Ms?.toFixed(2) ?? 'INVALID:no frames').join(', ')} ms p95`)
    }
    const measureAction = async (label, action) => {
      const before = await metrics()
      const samples = []
      for (let index = 0; index < 3; index++) {
        await evaluate(`nusgoPerformance.start(${JSON.stringify(label)})`)
        await action()
        samples.push(await evaluate('nusgoPerformance.stop()'))
      }
      const after = await metrics()
      run.scenarios.push({ scenario: label, samples, cdpDelta: Object.fromEntries(['LayoutCount', 'RecalcStyleCount', 'LayoutDuration', 'RecalcStyleDuration', 'ScriptDuration', 'TaskDuration'].map((key) => [key, after[key] - before[key]])) })
      console.log(`${viewport.width} ${label}: ${samples.map((sample) => sample.frameIntervalP95Ms?.toFixed(2) ?? 'INVALID:no frames').join(', ')} ms p95`)
    }
    if (process.env.PERF_CORE_ONLY !== '1') {
    await evaluate(`document.querySelector('.main-navigation button[aria-controls="explore-panel"]').click()`)
    await delay(100)
    await evaluate(`Array.from(document.querySelectorAll('button')).find((element) => element.textContent.trim() === 'Bus routes').click()`)
    await delay(100)
    await evaluate(`document.querySelector('.explore-bus-route-list button[data-route-id="D2"]').click()`)
    await delay(800)
    const selectedZoom = await evaluate(`runNusgoPerformance('zoom')`)
    selectedZoom.scenario = 'selected-route-zoom'
    run.scenarios.push(selectedZoom)
    if (mobile) await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 })
    const drag = async (start, end) => {
      if (mobile) {
        const point = ([x, y]) => [{ x, y, id: 1 }]
        await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point(start) })
        for (let index = 1; index <= 12; index++) {
          await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: point(start.map((value, axis) => value + (end[axis] - value) * index / 12)) })
          await delay(16)
        }
        await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      } else {
        await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: start[0], y: start[1], button: 'left', clickCount: 1 })
        for (let index = 1; index <= 12; index++) {
          await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: start[0] + (end[0] - start[0]) * index / 12, y: start[1] + (end[1] - start[1]) * index / 12, button: 'left', buttons: 1 })
          await delay(16)
        }
        await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: end[0], y: end[1], button: 'left', clickCount: 1 })
      }
      await delay(450)
    }
    await measureAction('selected-route-pan', () => drag([viewport.width * 0.7, 180], [viewport.width * 0.7 - 80, 230]))
    if (mobile) {
      await measureAction('sheet-touch-drag', async () => {
        const start = await evaluate(`(() => { const box = document.querySelector('.mobile-sheet-viewport[data-active="true"] .mobile-sheet-handle').getBoundingClientRect(); return [box.x + box.width / 2, box.y + box.height / 2] })()`)
        await drag(start, [start[0], Math.max(24, start[1] - 160)])
      })
      await measureAction('viewport-resize-proxy', async () => {
        for (const height of [500, 844]) { await send('Emulation.setDeviceMetricsOverride', { ...viewport, height, deviceScaleFactor: 1, mobile: false }); await delay(500) }
      })
    }
    await measureAction('repeated-navigation', async () => {
      await evaluate(`(async () => { for (let index=0;index<10;index++) { for (const view of ['stops','plan','explore']) { document.querySelector('.main-navigation button[aria-controls="'+view+'-panel"]').click(); await new Promise(resolve=>setTimeout(resolve,100)) } } })()`)
    })
    }
    report.runs.push(run)
    // Retain completed evidence if a later viewport fails.
    await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n')
  }
  console.log(`Saved ${reportPath}`)
} finally {
  for (const entry of pending.values()) clearTimeout(entry.timeout)
  socket?.close()
  browser.kill()
}
