import type { TransitNetwork } from '../types/transit'

export function createValidTransitNetwork(): TransitNetwork {
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
