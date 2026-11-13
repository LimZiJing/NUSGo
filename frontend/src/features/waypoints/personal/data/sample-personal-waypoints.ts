import type { PersonalWaypoint } from '../../../../domain/waypoints/personal/personal-waypoint'

/**
 * Dev-only sample collection for reviewing the Personal Waypoints screens with realistic volume:
 * six categories, fifteen places, every marker colour and icon in use, a long name, a note on some
 * rows and one category with enough places to scroll. Loaded only in development builds.
 */
export function createSamplePersonalWaypoints(): PersonalWaypoint[] {
  const rows: readonly [string, string, PersonalWaypoint['markerColor'], PersonalWaypoint['markerIcon'], string][] = [
    ['Quiet bench by the pond', 'Rest spot', 'purple', 'rest', 'Shaded after 4pm, near the carp pond'],
    ['Library roof garden', 'Rest spot', 'green', 'nature', ''],
    ['Study room 4-12', 'Study place', 'blue', 'dot', 'Booked slots only on weekdays'],
    ['Chapter nook, level 5', 'Study place', 'cyan', 'favorite', 'Silent floor, no drinks'],
    ['Engineering bench 7', 'Study place', 'gray', 'dot', ''],
    ['Coffee at The Deck', 'Food & drink', 'orange', 'food', 'Cheap iced kopi before 10am'],
    ['Mala stall, Techno Edge', 'Food & drink', 'red', 'food', ''],
    ['Fruit juice bar', 'Food & drink', 'yellow', 'food', ''],
    ['Meeting room, Blk EA', 'Work', 'blue', 'dot', ''],
    ['Lab 3, E4 basement', 'Work', 'purple', 'dot', 'Card access required after 7pm'],
    ['Printing corner', 'Work', 'gray', 'dot', ''],
    ['Bus stop B01 pickup', 'Commute', 'green', 'dot', ''],
    ['The very long name of a place that will not fit on one row', 'Commute', 'orange', 'favorite', 'Try the truncation here'],
    ['Bike rack, S17', 'Commute', 'cyan', 'dot', ''],
    ['Water cooler refill', 'Misc', 'yellow', 'rest', ''],
  ]

  return rows.map(([name, category, markerColor, markerIcon, note], index) => ({
    // Stable ids keep the sample deterministic between reloads.
    id: `5a000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    name,
    category,
    coordinate: {
      longitude: 103.7715 + index * 0.0009,
      latitude: 1.2961 + index * 0.0006,
    },
    note,
    markerColor,
    markerIcon,
    createdAt: '2026-11-13T00:00:00.000Z',
    updatedAt: '2026-11-13T00:00:00.000Z',
  }))
}
