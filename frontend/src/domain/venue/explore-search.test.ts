import { describe, expect, it } from 'vitest'
import type { Building } from '@navus/shared/venue/buildings'
import type { VenueLocationMap } from '@navus/shared/venue/types'
import { buildBuildingIndex } from './building-index'
import { linkVenuesToBuildings } from './building-links'
import { searchExplore } from './explore-search'

function building(overrides: Partial<Building> & Pick<Building, 'id' | 'name'>): Building {
  return {
    aliases: [],
    elementId: `way/${overrides.id}`,
    location: { x: 103.77, y: 1.29 },
    locationKind: 'centroid',
    roomCodePrefixes: [],
    sourceRefs: [],
    ...overrides,
  }
}

const room = (roomName: string) => ({ roomName, location: { x: 103.77, y: 1.29 } })
const buildings = buildBuildingIndex([
  building({ id: 'com1', name: 'COM1', aliases: ['COM 1', 'Computing 1'], roomCodePrefixes: ['COM1'] }),
  building({ id: 'lt-17', name: 'LT 17', aliases: ['LT17'], roomCodePrefixes: ['LT17'] }),
  building({ id: 'saga-1', name: 'Saga College', groupKey: 'saga' }),
  building({ id: 'saga-2', name: 'Saga College', groupKey: 'saga' }),
])
const venues: VenueLocationMap = {
  'COM1-0210': room('Seminar Room 10'),
  LT17: room('Lecture Theatre 17'),
  'Y-CR3': room('Yale classroom'),
  Pinnacle: room('Pinnacle'),
}
const links = linkVenuesToBuildings(venues, buildings)
const search = (query: string) => searchExplore({ venues, buildings, links }, query)

describe('searchExplore', () => {
  it('returns nothing for an empty query', () => {
    expect(search('  ')).toEqual([])
  })

  it('lists a matching building before the rooms inside it', () => {
    const results = search('com1')

    expect(results.map((result) => (result.kind === 'building' ? `building:${result.entry.id}` : `venue:${result.result.code}`)))
      .toEqual(['building:com1', 'venue:COM1-0210'])
  })

  it('shows a whole-building venue once, as the building, and still finds it by its room name', () => {
    const byCode = search('lt17')
    const byRoomName = search('lecture theatre 17')

    for (const results of [byCode, byRoomName]) {
      expect(results).toHaveLength(1)
      expect(results[0]).toMatchObject({ kind: 'building', entry: { id: 'lt-17' } })
    }
  })

  it('shows a repeated-name group once', () => {
    const results = search('saga')

    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({ kind: 'building', entry: { id: 'saga', parts: [{ id: 'saga-1' }, { id: 'saga-2' }] } })
  })

  it('keeps venues without a catalogue building searchable as venues', () => {
    expect(search('pinnacle')).toEqual([{ kind: 'venue', result: { code: 'Pinnacle', venue: venues.Pinnacle } }])
    expect(search('y-cr3')).toHaveLength(1)
  })
})
