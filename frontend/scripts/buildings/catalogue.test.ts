import { describe, expect, it } from 'vitest'
import type { VenueLocationMap } from '@nusgo/shared/venue/types'
import { buildCatalogue, type BuildCatalogueInput } from './catalogue'
import type { ApiBuilding } from './snapshot'

const SOURCE = {
  name: 'Buildings: NUS Digital Twin (City Syntax Lab)',
  url: 'https://www.nus-digital-twin.com/api/v1/buildings',
  fetchedOn: '2026-10-13',
  licenceNote: 'Centroids, not entrances.',
}

function api(elementId: string, name: string, latitude: number, longitude: number, extra: Partial<ApiBuilding> = {}): ApiBuilding {
  return { elementId, name, address: '1 Test Road', postal: '117417', latitude, longitude, ...extra }
}

function room(roomName: string, latitude: number, longitude: number) {
  return { roomName, floor: 1, location: { x: longitude, y: latitude } }
}

function build(overrides: Partial<BuildCatalogueInput>) {
  return buildCatalogue({
    apiBuildings: [],
    venues: {},
    aliases: [],
    overrides: {},
    source: SOURCE,
    ...overrides,
  })
}

function prefixesById(result: ReturnType<typeof buildCatalogue>) {
  return Object.fromEntries(result.catalogue.buildings.map((building) => [building.id, building.roomCodePrefixes]))
}

