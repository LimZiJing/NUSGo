import { describe, expect, it } from 'vitest'
import type { PersonalWaypoint } from '../../../../domain/waypoints/personal/personal-waypoint'
import {
  filterPersonalWaypoints,
  getPersonalWaypointCategories,
} from './filter-personal-waypoints'

const waypoints: readonly PersonalWaypoint[] = [
  {
    id: '00000000-0000-4000-8000-000000000001',
    name: 'Quiet bench',
    category: 'Rest spot',
    coordinate: { longitude: 103.78, latitude: 1.29 },
    createdAt: '2026-10-26T00:00:00.000Z',
    updatedAt: '2026-10-26T00:00:00.000Z',
  },
  {
    id: '00000000-0000-4000-8000-000000000002',
    name: 'Design studio',
    category: 'Study place',
    coordinate: { longitude: 103.79, latitude: 1.3 },
    createdAt: '2026-10-26T00:00:00.000Z',
    updatedAt: '2026-10-26T00:00:00.000Z',
  },
  {
    id: '00000000-0000-4000-8000-000000000003',
    name: 'Tea room',
    category: 'Rest spot',
    coordinate: { longitude: 103.8, latitude: 1.31 },
    createdAt: '2026-10-26T00:00:00.000Z',
    updatedAt: '2026-10-26T00:00:00.000Z',
  },
]

describe('Personal Waypoint list filtering', () => {
  it('searches waypoint names and categories without changing saved order', () => {
    expect(filterPersonalWaypoints(waypoints, '  REST ', null).map(({ id }) => id)).toEqual([
      waypoints[0].id,
      waypoints[2].id,
    ])
    expect(filterPersonalWaypoints(waypoints, 'design', null).map(({ id }) => id))
      .toEqual([waypoints[1].id])
  })

  it('filters by an exact category while keeping that category searchable', () => {
    expect(filterPersonalWaypoints(waypoints, '', 'Rest spot').map(({ name }) => name))
      .toEqual(['Quiet bench', 'Tea room'])
    expect(filterPersonalWaypoints(waypoints, 'tea', 'Rest spot').map(({ name }) => name))
      .toEqual(['Tea room'])
  })

  it('derives sorted unique categories from saved records', () => {
    expect(getPersonalWaypointCategories(waypoints)).toEqual(['Rest spot', 'Study place'])
    expect(getPersonalWaypointCategories([])).toEqual([])
  })
})
