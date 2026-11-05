import { afterEach, expect, it, vi } from 'vitest'
import { installPerformanceProbe } from './browser-metrics.mjs'

afterEach(() => vi.unstubAllGlobals())

it('rejects zero-frame evidence and reports measured intervals without inventing FPS', () => {
  let callback
  let now = 0
  const window = {}
  vi.stubGlobal('window', window)
  vi.stubGlobal('document', { hidden: false, getElementsByTagName: () => [], querySelectorAll: () => [] })
  vi.stubGlobal('performance', { now: () => now })
  vi.stubGlobal('PerformanceObserver', { supportedEntryTypes: [] })
  vi.stubGlobal('requestAnimationFrame', (next) => { callback = next; return 1 })
  vi.stubGlobal('cancelAnimationFrame', () => {})
  installPerformanceProbe()
  window.nusgoPerformance.start('no frames')
  now = 100
  expect(window.nusgoPerformance.stop()).toMatchObject({ validFrameSample: false, frameIntervalP95Ms: null, longTaskCount: null })
  window.nusgoPerformance.start('measured')
  for (const timestamp of [100, 116, 132, 182]) callback(timestamp)
  now = 200
  expect(window.nusgoPerformance.stop()).toMatchObject({ validFrameSample: true, frameCount: 3, frameIntervalP50Ms: 16, frameIntervalP95Ms: 50, delayedFrameIntervals: 1 })
  window.nusgoPerformance.dispose()
})
