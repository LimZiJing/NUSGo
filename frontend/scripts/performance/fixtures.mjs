// Controlled browser-boundary fixtures, never production application code or live-provider evidence.
export function installFixtures(network) {
  const originalFetch = window.fetch.bind(window)
  const json = (body) => Promise.resolve(new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } }))
  let generation = 0
  window.nusgoFixtureStats = { arrivalRequests: 0, journeyRequests: 0, locationFixes: 0 }
  window.fetch = (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href)
    // Isolate application/overlay work from variable external vector tiles and GPU cost.
    if (url.hostname === 'tiles.openfreemap.org' && url.pathname === '/styles/liberty') {
      return json({ version: 8, glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf', sources: {}, layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#eef1ef' } }] })
    }
    if (!url.pathname.startsWith('/api/')) return originalFetch(input, init)
    const observedAt = new Date().toISOString()
    const expiresAt = new Date(Date.now() + 90_000).toISOString()
    const requested = JSON.parse(url.searchParams.get('stops') ?? '[]')
    if (url.pathname === '/api/health') return json({ status: 'ok', dataVersion: 'development' })
    if (url.pathname === '/api/shuttle-service-windows') return json({ routes: {} })
    if (url.pathname === '/api/shuttle-arrivals') {
      window.nusgoFixtureStats.arrivalRequests++
      return json({
      observedAt, expiresAt, refreshedAt: observedAt, snapshotVersion: `${observedAt}-${++generation}`,
      stops: Object.fromEntries(requested.map((id) => [id, Object.fromEntries((network.stops.find((stop) => stop.id === id)?.services ?? []).filter((id) => !id.startsWith('PUB:')).map((id) => [id, { nextArrivalSeconds: 120, upcomingArrivalSeconds: [120, 600] }]))])),
      })
    }
    if (url.pathname === '/api/public-bus-arrivals') return json({ source: 'lta-datamall', observedAt, expiresAt, refreshedAt: observedAt, stops: Object.fromEntries(requested.map((id) => [id, { observedAt, expiresAt, services: {} }])) })
    if (url.pathname === '/api/journeys') {
      window.nusgoFixtureStats.journeyRequests++
      const request = JSON.parse(init.body)
      const coordinate = (endpoint) => {
        const stop = network.stops.find(({ id }) => id === endpoint.id)
        if (!stop) throw new Error('Fixture only accepts canonical stop endpoints')
        return [stop.longitude, stop.latitude]
      }
      const start = coordinate(request.origin)
      const end = coordinate(request.destination)
      const coordinates = Array.from({ length: 1000 }, (_, index) => {
        const fraction = index / 999
        return [start[0] + (end[0] - start[0]) * fraction, start[1] + (end[1] - start[1]) * fraction]
      })
      return json({ outcome: 'paths', searchStatus: 'complete', candidates: [{
        candidateKey: 'performance-fixture-walking', adjustedDurationSeconds: 1125, score: 1 / 1125,
        path: {
          origin: request.origin, destination: request.destination,
          totalDurationSeconds: 900, totalDistanceMeters: 1200, estimateStatus: 'estimated', planningQuality: 'exact',
          legs: [{ mode: 'walking', from: request.origin, to: request.destination, durationSeconds: 900, distanceMeters: 1200, geometry: { type: 'LineString', coordinates } }],
        },
      }] })
    }
    throw new Error(`Unconfigured performance API fixture: ${url.pathname}`)
  }
  let locationListener = null
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: {
    watchPosition(success) { locationListener = success; window.nusgoFixtureLocation(); return 1 },
    clearWatch() { locationListener = null },
    getCurrentPosition(success) { success({ coords: { longitude: 103.775217, latitude: 1.294431, accuracy: 10 }, timestamp: Date.now() }) },
  } })
  window.nusgoFixtureLocation = () => {
    if (!locationListener) return
    window.nusgoFixtureStats.locationFixes++
    locationListener({ coords: { longitude: 103.775217 + generation * 0.000001, latitude: 1.294431, accuracy: 10 }, timestamp: Date.now() })
  }
}
