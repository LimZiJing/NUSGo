import { describe, expect, it } from 'vitest'
import { buildCatalogue } from './catalogue'
import { renderReport } from './report'
import type { ApiBuilding } from './snapshot'

const SOURCE = {
  name: 'Buildings: NUS Digital Twin (City Syntax Lab)',
  url: 'https://www.nus-digital-twin.com/api/v1/buildings',
  fetchedOn: '2026-10-13',
  licenceNote: 'Centroids, not entrances.',
}

function api(elementId: string, name: string, latitude: number, longitude: number): ApiBuilding {
  return { elementId, name, address: '1 Test Road', postal: '117417', latitude, longitude }
}

function report(apiBuildings: ApiBuilding[], venues: Record<string, { roomName: string, location?: { x: number, y: number } }>) {
  const aliases = [{ prefix: 'CLB', name: 'Central Library', evidence: 'Room name "Central Library Seminar Room".' }]
  const result = buildCatalogue({ apiBuildings, venues, aliases, overrides: {}, source: SOURCE })
  return renderReport(result, { snapshotFile: 'buildings-raw-2026-10-13.json', aliases })
}

describe('renderReport', () => {
  it('gives counts, links and an empty needs-review section for a clean fixture', () => {
    const markdown = report(
      [api('1', 'COM1', 1.29502, 103.77391), api('2', 'Central Library', 1.29662, 103.77308)],
      {
        'COM1-0201': { roomName: 'Seminar Room 1', location: { x: 103.77391, y: 1.29502 } },
        'CLB-04-01H': { roomName: 'Seminar Room', location: { x: 103.77323, y: 1.29672 } },
      },
    )

    expect(markdown).toContain('fetched on 13/10/2026')
    expect(markdown).toContain('unverified OpenStreetMap entrance')
    expect(markdown).toContain('| API records | 2 |\n| Buildings written | 2 |\n| Rooms linked | 2 |\n| Rooms unlinked | 0 |')
    expect(markdown).toContain('| CLB | Central Library (`central-library`) | alias | 1 | Room name "Central Library Seminar Room". |')
    expect(markdown).toMatch(/## Needs review\n\nNothing needs review\.\n/)
    expect(markdown.endsWith('\n')).toBe(true)
  })

  it('lists unmatched prefixes, buildings without rooms, ambiguity and repeated names', () => {
    const markdown = report(
      [
        api('10', 'Sheares Hall', 1.29137, 103.77610),
        api('11', 'Sheares Hall', 1.29140, 103.77601),
        api('20', 'Institute of Systems Science', 1.29205, 103.77658),
      ],
      {
        Pinnacle: { roomName: 'Pinnacle', location: { x: 103.77651, y: 1.29207 } },
        'SH-SR1': { roomName: 'Sheares Hall Seminar Room', location: { x: 103.77543, y: 1.29139 } },
      },
    )

    expect(markdown).toContain('- SH (name rule): `sheares-hall-1`, `sheares-hall-2`')
    expect(markdown).toContain('| Pinnacle | 1 | | Institute of Systems Science (`institute-of-systems-science`), 8 m |')
    expect(markdown).toContain('3 of 3 API buildings have no linked rooms')
    expect(markdown).toContain('| Sheares Hall | `sheares-hall` | 2 | 1 Test Road |')
    expect(markdown).toContain('| Pinnacle | no room structure |')
    expect(markdown).toContain('- Ambiguous match for SH; pick a record with an override.')
    expect(markdown).toContain('- 2 room prefixes have no building')
    expect(markdown).toContain('- Alias CLB: no room code uses this prefix')
  })

  it('is deterministic', () => {
    const args = [[api('1', 'COM1', 1.29502, 103.77391)], { 'COM1-1': { roomName: 'Room' } }] as const
    expect(report([...args[0]], args[1])).toBe(report([...args[0]], args[1]))
  })
})
