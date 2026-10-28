import { describe, expect, it } from 'vitest'
import type { PersonalWaypoint } from './personal-waypoint'
import { updatePersonalWaypoint } from './update-personal-waypoint'

const savedWaypoint: PersonalWaypoint = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Quiet bench',
  category: 'Rest spot',
  coordinate: { longitude: 103.78, latitude: 1.29 },
  markerColor: 'blue',
  markerIcon: 'dot',
  createdAt: '2026-10-26T00:00:00.000Z',
  updatedAt: '2026-10-26T00:00:00.000Z',
}

describe('updatePersonalWaypoint', () => {
  it('keeps identity and creation time while validating edited fields', () => {
    const result = updatePersonalWaypoint(savedWaypoint, {
      name: '  Shaded bench  ',
      category: '  Rest spot  ',
      coordinate: { longitude: 103.79, latitude: 1.30 },
      note: '  Near the garden  ',
    }, { now: () => '2026-10-28T12:30:00.000Z' })

    expect(result).toEqual({
      ok: true,
      waypoint: {
        id: savedWaypoint.id,
        name: 'Shaded bench',
        category: 'Rest spot',
        coordinate: { longitude: 103.79, latitude: 1.3 },
        note: 'Near the garden',
        markerColor: 'blue',
        markerIcon: 'dot',
        createdAt: savedWaypoint.createdAt,
        updatedAt: '2026-10-28T12:30:00.000Z',
      },
    })
  })

  it('returns field validation issues without changing the saved record', () => {
    const result = updatePersonalWaypoint(savedWaypoint, {
      name: ' ',
      category: 'Rest spot',
      coordinate: savedWaypoint.coordinate,
    }, { now: () => '2026-10-28T12:30:00.000Z' })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.issues).toContainEqual({ field: 'name', message: 'Must not be empty.' })
    expect(savedWaypoint.name).toBe('Quiet bench')
    expect(savedWaypoint.updatedAt).toBe('2026-10-26T00:00:00.000Z')
  })

  it('saves marker appearance and retains it when a draft omits appearance fields', () => {
    const edited = updatePersonalWaypoint(savedWaypoint, {
      name: 'Quiet bench',
      category: 'Rest spot',
      coordinate: savedWaypoint.coordinate,
      markerColor: 'purple',
      markerIcon: 'rest',
    }, { now: () => '2026-10-28T12:30:00.000Z' })

    expect(edited.ok).toBe(true)
    if (edited.ok) expect(edited.waypoint).toMatchObject({ markerColor: 'purple', markerIcon: 'rest' })

    const unchanged = updatePersonalWaypoint({ ...savedWaypoint, markerColor: 'green', markerIcon: 'food' }, {
      name: 'Quiet bench',
      category: 'Rest spot',
      coordinate: savedWaypoint.coordinate,
    }, { now: () => '2026-10-28T12:30:00.000Z' })

    expect(unchanged.ok).toBe(true)
    if (unchanged.ok) expect(unchanged.waypoint).toMatchObject({ markerColor: 'green', markerIcon: 'food' })
  })
})
