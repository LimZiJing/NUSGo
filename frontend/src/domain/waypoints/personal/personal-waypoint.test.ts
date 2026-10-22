import { describe, expect, it } from 'vitest'
import {
  validatePersonalWaypoint,
  validatePersonalWaypoints,
} from './personal-waypoint'

const validWaypoint = {
  id: '11111111-1111-4111-8111-111111111111',
  name: '  Water fountain  ',
  category: '  Water  ',
  coordinate: { longitude: 103.78, latitude: 1.29 },
  note: '  Near the side entrance  ',
  createdAt: '2026-10-22T00:00:00.000Z',
  updatedAt: '2026-10-22T00:00:00.000Z',
}

describe('personal waypoint validation', () => {
  it('trims labels and notes, and keeps only personal waypoint fields', () => {
    expect(validatePersonalWaypoint(validWaypoint)).toEqual({
      ok: true,
      waypoint: {
        ...validWaypoint,
        name: 'Water fountain',
        category: 'Water',
        note: 'Near the side entrance',
      },
    })
  })

  it('omits a blank note', () => {
    const result = validatePersonalWaypoint({ ...validWaypoint, note: '   ' })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.waypoint).not.toHaveProperty('note')
  })

  it('rejects invalid UUIDs, blank labels, and text over the limits', () => {
    const result = validatePersonalWaypoint({
      ...validWaypoint,
      id: 'not-a-uuid',
      name: ' ',
      category: 'x'.repeat(41),
      note: 'x'.repeat(501),
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues.map(({ field }) => field)).toEqual(['id', 'name', 'category', 'note'])
    }
  })

  it('accepts inclusive WGS84 bounds and rejects non-finite or out-of-range coordinates', () => {
    expect(validatePersonalWaypoint({
      ...validWaypoint,
      coordinate: { longitude: -180, latitude: 90 },
    }).ok).toBe(true)

    for (const coordinate of [
      { longitude: 180.01, latitude: 0 },
      { longitude: 0, latitude: -90.01 },
      { longitude: Number.NaN, latitude: 1 },
    ]) {
      expect(validatePersonalWaypoint({ ...validWaypoint, coordinate }).ok).toBe(false)
    }
  })

  it('rejects timestamps with non-UTC offsets', () => {
    const result = validatePersonalWaypoint({
      ...validWaypoint,
      createdAt: '2026-10-22T00:00:00+08:00',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.issues.map(({ field }) => field)).toContain('createdAt')
  })

  it('accepts UTC ISO date-times without fractional seconds', () => {
    expect(validatePersonalWaypoint({
      ...validWaypoint,
      createdAt: '2026-10-22T00:00:00Z',
      updatedAt: '2026-10-22T00:00:00Z',
    }).ok).toBe(true)
  })

  it('rejects community-only fields on personal records', () => {
    const result = validatePersonalWaypoint({ ...validWaypoint, attribution: 'Community source' })
    expect(result.ok).toBe(false)
  })

  it('rejects duplicate IDs in a collection', () => {
    const result = validatePersonalWaypoints([validWaypoint, { ...validWaypoint, name: 'Another place' }])
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.issues).toEqual([
      { field: 'id', index: 1, message: 'Must be unique within the collection.' },
    ])
  })
})
