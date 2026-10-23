import { describe, expect, it, vi } from 'vitest'
import { createPersonalWaypoint } from './create-personal-waypoint'

describe('create personal waypoint', () => {
  it('generates identity and initial timestamps once for a new record', () => {
    const createId = vi.fn(() => '11111111-1111-4111-8111-111111111111')
    const now = vi.fn(() => '2026-10-22T00:00:00.000Z')
    const result = createPersonalWaypoint({
      name: 'Water fountain',
      category: 'Water',
      coordinate: { longitude: 103.78, latitude: 1.29 },
    }, { createId, now })

    expect(result).toEqual({
      ok: true,
      waypoint: {
        id: '11111111-1111-4111-8111-111111111111',
        name: 'Water fountain',
        category: 'Water',
        coordinate: { longitude: 103.78, latitude: 1.29 },
        createdAt: '2026-10-22T00:00:00.000Z',
        updatedAt: '2026-10-22T00:00:00.000Z',
      },
    })
    expect(createId).toHaveBeenCalledTimes(1)
    expect(now).toHaveBeenCalledTimes(1)
  })
})
