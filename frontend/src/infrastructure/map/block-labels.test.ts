import { describe, expect, it } from 'vitest'
import type { Building } from '@navus/shared/venue/buildings'
import { buildBuildingIndex } from '../../domain/venue/building-index'
import { createBlockLabelGeoJson, createBlockNumberGeoJson, createGroupLabelGeoJson } from './block-labels'

function createBuilding(overrides: Partial<Building> & Pick<Building, 'id' | 'name'>): Building {
  return {
    aliases: [],
    elementId: `element-${overrides.id}`,
    location: { x: 103.7, y: 1.3 },
    roomCodePrefixes: [],
    sourceRefs: [],
    ...overrides,
  }
}

describe('createBlockLabelGeoJson', () => {
  it('labels only navigable parts that have blocks, with the block range as text', () => {
    const index = buildBuildingIndex([
      createBuilding({
        id: 'cendana-15',
        name: 'Cendana College',
        groupKey: 'cendana',
        partLabel: 'Block 15-17',
        blocks: ['15', '16', '17'],
        location: { x: 103.775, y: 1.301 },
      }),
      createBuilding({
        id: 'cendana-entrance',
        name: 'Cendana College',
        groupKey: 'cendana',
        groupRole: 'entrance',
        blocks: ['15'],
        location: { x: 103.776, y: 1.302 },
      }),
      createBuilding({
        id: 'library',
        name: 'Central Library',
        location: { x: 103.773, y: 1.296 },
      }),
      createBuilding({
        id: 'block-5',
        name: 'Block 5 Lecture Hall',
        blocks: ['5'],
        location: { x: 103.774, y: 1.297 },
      }),
      createBuilding({
        id: 'block-a-h',
        name: 'Engineering Annex',
        blocks: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'],
        location: { x: 103.78, y: 1.299 },
      }),
    ])

    const geoJson = createBlockLabelGeoJson(index.entries)

    expect(geoJson.type).toBe('FeatureCollection')
    expect(geoJson.features.map((feature) => feature.properties.label).sort()).toEqual([
      '15-17',
      '5',
      'A-H',
    ])
  })

  it('uses longitude then latitude as Point coordinates', () => {
    const index = buildBuildingIndex([
      createBuilding({
        id: 'block-5',
        name: 'Block 5 Lecture Hall',
        blocks: ['5'],
        location: { x: 103.774, y: 1.297 },
      }),
    ])

    const [feature] = createBlockLabelGeoJson(index.entries).features

    expect(feature).toEqual({
      type: 'Feature',
      properties: { label: '5' },
      geometry: { type: 'Point', coordinates: [103.774, 1.297] },
    })
  })

  it('returns an empty collection when no building has blocks', () => {
    const index = buildBuildingIndex([
      createBuilding({ id: 'library', name: 'Central Library' }),
    ])

    expect(createBlockLabelGeoJson(index.entries)).toEqual({
      type: 'FeatureCollection',
      features: [],
    })
    expect(createBlockLabelGeoJson([])).toEqual({
      type: 'FeatureCollection',
      features: [],
    })
  })
})

describe('createGroupLabelGeoJson', () => {
  it('labels only groups of several buildings, at the entry location, with the group name', () => {
    const index = buildBuildingIndex([
      createBuilding({ id: 'hall-a', name: 'Hall', groupKey: 'hall', partLabel: 'Block A', blocks: ['A'], location: { x: 103.71, y: 1.31 } }),
      createBuilding({ id: 'hall-b', name: 'Hall', groupKey: 'hall', partLabel: 'Block B', blocks: ['B'], location: { x: 103.72, y: 1.32 } }),
      createBuilding({ id: 'lone', name: 'Lone Hall', groupKey: 'lone', partLabel: 'Block A', blocks: ['A'] }),
      createBuilding({ id: 'library', name: 'Central Library' }),
    ])

    const features = createGroupLabelGeoJson(index.entries).features

    expect(features.map((feature) => feature.properties.label)).toEqual(['Hall'])
    expect(features[0].geometry.coordinates).toEqual(index.byId.get('hall')?.location && [
      index.byId.get('hall')!.location.x,
      index.byId.get('hall')!.location.y,
    ])
  })
})

describe('createBlockNumberGeoJson', () => {
  it('puts each block at its own location and groups blocks that share a point', () => {
    const index = buildBuildingIndex([
      createBuilding({
        id: 'res-5',
        name: 'Residence',
        groupKey: 'res',
        partLabel: 'Blocks 5-8',
        blocks: ['5', '6', '7', '8'],
        location: { x: 103.75, y: 1.25 },
        blockLocations: {
          '5': { x: 103.71, y: 1.21 },
          '6': { x: 103.72, y: 1.22 },
          '7': { x: 103.73, y: 1.23 },
          '8': { x: 103.73, y: 1.23 },
        },
      }),
      createBuilding({ id: 'plain', name: 'Plain', groupKey: 'plain', partLabel: 'Blocks 15-17', blocks: ['15', '16', '17'], location: { x: 103.7, y: 1.2 } }),
    ])

    const labels = createBlockNumberGeoJson(index.entries).features.map((feature) => [
      feature.properties.label,
      feature.geometry.coordinates,
    ])

    expect(labels).toContainEqual(['5', [103.71, 1.21]])
    expect(labels).toContainEqual(['6', [103.72, 1.22]])
    expect(labels).toContainEqual(['7-8', [103.73, 1.23]])
    // Without recorded block positions the range sits at the building.
    expect(labels).toContainEqual(['15-17', [103.7, 1.2]])
    expect(labels).toHaveLength(4)
  })
})

