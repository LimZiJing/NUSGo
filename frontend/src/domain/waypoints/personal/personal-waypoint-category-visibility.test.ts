import { describe, expect, it } from 'vitest'
import type { PersonalWaypoint } from './personal-waypoint'
import {
  filterPersonalWaypointsByCategoryVisibility,
  getPersonalWaypointCategoryOptions,
} from './personal-waypoint-category-visibility'

const waypoints: readonly PersonalWaypoint[] = [
  {
    id: '00000000-0000-4000-8000-000000000001',
    name: 'Quiet bench',
    category: 'Rest spot',
    coordinate: { longitude: 103.78, latitude: 1.29 },
    markerColor: 'blue',
    markerIcon: 'dot',
    createdAt: '2026-10-26T00:00:00.000Z',
    updatedAt: '2026-10-26T00:00:00.000Z',
  },
  {
    id: '00000000-0000-4000-8000-000000000002',
    name: 'Cafe',
    category: 'Food & drink',
    coordinate: { longitude: 103.79, latitude: 1.3 },
    markerColor: 'green',
    markerIcon: 'food',
    createdAt: '2026-10-26T00:00:00.000Z',
    updatedAt: '2026-10-26T00:00:00.000Z',
  },
  {
    id: '00000000-0000-4000-8000-000000000003',
    name: 'Garden table',
    category: 'Rest spot',
    coordinate: { longitude: 103.8, latitude: 1.31 },
    markerColor: 'orange',
    markerIcon: 'nature',
    createdAt: '2026-10-26T00:00:00.000Z',
    updatedAt: '2026-10-26T00:00:00.000Z',
  },
]

describe('Personal Waypoint category visibility', () => {
  it('lists each saved category once with counts in alphabetical order', () => {
    expect(getPersonalWaypointCategoryOptions(waypoints)).toEqual([
      { category: 'Food & drink', waypointCount: 1 },
      { category: 'Rest spot', waypointCount: 2 },
    ])
  })

  it('filters only the map projection and shows unknown categories by default', () => {
    expect(filterPersonalWaypointsByCategoryVisibility(waypoints, ['Rest spot']).map(({ id }) => id))
      .toEqual([waypoints[1].id])
    expect(filterPersonalWaypointsByCategoryVisibility(waypoints, []).map(({ id }) => id))
      .toEqual(waypoints.map(({ id }) => id))
  })
})
