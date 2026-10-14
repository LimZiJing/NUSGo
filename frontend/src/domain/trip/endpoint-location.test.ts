import { describe, expect, it } from 'vitest'
import type { Building } from '@navus/shared/venue/buildings'
import type { TransitStop } from '@navus/shared/transit/types'
import { buildBuildingIndex } from '../venue/building-index'
import { getTripEndpointCoordinate } from './endpoint-location'

const com3: Building = {
  id: 'com3',
  name: 'COM3',
  aliases: [],
  elementId: 'way/1',
  location: { x: 103.7752, y: 1.2951 },
  locationKind: 'centroid',
  roomCodePrefixes: [],
  sourceRefs: [],
}
const com3Stop: TransitStop = {
  id: 'COM3',
  longName: 'COM3',
  shortName: 'COM3',
  latitude: 1.2944,
  longitude: 103.7752,
  services: [],
}
const sources = {
  venues: { 'COM3-0201': { roomName: 'Room', location: { x: 103.7753, y: 1.2952 } } },
  buildings: buildBuildingIndex([com3]),
  transitIndex: { stopById: new Map([[com3Stop.id, com3Stop]]) },
}

describe('getTripEndpointCoordinate', () => {
  it('resolves a building to its own location and a stop with the same name to its boarding location', () => {
    expect(getTripEndpointCoordinate({ kind: 'building', id: 'com3' }, sources)).toEqual({
      longitude: 103.7752,
      latitude: 1.2951,
    })
    expect(getTripEndpointCoordinate({ kind: 'stop', id: 'COM3' }, sources)).toEqual({
      longitude: 103.7752,
      latitude: 1.2944,
    })
  })

  it('resolves venues and current location', () => {
    expect(getTripEndpointCoordinate({ kind: 'venue', id: 'COM3-0201' }, sources)).toEqual({
      longitude: 103.7753,
      latitude: 1.2952,
    })
    expect(
      getTripEndpointCoordinate(
        { kind: 'current-location', coordinate: { longitude: 103.78, latitude: 1.3 } },
        sources,
      ),
    ).toEqual({ longitude: 103.78, latitude: 1.3 })
  })

  it('returns null for unknown identities, unloaded data or non-finite coordinates', () => {
    expect(getTripEndpointCoordinate({ kind: 'building', id: 'missing' }, sources)).toBeNull()
    expect(getTripEndpointCoordinate({ kind: 'building', id: 'com3' }, { ...sources, buildings: null })).toBeNull()
    expect(getTripEndpointCoordinate({ kind: 'stop', id: 'COM3' }, { ...sources, transitIndex: null })).toBeNull()
    expect(getTripEndpointCoordinate({ kind: 'venue', id: 'NOPE' }, sources)).toBeNull()
    expect(
      getTripEndpointCoordinate(
        { kind: 'current-location', coordinate: { longitude: Number.NaN, latitude: 1.3 } },
        sources,
      ),
    ).toBeNull()
  })
})
