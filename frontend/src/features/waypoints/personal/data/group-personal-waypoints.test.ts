import { describe, expect, it } from 'vitest'
import type { PersonalWaypoint } from '../../../../domain/waypoints/personal/personal-waypoint'
import { groupPersonalWaypointsByCategory, personalWaypointCountLabel } from './group-personal-waypoints'

function waypoint(id: string, name: string, category: string): PersonalWaypoint {
  return {
    id,
    name,
    category,
    coordinate: { longitude: 103.78, latitude: 1.29 },
    markerColor: 'blue',
    markerIcon: 'dot',
    createdAt: '2026-11-13T00:00:00.000Z',
    updatedAt: '2026-11-13T00:00:00.000Z',
  }
}

describe('groupPersonalWaypointsByCategory', () => {
  it('orders categories alphabetically and keeps saved order inside each group', () => {
    const groups = groupPersonalWaypointsByCategory([
      waypoint('1', 'Work one', 'Work'),
      waypoint('2', 'Alpha one', 'Alpha'),
      waypoint('3', 'Work two', 'Work'),
      waypoint('4', 'Alpha two', 'Alpha'),
    ])

    expect(groups.map(({ category }) => category)).toEqual(['Alpha', 'Work'])
    expect(groups[0].waypoints.map(({ name }) => name)).toEqual(['Alpha one', 'Alpha two'])
    expect(groups[1].waypoints.map(({ name }) => name)).toEqual(['Work one', 'Work two'])
  })

  it('keeps a group for every distinct category and never invents an empty one', () => {
    const groups = groupPersonalWaypointsByCategory([
      waypoint('1', 'Only', 'Study'),
      waypoint('2', 'Other', 'Study'),
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0]).toEqual({ category: 'Study', waypoints: expect.any(Array) })
    expect(groups[0].waypoints).toHaveLength(2)
  })

  it('returns nothing for an empty collection', () => {
    expect(groupPersonalWaypointsByCategory([])).toEqual([])
  })

  it('sorts case-insensitively the way people read category names', () => {
    const groups = groupPersonalWaypointsByCategory([
      waypoint('1', 'a', 'apple'),
      waypoint('2', 'b', 'Banana'),
      waypoint('3', 'c', 'Cherry'),
    ])

    expect(groups.map(({ category }) => category)).toEqual(['apple', 'Banana', 'Cherry'])
  })
})

describe('personalWaypointCountLabel', () => {
  it('uses the same wording as the rest of the collection', () => {
    expect(personalWaypointCountLabel(0)).toBe('0 places')
    expect(personalWaypointCountLabel(1)).toBe('1 place')
    expect(personalWaypointCountLabel(2)).toBe('2 places')
  })
})
