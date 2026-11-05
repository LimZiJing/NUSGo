// Serialized into the browser by the baseline runner; keep this function self-contained.
export function installPerformanceProbe() {
  const percentile = (values, fraction) => {
    const sorted = [...values].sort((a, b) => a - b)
    return sorted.length ? sorted[Math.ceil(sorted.length * fraction) - 1] : null
  }
  let active = null
  let frame = null
  const longTasks = []
  const observer = PerformanceObserver.supportedEntryTypes.includes('longtask')
    ? new PerformanceObserver((list) => longTasks.push(...list.getEntries()))
    : null
  observer?.observe({ type: 'longtask', buffered: true })
  const sampleFrame = (timestamp) => {
    if (!active) return
    active.hidden ||= document.hidden
    if (active.lastFrame !== null) active.intervals.push(timestamp - active.lastFrame)
    active.lastFrame = timestamp
    frame = requestAnimationFrame(sampleFrame)
  }
  const resources = () => ({
    domNodes: document.getElementsByTagName('*').length,
    markers: document.querySelectorAll('.maplibregl-marker').length,
    canvases: document.querySelectorAll('canvas').length,
    heapBytes: performance.memory?.usedJSHeapSize ?? null,
  })
  const probe = {
    start(label, expectedFrameMs = 1000 / 60) {
      if (active) throw new Error('A performance sample is already running')
      if (!(expectedFrameMs > 0)) throw new Error('Expected frame interval must be positive')
      active = { label, expectedFrameMs, start: performance.now(), lastFrame: null, intervals: [], before: resources(), hidden: document.hidden, commitStart: window.__nusgoReactCommits?.length ?? null }
      frame = requestAnimationFrame(sampleFrame)
    },
    stop() {
      if (!active) throw new Error('No performance sample is running')
      cancelAnimationFrame(frame)
      longTasks.push(...(observer?.takeRecords() ?? []))
      const end = performance.now()
      const sample = active
      active = null
      const tasks = longTasks.filter((task) => task.startTime < end && task.startTime + task.duration > sample.start)
      return {
        label: sample.label,
        durationMs: end - sample.start,
        expectedFrameMs: sample.expectedFrameMs,
        frameCount: sample.intervals.length,
        validFrameSample: sample.intervals.length > 0 && !sample.hidden && !document.hidden,
        needsForegroundRerun: sample.intervals.some((interval) => interval > 500),
        frameIntervalP50Ms: percentile(sample.intervals, 0.5),
        frameIntervalP95Ms: percentile(sample.intervals, 0.95),
        frameIntervalMaxMs: sample.intervals.length ? Math.max(...sample.intervals) : null,
        // A scheduling proxy, not compositor/GPU dropped-frame telemetry.
        delayedFrameIntervals: sample.intervals.filter((ms) => ms > sample.expectedFrameMs * 1.5).length,
        longTaskCount: observer ? tasks.length : null,
        longTaskTotalMs: observer ? tasks.reduce((total, task) => total + Math.max(0, Math.min(end, task.startTime + task.duration) - Math.max(sample.start, task.startTime)), 0) : null,
        reactCommits: sample.commitStart === null ? null : window.__nusgoReactCommits.slice(sample.commitStart),
        before: sample.before,
        after: resources(),
        hiddenAtBoundary: sample.hidden || document.hidden,
      }
    },
    dispose() {
      cancelAnimationFrame(frame)
      observer?.disconnect()
      active = null
    },
  }
  window.nusgoPerformance?.dispose()
  window.nusgoPerformance = probe
}