describe('buildCatalogue rule chain', () => {
  it('links room prefixes by exact code, "Code - Name" form and parenthetical codes', () => {
    const result = build({
      apiBuildings: [
        api('1', 'COM1', 1.2950, 103.7739),
        api('2', 'LT 1', 1.2995, 103.7713),
        api('3', 'BIZ 1 - Mochtar Riady Building', 1.2925, 103.7741),
        api('4', 'Lee Wee Kheng Building (S1A/LT 32)', 1.2961, 103.7783),
      ],
      venues: {
        'COM1-0201': room('Seminar Room 1', 1.2950, 103.7739),
        LT1: room('Lecture Theatre 1', 1.2995, 103.7713),
        'BIZ1-0301': room('Seminar Room', 1.2925, 103.7741),
        'S1A-0217': room('Lab', 1.2961, 103.7783),
        'LT32-01': room('Lecture Theatre 32', 1.2961, 103.7783),
      } satisfies VenueLocationMap,
    })

    expect(prefixesById(result)).toEqual({
      'biz-1-mochtar-riady-building': ['BIZ1'],
      com1: ['COM1'],
      'lee-wee-kheng-building-s1a-lt-32': ['LT32', 'S1A'],
      'lt-1': ['LT1'],
    })
    expect(result.findings.links.map((link) => [link.prefix, link.rule])).toEqual([
      ['BIZ1', 'code'], ['COM1', 'code'], ['LT1', 'code'], ['LT32', 'code'], ['S1A', 'code'],
    ])
    expect(result.findings.counts).toEqual({ apiRecords: 4, buildingsWritten: 4, roomsLinked: 5, roomsUnlinked: 0 })
  })

  it('keeps every repeated API name as its own building with a shared groupKey and deterministic ids', () => {
    const result = build({
      apiBuildings: [
        api('732229053', 'Cendana College', 1.30814, 103.77248),
        api('732229037', 'Cendana College', 1.30812, 103.77221),
        api('15347235', 'AS6', 1.29557, 103.77322),
      ],
    })

    expect(result.catalogue.buildings.map(({ id, elementId, groupKey }) => ({ id, elementId, groupKey }))).toEqual([
      { id: 'as6', elementId: '15347235', groupKey: undefined },
      { id: 'cendana-college-1', elementId: '732229037', groupKey: 'cendana-college' },
      { id: 'cendana-college-2', elementId: '732229053', groupKey: 'cendana-college' },
    ])
    expect('groupKey' in result.catalogue.buildings[0]).toBe(false)
    expect(result.findings.repeatedNames).toEqual([{
      name: 'Cendana College',
      groupKey: 'cendana-college',
      buildingIds: ['cendana-college-1', 'cendana-college-2'],
      addresses: ['1 Test Road'],
    }])
  })

  it('maps API fields to a centroid location, adds code aliases for search and omits malformed postals', () => {
    const result = build({
      apiBuildings: [
        api('54619721', 'COM1', 1.29502, 103.77391, { address: '13 Computing Drive', postal: '117417' }),
        api('141905556', 'Lee Wee Kheng Building (S1A/LT 32)', 1.29606, 103.77833),
        api('455250296', 'Kent Ridge Hall Block D', 1.29154, 103.77437, { postal: '1196187' }),
      ],
    })
    const [com1, block, lwk] = result.catalogue.buildings

    expect(com1).toEqual({
      id: 'com1',
      name: 'COM1',
      aliases: ['COM 1'],
      elementId: '54619721',
      address: '13 Computing Drive',
      postal: '117417',
      location: { x: 103.77391, y: 1.29502 },
      locationKind: 'centroid',
      roomCodePrefixes: [],
      sourceRefs: [{ source: 'nus-digital-twin', elementId: '54619721' }],
    })
    expect(Object.keys(com1)).toEqual([
      'id', 'name', 'aliases', 'elementId', 'address', 'postal', 'location', 'locationKind', 'roomCodePrefixes', 'sourceRefs',
    ])
    expect(lwk.aliases).toEqual(['LT 32', 'LT32', 'Lee Wee Kheng Building', 'S1A'])
    expect('postal' in block).toBe(false)
    expect(result.findings.dataIssues).toEqual([
      'Kent Ridge Hall Block D (455250296): postal "1196187" is not a 6-digit code, so it was omitted',
    ])
  })

  it('links curated abbreviations through the alias table and adds them to search aliases', () => {
    const result = build({
      apiBuildings: [api('54583490', 'Central Library', 1.29662, 103.77308)],
      venues: { 'CLB-04-01H': room('Seminar Room', 1.29672, 103.77323) },
      aliases: [{ prefix: 'CLB', name: 'Central Library', evidence: 'x' }],
    })

    expect(result.catalogue.buildings[0]).toMatchObject({ roomCodePrefixes: ['CLB'], aliases: ['CLB'] })
    expect(result.findings.links).toEqual([{ prefix: 'CLB', buildingId: 'central-library', rule: 'alias', roomCount: 1 }])
  })

  it('links by a unique normalised building name at the start of room names, preferring the longest name', () => {
    const result = build({
      apiBuildings: [
        api('1', 'Temasek Hall', 1.29270, 103.77138),
        api('2', 'Temasek Hall Block A', 1.29304, 103.77079),
        api('3', 'Town Plaza', 1.30390, 103.77398),
      ],
      venues: {
        'TH-SR1': room('Temasek Hall Office, Seminar Room', 1.29272, 103.77129),
        'TP-SR1': room('Town Plaza Seminar Room 1', 1.30401, 103.77344),
        'TP-GLR': room('Global Learning Room', 1.30401, 103.77344),
        'THA-1': room('Temasek Hall Block A Lounge', 1.29304, 103.77079),
      },
    })

    expect(result.findings.links.map((link) => [link.prefix, link.buildingId, link.rule, link.roomCount])).toEqual([
      ['TH', 'temasek-hall', 'name', 1],
      ['THA', 'temasek-hall-block-a', 'name', 1],
      ['TP', 'town-plaza', 'name', 2],
    ])
  })

  it('does not name-match code-only or single-word building names such as SDE2 and Create', () => {
    const result = build({
      apiBuildings: [api('1', 'SDE2', 1.29728, 103.77113), api('2', 'Create', 1.30418, 103.77437)],
      venues: {
        'WT-Lab': room('SDE2-02-10 (Wind Tunnel Unit)', 1.29721, 103.77112),
        'UT22-07-02': room('CREATE SDE studio', 1.30373, 103.77355),
      },
    })

    expect(result.findings.links).toEqual([])
    expect(result.findings.unlinkedPrefixes.map((entry) => entry.prefix)).toEqual(['UT22', 'WT'])
  })

  it('notes unlinked prefixes that look like a building code followed by a room code', () => {
    const result = build({
      apiBuildings: [api('1', 'COM4', 1.29513, 103.77538), api('2', 'LT 3', 1.29767, 103.77333)],
      venues: {
        COM4SR31: { roomName: 'Seminar Room 31' },
        'LT35-01-01': { roomName: 'LT35' },
        'CQT/SR0315': { roomName: 'CQT Seminar Room' },
      },
    })

    expect(result.findings.unlinkedPrefixes).toEqual([
      { prefix: 'COM4SR31', roomCount: 1, note: 'begins with building code COM4; probably a room code' },
      { prefix: 'CQT/SR0315', roomCount: 1, note: 'contains characters that are not used in building codes' },
      { prefix: 'LT35', roomCount: 1 },
    ])
  })

  it('reports and does not link ambiguous codes, aliases and names', () => {
    const result = build({
      apiBuildings: [
        api('10', 'Sheares Hall', 1.29137, 103.77610),
        api('11', 'Sheares Hall', 1.29140, 103.77601),
        api('20', 'Saga College', 1.30590, 103.77206),
        api('21', 'Saga College', 1.30585, 103.77179),
        api('30', 'MPSH 1', 1.30076, 103.77603),
        api('31', 'MPSH 1 - Sports Hall', 1.30076, 103.77603),
      ],
      venues: {
        'SH-SR1': room('Seminar Room', 1.29139, 103.77543),
        'Y-CR3': room('Saga College - Classroom 3', 1.30700, 103.77239),
        'MPSH1-01': room('Hall', 1.30076, 103.77603),
      },
      aliases: [{ prefix: 'SH', name: 'Sheares Hall', evidence: 'x' }],
    })

    expect(result.findings.links).toEqual([])
    expect(result.findings.ambiguous).toEqual([
      { prefix: 'MPSH1', rule: 'code', buildingIds: ['mpsh-1', 'mpsh-1-sports-hall'] },
      { prefix: 'SH', rule: 'alias', buildingIds: ['sheares-hall-1', 'sheares-hall-2'] },
      { prefix: 'Y', rule: 'name', buildingIds: ['saga-college-1', 'saga-college-2'] },
    ])
    expect(result.catalogue.buildings.every((building) => building.roomCodePrefixes.length === 0)).toBe(true)
  })

  it('never links by proximity alone, but reports the nearest building as a hint', () => {
    const result = build({
      apiBuildings: [api('4548824', 'Institute of Systems Science', 1.29205, 103.77658)],
      venues: { Pinnacle: room('Pinnacle', 1.29207, 103.77651) },
    })

    expect(result.findings.links).toEqual([])
    expect(result.findings.unlinkedPrefixes).toEqual([{
      prefix: 'Pinnacle',
      roomCount: 1,
      nearest: { buildingId: 'institute-of-systems-science', metres: 8 },
    }])
    expect(result.findings.counts).toMatchObject({ roomsLinked: 0, roomsUnlinked: 1 })
  })

  it('warns when a matched building is more than 150 m from the median of the rooms it claims', () => {
    const result = build({
      apiBuildings: [
        api('1', 'Innovation 4.0', 1.29458, 103.77569),
        api('2', 'COM2', 1.29397, 103.77413),
      ],
      venues: {
        'I4-01-03': room('Prairie', 1.29661, 103.77320),
        'COM2-0108': room('Seminar Room', 1.29400, 103.77420),
      },
      aliases: [{ prefix: 'I4', name: 'Innovation 4.0', evidence: 'x' }],
    })

    expect(result.findings.links.map((link) => link.prefix)).toEqual(['COM2', 'I4'])
    expect(result.findings.distanceWarnings).toEqual([{ prefix: 'I4', buildingId: 'innovation-4-0', metres: 357 }])
  })

  it('lets overrides win over the API, the code rule and the alias table', () => {
    const result = build({
      apiBuildings: [
        api('54583490', 'Central Library', 1.29662, 103.77308),
        api('140087398', 'Central Library Annexe', 1.29692, 103.77378),
        api('54619721', 'COM1', 1.29502, 103.77391),
      ],
      venues: {
        'CLB-04-01H': room('Seminar Room', 1.29672, 103.77323),
        'COM1-0201': room('Seminar Room 1', 1.29502, 103.77391),
      },
      aliases: [{ prefix: 'CLB', name: 'Central Library', evidence: 'x' }],
      overrides: {
        140087398: {
          name: 'Central Library Annex',
          aliases: ['CLB Annexe'],
          roomCodePrefixes: ['CLB'],
          location: { x: 103.7737, y: 1.2969 },
          groupKey: 'central-library',
        },
        54619721: { roomCodePrefixes: [] },
      },
    })
    const annexe = result.catalogue.buildings.find((building) => building.elementId === '140087398')

    expect(annexe).toEqual({
      id: 'central-library-annexe',
      name: 'Central Library Annex',
      aliases: ['CLB Annexe'],
      elementId: '140087398',
      groupKey: 'central-library',
      address: '1 Test Road',
      postal: '117417',
      location: { x: 103.7737, y: 1.2969 },
      roomCodePrefixes: ['CLB'],
      sourceRefs: [{ source: 'nus-digital-twin', elementId: '140087398' }],
    })
    expect(prefixesById(result)).toEqual({ 'central-library': [], 'central-library-annexe': ['CLB'], com1: [] })
    expect(result.findings.links).toEqual([
      { prefix: 'CLB', buildingId: 'central-library-annexe', rule: 'override', roomCount: 1 },
    ])
    expect(result.findings.unlinkedPrefixes.map((entry) => entry.prefix)).toEqual(['COM1'])
  })

  it('uses a provisional OSM entrance in place of the centroid and records its source', () => {
    const result = build({
      apiBuildings: [api('54619721', 'COM1', 1.29502, 103.77391)],
      venues: {},
      aliases: [],
      overrides: { 54619721: { entrance: { x: 103.7741, y: 1.2951, osmNode: '12345' } } },
    })

    expect(result.catalogue.buildings[0]).toMatchObject({
      location: { x: 103.7741, y: 1.2951 },
      locationKind: 'provisional-entrance',
      sourceRefs: [
        { source: 'nus-digital-twin', elementId: '54619721' },
        { source: 'openstreetmap', elementId: 'node/12345' },
      ],
    })
  })

  it('carries part labels, blocks and entrance roles from overrides onto the building, and omits them otherwise', () => {
    const result = build({
      apiBuildings: [
        api('10', 'Saga College Block 15', 1.2950, 103.7739),
        api('11', 'Saga College Block 18', 1.2951, 103.7740),
        api('12', 'Saga College Main Entrance', 1.2952, 103.7741),
        api('13', 'Cendana College', 1.2960, 103.7750),
      ],
      overrides: {
        10: { groupKey: 'saga', partLabel: 'Blocks 15-17', blocks: ['15', '16', '17'] },
        11: { groupKey: 'saga', partLabel: 'Blocks 18-20', blocks: ['18'] },
        12: { groupKey: 'saga', groupRole: 'entrance' },
      },
    })

    const byId = Object.fromEntries(result.catalogue.buildings.map((building) => [building.id, building]))
    expect(byId['saga-college-block-15']).toMatchObject({
      groupKey: 'saga',
      partLabel: 'Blocks 15-17',
      blocks: ['15', '16', '17'],
    })
    expect(byId['saga-college-block-18']).toMatchObject({ partLabel: 'Blocks 18-20', blocks: ['18'] })
    expect(byId['saga-college-main-entrance']).toMatchObject({ groupKey: 'saga', groupRole: 'entrance' })
    expect(byId['saga-college-main-entrance']).not.toHaveProperty('partLabel')
    expect(byId['saga-college-main-entrance']).not.toHaveProperty('blocks')
    expect(byId['cendana-college']).not.toHaveProperty('partLabel')
    expect(byId['cendana-college']).not.toHaveProperty('blocks')
    expect(byId['cendana-college']).not.toHaveProperty('groupRole')
  })

  it('carries block locations from overrides onto the building, and omits them otherwise', () => {
    const blockLocations = { 15: { x: 103.7739, y: 1.295 } }
    const result = build({
      apiBuildings: [
        api('10', 'Saga College Block 15', 1.2950, 103.7739),
        api('11', 'Saga College Block 18', 1.2951, 103.7740),
      ],
      overrides: {
        10: { groupKey: 'saga', partLabel: 'Blocks 15-17', blocks: ['15', '16', '17'], blockLocations },
        11: { groupKey: 'saga', partLabel: 'Blocks 18-20', blocks: ['18'] },
      },
    })

    const byId = Object.fromEntries(result.catalogue.buildings.map((building) => [building.id, building]))
    expect(byId['saga-college-block-15']).toMatchObject({ blocks: ['15', '16', '17'], blockLocations })
    expect(byId['saga-college-block-18']).not.toHaveProperty('blockLocations')
  })

  it('reports a deliberately unlinked prefix with its reason and no nearest-building hint', () => {
    const result = build({
      apiBuildings: [api('1', 'Elm College', 1.30654, 103.77214)],
      venues: { 'Y-CR11': room('Elm College - Classroom 11', 1.30644, 103.7723) },
      intentionallyUnlinked: { y: 'Retired Yale-NUS code spread across several buildings.' },
    })

    expect(result.findings.unlinkedPrefixes).toEqual([
      { prefix: 'Y', roomCount: 1, note: 'Left unlinked on purpose: Retired Yale-NUS code spread across several buildings.' },
    ])
    expect(result.findings.counts.roomsUnlinked).toBe(1)
  })

  it('folds a mergeInto record into its survivor: no building, its name becomes an alias, other ids unchanged', () => {
    const result = build({
      apiBuildings: [
        api('300', 'Cendana College', 1.30814, 103.77248),
        api('100', 'Cendana Block', 1.30812, 103.77221),
        api('15347235', 'AS6', 1.29557, 103.77322),
      ],
      overrides: { 100: { mergeInto: '300' } },
    })

    expect(result.catalogue.buildings.map(({ id, elementId, aliases }) => ({ id, elementId, aliases }))).toEqual([
      { id: 'as6', elementId: '15347235', aliases: ['AS 6'] },
      { id: 'cendana-college', elementId: '300', aliases: ['Cendana Block'] },
    ])
    expect(result.findings.merged).toEqual([{ name: 'Cendana Block', elementId: '100', buildingId: 'cendana-college' }])
    expect(result.findings.counts).toMatchObject({ apiRecords: 3, buildingsWritten: 2 })
  })

  it('appends merged names to overridden aliases and drops same-name grouping for the survivor', () => {
    const result = build({
      apiBuildings: [
        api('732229053', 'Cendana College', 1.30814, 103.77248),
        api('732229037', 'Cendana College', 1.30812, 103.77221),
        api('5', 'Cendana Block', 1.3, 103.7),
      ],
      overrides: {
        732229053: { aliases: ['Cendana Hall'] },
        732229037: { mergeInto: '732229053' },
        5: { mergeInto: '732229053' },
      },
    })

    expect(result.catalogue.buildings).toEqual([
      expect.objectContaining({
        id: 'cendana-college-2',
        elementId: '732229053',
        aliases: ['Cendana Block', 'Cendana Hall'],
      }),
    ])
    expect('groupKey' in result.catalogue.buildings[0]).toBe(false)
    expect(result.findings.repeatedNames).toEqual([])
    expect(result.findings.merged).toEqual([
      { name: 'Cendana Block', elementId: '5', buildingId: 'cendana-college-2' },
      { name: 'Cendana College', elementId: '732229037', buildingId: 'cendana-college-2' },
    ])
  })

  it('produces identical output for the same input', () => {
    const input = {
      apiBuildings: [api('2', 'COM2', 1.29397, 103.77413), api('1', 'COM1', 1.29502, 103.77391)],
      venues: { 'COM2-0108': room('Seminar Room', 1.29400, 103.77420) },
    }

    expect(JSON.stringify(build(input))).toBe(JSON.stringify(build({ ...input, apiBuildings: [...input.apiBuildings].reverse() })))
  })

  it('reports alias entries that name no API building or match no room prefix', () => {
    const result = build({
      apiBuildings: [api('1', 'Sheares Hall', 1.29137, 103.77610), api('2', 'Sheares Hall', 1.29140, 103.77601)],
      venues: { 'SH-SR1': room('Seminar Room', 1.29139, 103.77543) },
      aliases: [
        { prefix: 'SH', name: 'Sheares Hall', evidence: 'x' },
        { prefix: 'GONE', name: 'Sheares Hall', evidence: 'x' },
        { prefix: 'SH2', name: 'Renamed Hall', evidence: 'x' },
      ],
    })

    expect(result.findings.staleAliases).toEqual([
      'GONE: no room code uses this prefix',
      'SH2: no room code uses this prefix',
      'SH2: "Renamed Hall" is not an API building name',
    ])
  })
})
