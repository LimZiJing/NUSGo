import { describe, expect, it } from 'vitest'
import roundTripFixture from './fixtures/community-roundtrip.geojson?raw'
import { COMMUNITY_WAYPOINT_CATEGORIES } from './community.ts'
import {
  CommunityWaypointGeoJsonValidationError,
  parseCommunityWaypointsGeoJson,
} from './community-geojson'

const requiredProperties = {
  id: 'cw-550e8400-e29b-41d4-a716-446655440000',
  category: 'water_cooler',
  source: 'Checked on site',
  updatedAt: '2026-11-08',
}

function collectionWith(
  properties: Record<string, unknown> = {},
  coordinates: unknown = [103.7844, 1.2933],
  geometryType = 'Point',
): unknown {
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: { type: geometryType, coordinates },
        properties: { ...requiredProperties, ...properties },
      },
    ],
  }
}

describe('parseCommunityWaypointsGeoJson', () => {
  it('exposes the approved category values with separate display labels', () => {
    expect(COMMUNITY_WAYPOINT_CATEGORIES).toEqual([
      { value: 'water_cooler', label: 'Water cooler' },
      { value: 'atm', label: 'ATM' },
      { value: 'toilet', label: 'Toilet' },
      { value: 'vending_machine', label: 'Vending machine' },
    ])
  })

  it('converts a reviewed GeoJSON Point into a Community Waypoint', () => {
    const input = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [103.7844, 1.2933] },
          properties: {
            id: 'cw-550e8400-e29b-41d4-a716-446655440000',
            category: 'water_cooler',
            source: 'Checked on site',
            updatedAt: '2026-11-08',
            building: 'Central Library',
            floor: 2,
            details: 'Near the study area',
          },
        },
      ],
    }

    expect(parseCommunityWaypointsGeoJson(input)).toEqual([
      {
        id: 'cw-550e8400-e29b-41d4-a716-446655440000',
        displayLabel: 'Water cooler · Central Library · Floor 2',
        category: 'water_cooler',
        coordinate: { longitude: 103.7844, latitude: 1.2933 },
        source: 'Checked on site',
        updatedAt: '2026-11-08',
        building: 'Central Library',
        floor: 2,
        details: 'Near the study area',
      },
    ])
  })

  it.each(['water_cooler', 'atm', 'toilet', 'vending_machine'])(
    'accepts the controlled category %s',
    (category) => {
      expect(parseCommunityWaypointsGeoJson(collectionWith({ category }))[0]?.category).toBe(category)
    },
  )

  it('uses the category label when no location details are available', () => {
    expect(parseCommunityWaypointsGeoJson(collectionWith({ category: 'vending_machine' }))[0]?.displayLabel)
      .toBe('Vending machine')
  })

  it('accepts an empty FeatureCollection', () => {
    expect(parseCommunityWaypointsGeoJson({ type: 'FeatureCollection', features: [] })).toEqual([])
  })

  it('treats missing and null optional fields as empty', () => {
    const expected = {
      id: requiredProperties.id,
      displayLabel: 'Water cooler',
      category: 'water_cooler',
      coordinate: { longitude: 103.7844, latitude: 1.2933 },
      source: requiredProperties.source,
      updatedAt: requiredProperties.updatedAt,
    }
    const missing = parseCommunityWaypointsGeoJson(collectionWith({}))
    const nulls = parseCommunityWaypointsGeoJson(collectionWith({
      building: null,
      floor: null,
      details: null,
    }))

    expect(missing[0]).toEqual(expected)
    expect(nulls[0]).toEqual(expected)
  })

  it('rejects unsupported collection, feature, and geometry shapes', () => {
    expect(() => parseCommunityWaypointsGeoJson({ type: 'Feature', features: [] }))
      .toThrow(CommunityWaypointGeoJsonValidationError)
    expect(() => parseCommunityWaypointsGeoJson({ type: 'FeatureCollection', features: {} }))
      .toThrow(CommunityWaypointGeoJsonValidationError)
    expect(() => parseCommunityWaypointsGeoJson({ type: 'FeatureCollection', features: [null] }))
      .toThrow(CommunityWaypointGeoJsonValidationError)
    expect(() => parseCommunityWaypointsGeoJson(collectionWith({}, [103.78, 1.29], 'Polygon')))
      .toThrow(CommunityWaypointGeoJsonValidationError)
  })

  it('rejects reversed, extra, non-finite, and out-of-area coordinates', () => {
    expect(() => parseCommunityWaypointsGeoJson(collectionWith({}, [1.2933, 103.7844])))
      .toThrow(CommunityWaypointGeoJsonValidationError)
    expect(() => parseCommunityWaypointsGeoJson(collectionWith({}, [103.7844, 1.2933, 12])))
      .toThrow(CommunityWaypointGeoJsonValidationError)
    expect(() => parseCommunityWaypointsGeoJson(collectionWith({}, [Number.NaN, 1.2933])))
      .toThrow(CommunityWaypointGeoJsonValidationError)
    expect(() => parseCommunityWaypointsGeoJson(collectionWith({}, [104.1, 1.2933])))
      .toThrow(CommunityWaypointGeoJsonValidationError)
  })

  it('accepts coordinates on the inclusive Singapore bounds', () => {
    expect(parseCommunityWaypointsGeoJson(collectionWith({}, [103.59, 1.13]))[0]?.coordinate)
      .toEqual({ longitude: 103.59, latitude: 1.13 })
    expect(parseCommunityWaypointsGeoJson(collectionWith({}, [104.09, 1.48]))[0]?.coordinate)
      .toEqual({ longitude: 104.09, latitude: 1.48 })
  })

  it('rejects duplicate stable IDs in one published collection', () => {
    const feature = {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [103.7844, 1.2933] },
      properties: { ...requiredProperties },
    }

    expect(() => parseCommunityWaypointsGeoJson({
      type: 'FeatureCollection',
      features: [feature, { ...feature, properties: { ...feature.properties, details: 'Another place' } }],
    })).toThrow(CommunityWaypointGeoJsonValidationError)
  })

  it('rejects a submitted name in public properties', () => {
    expect(() => parseCommunityWaypointsGeoJson(collectionWith({ name: 'Water station' })))
      .toThrow(CommunityWaypointGeoJsonValidationError)
  })

  it('rejects the retired accessibility note field in public properties', () => {
    expect(() => parseCommunityWaypointsGeoJson(collectionWith({ accessibilityNote: 'Step-free route' })))
      .toThrow(CommunityWaypointGeoJsonValidationError)
  })

  it('rejects private review fields in public properties', () => {
    expect(() => parseCommunityWaypointsGeoJson(collectionWith({ reporterEmail: 'person@example.com' })))
      .toThrow(CommunityWaypointGeoJsonValidationError)
    expect(() => parseCommunityWaypointsGeoJson(collectionWith({ privateIssueUrl: 'https://example.test/1' })))
      .toThrow(CommunityWaypointGeoJsonValidationError)
    expect(() => parseCommunityWaypointsGeoJson(collectionWith({ photoEvidenceId: 'image-123' })))
      .toThrow(CommunityWaypointGeoJsonValidationError)
  })

  it.each(['2026-02-30', '2026-11-8', '08/11/2026'])(
    'rejects invalid review dates such as %s',
    (updatedAt) => {
      expect(() => parseCommunityWaypointsGeoJson(collectionWith({ updatedAt })))
        .toThrow(CommunityWaypointGeoJsonValidationError)
    },
  )

  it('rejects invalid IDs, unsupported categories, and non-integer floors', () => {
    expect(() => parseCommunityWaypointsGeoJson(collectionWith({ id: 'cw-not-a-uuid' })))
      .toThrow(CommunityWaypointGeoJsonValidationError)
    expect(() => parseCommunityWaypointsGeoJson(collectionWith({ category: 'staff_room' })))
      .toThrow(CommunityWaypointGeoJsonValidationError)
    expect(() => parseCommunityWaypointsGeoJson(collectionWith({ floor: 1.5 })))
      .toThrow(CommunityWaypointGeoJsonValidationError)
    expect(() => parseCommunityWaypointsGeoJson(collectionWith({ floor: '2' })))
      .toThrow(CommunityWaypointGeoJsonValidationError)
  })

  it('trims public text and enforces its documented length limits', () => {
    expect(parseCommunityWaypointsGeoJson(collectionWith({
      building: '  Central Library  ',
      details: '  Near the study area  ',
      source: '  Checked on site  ',
    }))[0]).toMatchObject({
      displayLabel: 'Water cooler · Central Library',
      details: 'Near the study area',
      source: 'Checked on site',
    })

    expect(() => parseCommunityWaypointsGeoJson(collectionWith({ source: 'x'.repeat(161) })))
      .toThrow(CommunityWaypointGeoJsonValidationError)
    expect(() => parseCommunityWaypointsGeoJson(collectionWith({ building: 'x'.repeat(81) })))
      .toThrow(CommunityWaypointGeoJsonValidationError)
    expect(() => parseCommunityWaypointsGeoJson(collectionWith({ details: 'x'.repeat(501) })))
      .toThrow(CommunityWaypointGeoJsonValidationError)
    expect(() => parseCommunityWaypointsGeoJson(collectionWith({ details: '  ' })))
      .toThrow(CommunityWaypointGeoJsonValidationError)
  })

  it('rejects unrecognized collection and feature members', () => {
    const feature = {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [103.7844, 1.2933] },
      properties: { ...requiredProperties },
    }

    expect(() => parseCommunityWaypointsGeoJson({
      type: 'FeatureCollection',
      features: [feature],
      privateReviewNotes: 'keep private',
    })).toThrow(CommunityWaypointGeoJsonValidationError)
    expect(() => parseCommunityWaypointsGeoJson({
      type: 'FeatureCollection',
      features: [{ ...feature, privateSubmissionUrl: 'https://example.test/1' }],
    })).toThrow(CommunityWaypointGeoJsonValidationError)
  })

  it('rejects the whole collection when any feature is invalid', () => {
    const validFeature = {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [103.7844, 1.2933] },
      properties: { ...requiredProperties },
    }
    const invalidFeature = {
      ...validFeature,
      properties: { ...requiredProperties, category: 'unknown' },
    }

    expect(() => parseCommunityWaypointsGeoJson({
      type: 'FeatureCollection',
      features: [validFeature, invalidFeature],
    })).toThrow(CommunityWaypointGeoJsonValidationError)
  })

  it('parses the GIS round-trip fixture and derives labels from public fields', () => {
    const fixture = JSON.parse(roundTripFixture) as unknown
    const parsed = parseCommunityWaypointsGeoJson(fixture)

    expect(parsed).toHaveLength(4)
    expect(parsed.map(({ id, category }) => [id, category])).toEqual([
      ['cw-550e8400-e29b-41d4-a716-446655440001', 'water_cooler'],
      ['cw-550e8400-e29b-41d4-a716-446655440002', 'atm'],
      ['cw-550e8400-e29b-41d4-a716-446655440003', 'toilet'],
      ['cw-550e8400-e29b-41d4-a716-446655440004', 'vending_machine'],
    ])
    expect(parsed[1]).toMatchObject({
      displayLabel: 'ATM',
      updatedAt: '2026-11-08',
      coordinate: { longitude: 103.7801, latitude: 1.2978 },
    })
    expect(parsed[0]?.displayLabel).toBe('Water cooler · Central Library · Floor 1')
    expect(parsed[0]?.details).toBe('Near the main entrance')
    expect(parsed[2]).toMatchObject({ floor: -1 })
    expect(parsed[2]?.displayLabel).toBe('Toilet · Basement 1')
    expect(parsed[3]?.displayLabel).toBe('Vending machine · Faculty Building · Ground floor')
    expect(parsed[3]?.details).toBe('Next to the service counter')
  })
})
