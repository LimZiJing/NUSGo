import type { TransitNetworkInput } from '@nusgo/shared/transit/types'

export function createValidTransitNetwork(): TransitNetworkInput {
  return {
    version: 1,
    metadata: {
      source: 'test source',
      routeStopOrder: 'test order',
      routeGeometry: 'not included',
      verifiedAt: '2026-09-17',
      routeOrderSource: 'test route source',
      coordinateSource: 'test coordinate source',
    },
    routes: [{ id: 'A1', name: 'A1', color: '#123456', stopIds: ['STOP-A', 'STOP-B'] }],
    stops: [
      { id: 'STOP-A', longName: 'Stop A', shortName: 'A', latitude: 1, longitude: 103, services: ['A1', 'PUB:95'], opposite: 'STOP-B' },
      { id: 'STOP-B', longName: 'Stop B', shortName: 'B', latitude: 1.1, longitude: 103.1, services: ['A1'], opposite: 'STOP-A' },
    ],
  }
}

export function createTransferTransitNetwork(): TransitNetworkInput {
  const network = createValidTransitNetwork()
  network.routes.push({ id: 'B1', name: 'B1', color: '#654321', stopIds: ['STOP-B', 'STOP-C'] })
  network.stops[1].services.push('B1')
  network.stops.push({
    id: 'STOP-C',
    longName: 'Stop C',
    shortName: 'C',
    latitude: 1.2,
    longitude: 103.2,
    services: ['B1'],
    opposite: null,
  })
  return network
}
