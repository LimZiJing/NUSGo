// Repeatable application work; DOM actions are synthetic and do not measure input latency.
export async function runPerformanceScenarios(scenario, repetitions = 3) {
  const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  const waitFor = async (predicate, label, timeoutMs = 5000) => {
    const deadline = performance.now() + timeoutMs
    while (performance.now() < deadline) {
      const value = predicate()
      if (value) return value
      await pause(25)
    }
    throw new Error(`Timed out waiting for ${label}`)
  }
  const click = (selector) => {
    const element = document.querySelector(selector)
    if (!element) throw new Error(`Missing action target: ${selector}`)
    element.click()
  }
  const type = (selector, value) => {
    const input = document.querySelector(selector)
    if (!input) throw new Error(`Missing input: ${selector}`)
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  }
  if (!document.querySelector('.bus-stop-marker')) throw new Error('Wait for map and stop markers before sampling')
  const actions = {
    async setup() {
      await waitFor(() => document.querySelector('.main-navigation button[aria-controls="plan-panel"]'), 'Plan tab')
      click('.main-navigation button[aria-controls="plan-panel"]')
      for (const [role, query] of [['origin', 'COM 3'], ['destination', 'University Town']]) {
        await waitFor(() => document.querySelector(`.plan-trip-line-${role} .plan-trip-line-main`), `${role} endpoint control`)
        click(`.plan-trip-line-${role} .plan-trip-line-main`)
        await waitFor(() => document.querySelector('.plan-search-input'), 'plan search input')
        type('.plan-search-input', query)
        const busStops = await waitFor(() => Array.from(document.querySelectorAll('.plan-search-chip')).find((element) => element.textContent === 'Bus stops'), 'Bus stops chip')
        busStops.click()
        const result = await waitFor(() => busStops.getAttribute('aria-pressed') === 'true' &&
          Array.from(document.querySelectorAll('.plan-search-result')).find((element) => element.textContent.includes(query)), `${query} bus stop result`)
        result.click()
        await waitFor(() => !document.querySelector('.plan-search-input'), `${role} selection to close search`)
      }
      await waitFor(() => document.querySelector('button[aria-label="Get route"]:not(:disabled)'), 'Get route button')
      click('button[aria-label="Get route"]')
      await waitFor(() => document.querySelector('.journey-results-item'), 'validated fixture Path')
      document.querySelector('.location-control-chip')?.click()
      await pause(600)
    },
    idle: () => pause(1200),
    async tabs() {
      for (const view of ['explore', 'stops', 'plan']) {
        click(`.main-navigation button[aria-controls="${view}-panel"]`)
        await pause(400)
      }
    },
    async sheet() {
      if (innerWidth > 768) throw new Error('Sheet scenario needs a mobile viewport')
      for (const key of ['ArrowDown', 'ArrowUp', 'ArrowUp', 'ArrowDown']) {
        document.querySelector('.mobile-sheet-viewport[data-active="true"] .mobile-sheet-handle').dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
        await pause(350)
      }
    },
    async search() {
      click('.main-navigation button[aria-controls="explore-panel"]')
      await pause(100)
      for (const value of ['', 'C', 'CO', 'COM', 'COM1']) {
        type('#explore-venue-search-input', value)
        await pause(120)
      }
      await pause(300)
    },
    async zoom() {
      click('button.maplibregl-ctrl-zoom-in')
      await pause(600)
      click('button.maplibregl-ctrl-zoom-out')
      await pause(600)
    },
    async refresh() {
      document.dispatchEvent(new Event('visibilitychange'))
      window.nusgoFixtureLocation()
      await actions.tabs()
    },
  }
  if (!actions[scenario]) throw new Error(`Unknown scenario: ${scenario}`)
  if (scenario === 'setup') { await actions.setup(); return { pathLoaded: true } }
  if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 5) throw new Error('Use 1 to 5 repetitions per call')
  if (!document.querySelector('.journey-results-item')) throw new Error('Run setup before measured scenarios')
  const samples = []
  for (let index = 0; index < repetitions; index++) {
    window.nusgoPerformance.start(scenario)
    try {
      await actions[scenario]()
    } finally {
      samples.push(window.nusgoPerformance.stop())
    }
  }
  return { scenario, viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio }, userAgent: navigator.userAgent, recordedAt: new Date().toISOString(), fixtureStats: { ...window.nusgoFixtureStats }, samples }
}
