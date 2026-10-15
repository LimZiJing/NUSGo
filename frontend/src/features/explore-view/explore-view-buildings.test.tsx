import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { Building } from '@navus/shared/venue/buildings'
import type { TransitNetworkInput } from '@navus/shared/transit/types'
import type { VenueLocationMap } from '@navus/shared/venue/types'
import { createTransitIndex } from '../../domain/transit'
import { createValidTransitNetwork } from '../../domain/transit/test-fixtures'
import { buildBuildingIndex } from '../../domain/venue/building-index'
import { ExploreView } from './explore-view'
import { createInitialExploreViewState, exploreViewReducer, type ExploreViewState } from './state'

function building(overrides: Partial<Building> & Pick<Building, 'id' | 'name'>): Building {
  return {
    aliases: [],
    elementId: `way/${overrides.id}`,
    location: { x: 103.77, y: 1.3 },
    locationKind: 'centroid',
    roomCodePrefixes: [],
    sourceRefs: [],
    ...overrides,
  }
}

const buildings = buildBuildingIndex([
  building({ id: 'com1', name: 'COM1', aliases: ['COM 1'], address: '13 Computing Drive', roomCodePrefixes: ['COM1'] }),
  building({ id: 'lt-17', name: 'LT 17', aliases: ['LT17'], roomCodePrefixes: ['LT17'] }),
  building({ id: 'saga-1', name: 'Saga College', groupKey: 'saga', address: '8 College Avenue West', roomCodePrefixes: ['RC1'] }),
  building({ id: 'saga-2', name: 'Saga College', groupKey: 'saga', address: '10 College Avenue West', roomCodePrefixes: ['RC1'] }),
  building({ id: 'elm-1', name: 'Elm College', groupKey: 'elm', address: '3 Elm Road' }),
  building({ id: 'elm-2', name: 'Elm College', groupKey: 'elm', address: '3 Elm Road' }),
  building({ id: 'elm-3', name: 'Elm College', groupKey: 'elm', address: '3 Elm Road' }),
])
const venues: VenueLocationMap = {
  'COM1-0210': { roomName: 'Seminar Room 10', floor: 2, location: { x: 103.77, y: 1.3 } },
  'COM1-0211': { roomName: 'Seminar Room 11', floor: 2, location: { x: 103.77, y: 1.3 } },
  LT17: { roomName: 'Lecture Theatre 17', location: { x: 103.77, y: 1.3 } },
  'RC1-01-01': { roomName: 'Saga classroom', floor: 1, location: { x: 103.77, y: 1.3 } },
}

function createNearbyTransitIndex() {
  const network: TransitNetworkInput = createValidTransitNetwork()
  network.routes = [{ id: 'A1', name: 'A1', color: '#123456', stopIds: ['STOP-A'] }]
  network.stops = [{
    id: 'STOP-A',
    longName: 'COM1 Bus Stop',
    shortName: 'COM1',
    latitude: 1.3002,
    longitude: 103.77,
    services: ['A1'],
  }]
  return createTransitIndex(network)
}

function render(state: ExploreViewState): string {
  return renderToStaticMarkup(
    <ExploreView
      state={state}
      venues={venues}
      buildings={buildings}
      transitIndex={createNearbyTransitIndex()}
      shuttleRoutesAvailable
      renderShuttleRoutes={() => null}
      onQueryChange={() => undefined}
      onVenueSelect={() => undefined}
      onBuildingSelect={() => undefined}
      onNavigateToBuilding={() => undefined}
      onOpenShuttle={() => undefined}
      onFocusStop={() => undefined}
      onBack={() => undefined}
      onEscape={() => undefined}
    />,
  )
}

const searching = (query: string): ExploreViewState => ({
  ...createInitialExploreViewState(),
  mode: 'venue-search',
  query,
})

const viewing = (buildingId: string): ExploreViewState => exploreViewReducer(
  createInitialExploreViewState(),
  { type: 'select-building', buildingId },
)

describe('ExploreView search with buildings', () => {
  it('lists a building ahead of its rooms with an accessible building label', () => {
    const markup = render(searching('com1'))

    expect(markup).toContain('aria-label="COM1, building, 13 Computing Drive"')
    expect(markup.indexOf('building-result-com1')).toBeLessThan(markup.indexOf('venue-result-COM1-0210'))
    expect(markup).toContain('aria-label="COM1-0210, venue, Seminar Room 10"')
  })

  it('shows a repeated-name group as one result and a whole-building venue only as its building', () => {
    const group = render(searching('saga'))
    const theatre = render(searching('lecture theatre 17'))

    expect(group.match(/building-result-/g)).toHaveLength(1)
    expect(group).toContain('2 buildings')
    expect(theatre).toContain('building-result-lt-17')
    expect(theatre).not.toContain('venue-result-LT17')
  })
})

describe('ExploreView building details', () => {
  it('shows the name, address, room count and nearby stops, with no NUSMods link', () => {
    const markup = render(viewing('com1'))

    expect(markup).toContain('aria-label="COM1, building"')
    expect(markup).toContain('13 Computing Drive')
    expect(markup).toContain('2 rooms')
    expect(markup).toContain('Nearby bus stops within 500 m')
    expect(markup).toContain('COM1 Bus Stop')
    expect(markup).not.toContain('nusmods')
    expect(markup).not.toContain('NUSMods')
  })

  it('lists every part of a repeated-name group', () => {
    const markup = render(viewing('saga'))

    expect(markup).toContain('aria-label="Saga College, building"')
    expect(markup).toContain('2 buildings')
    expect(markup).toContain('Part 1 · 8 College Avenue West')
    expect(markup).toContain('Part 2 · 10 College Avenue West')
    expect(markup).toContain('1 room')
    expect(markup).not.toContain('1 rooms')
  })

  it('states a shared group address once instead of repeating it for every part', () => {
    const markup = render(viewing('elm'))

    expect(markup.match(/3 Elm Road/g)).toHaveLength(1)
    expect(markup).toContain('3 buildings')
    expect(markup).not.toContain('Part 1')
    expect(markup).toContain('Each building is marked on the map')
  })

  it('never describes the location as an entrance', () => {
    expect(render(viewing('com1')).toLowerCase()).not.toContain('entrance')
  })
})
