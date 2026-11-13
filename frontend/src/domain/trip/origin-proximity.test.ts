import { describe, expect, it } from 'vitest'
import type { DeviceLocationFix } from '../location/types'
import {
  CURRENT_LOCATION_ORIGIN_MERGE_DISTANCE_METERS,
  isOriginDuplicatedByCurrentLocation,
} from './origin-proximity'

const ORIGIN = { longitude: 103.7812, latitude: 1.2961 }
const EARTH_RADIUS_METERS = 6_371_008.8

/** Moves the origin due north by an exact ground distance, the way a device fix would. */
function fixMetresNorth(meters: number): DeviceLocationFix {
  return {
    longitude: ORIGIN.longitude,
    latitude: ORIGIN.latitude + (meters / EARTH_RADIUS_METERS) * 180 / Math.PI,
    accuracy: 8,
    timestamp: 1_000,
  }
}

const merge = (fix: DeviceLocationFix | null, visible = true, trusted = true) => (
  isOriginDuplicatedByCurrentLocation(ORIGIN, { fix, visible, trusted })
)

describe('origin circle and Current location proximity', () => {
  it('merges the origin with a visible dot at 19.9, 20 and keeps it at 20.1 metres', () => {
    expect(CURRENT_LOCATION_ORIGIN_MERGE_DISTANCE_METERS).toBe(20)
    expect(merge(fixMetresNorth(19.9))).toBe(true)
    // The boundary is inclusive: exactly 20 m away is still the same place.
    expect(merge(fixMetresNorth(20))).toBe(true)
    expect(merge(fixMetresNorth(20.1))).toBe(false)
  })

  it('measures geography rather than pixels, so zoom and panning cannot change the answer', () => {
    // An east-west offset uses the same shared distance helper, not a screen projection. The ground
    // distances travel through floating point, so give the boundary a few centimetres of slack
    // rather than asserting an artefact of the sphere maths.
    const eastAt = (meters: number) => ({
      ...fixMetresNorth(0),
      longitude: ORIGIN.longitude + (meters / (EARTH_RADIUS_METERS * Math.cos(ORIGIN.latitude * Math.PI / 180))) * 180 / Math.PI,
    })
    expect(merge(eastAt(20 - 0.01))).toBe(true)
    expect(merge(eastAt(20 + 0.01))).toBe(false)
  })

  it('keeps the origin circle when Current location is hidden or untrusted', () => {
    const fix = fixMetresNorth(1)
    expect(merge(fix, false, true)).toBe(false)
    expect(merge(fix, true, false)).toBe(false)
    expect(merge(null)).toBe(false)
  })

  it('keeps the origin circle when the dot fix is outside the shared validity boundary', () => {
    expect(merge({ ...fixMetresNorth(1), longitude: Number.NaN })).toBe(false)
    expect(merge({ ...fixMetresNorth(1), latitude: 91 })).toBe(false)
  })

  it('never suppresses the origin without a selected origin', () => {
    expect(isOriginDuplicatedByCurrentLocation(null, {
      fix: fixMetresNorth(1),
      visible: true,
      trusted: true,
    })).toBe(false)
  })
})
