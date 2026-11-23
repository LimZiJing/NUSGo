import { describe, expect, it } from 'vitest'
import { findNearestVenue } from './nearest'

const location = { longitude: 103.7844, latitude: 1.2948 }

describe('findNearestVenue', () => {
  it('returns the closest mapped venue', () => {
    const result = findNearestVenue({
      FAR: { kind: 'room', roomName: 'Far venue', location: { x: 103.8, y: 1.31 } },
      NEAR: { kind: 'room', roomName: 'Near venue', location: { x: 103.7845, y: 1.2949 } },
    }, location)

    expect(result).toEqual({
      code: 'NEAR',
      venue: { kind: 'room', roomName: 'Near venue', location: { x: 103.7845, y: 1.2949 } },
    })
  })

  it('ignores venues without usable coordinates', () => {
    expect(findNearestVenue({ UNMAPPED: { kind: 'room', roomName: 'Unmapped venue' } }, location)).toBeNull()
  })

  it('uses the venue code as a stable tie breaker', () => {
    const result = findNearestVenue({
      ZED: { kind: 'room', roomName: 'Zed venue', location: { x: 103.7845, y: 1.2949 } },
      ALPHA: { kind: 'room', roomName: 'Alpha venue', location: { x: 103.7845, y: 1.2949 } },
    }, location)

    expect(result?.code).toBe('ALPHA')
  })
})
