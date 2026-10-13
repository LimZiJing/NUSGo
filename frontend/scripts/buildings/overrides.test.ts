import { describe, expect, it } from 'vitest'
import { parseOverrides, parseUnlinkedPrefixes } from './overrides'

const KNOWN = new Set(['54619721', '140087398'])

describe('parseOverrides', () => {
  it('accepts the documented shape keyed by elementId', () => {
    const overrides = parseOverrides({
      version: 1,
      $comment: 'Hand-edited.',
      overrides: {
        54619721: {
          name: 'COM1 (Computing 1)',
          aliases: ['Computing 1'],
          roomCodePrefixes: ['COM1'],
          location: { x: 103.7739, y: 1.295 },
          groupKey: 'computing',
          $comment: 'Why this override exists.',
        },
      },
    }, KNOWN)

    expect(overrides['54619721']).toEqual({
      name: 'COM1 (Computing 1)',
      aliases: ['Computing 1'],
      roomCodePrefixes: ['COM1'],
      location: { x: 103.7739, y: 1.295 },
      groupKey: 'computing',
    })
    expect(parseOverrides({ version: 1, overrides: {} }, KNOWN)).toEqual({})
  })

  it('accepts a provisional OSM entrance and rejects malformed ones', () => {
    const entrance = { x: 103.7741, y: 1.2951, osmNode: '12345' }

    expect(parseOverrides({ version: 1, overrides: { 54619721: { entrance } } }, KNOWN)['54619721'])
      .toEqual({ entrance })
    expect(() => parseOverrides({
      version: 1,
      overrides: {
        54619721: { entrance: { x: 200, y: 1.2951, osmNode: '12345' } },
        140087398: { entrance: { x: 103.7741, y: 1.2951, osmNode: 'node/1' } },
      },
    }, KNOWN)).toThrow(/54619721 entrance.*140087398 entrance/)
    expect(() => parseOverrides({
      version: 1,
      overrides: { 54619721: { entrance, location: { x: 103.7739, y: 1.295 } } },
    }, KNOWN)).toThrow('54619721 cannot set both entrance and location')
  })

  it('reads prefixes that are deliberately left unlinked, with a reason each', () => {
    const file = { version: 1, overrides: {}, unlinkedPrefixes: { Y: 'Retired Yale-NUS code spread across several buildings.' } }

    expect(parseOverrides(file, KNOWN)).toEqual({})
    expect(parseUnlinkedPrefixes(file)).toEqual({ Y: 'Retired Yale-NUS code spread across several buildings.' })
    expect(parseUnlinkedPrefixes({ version: 1, overrides: {} })).toEqual({})
    expect(() => parseUnlinkedPrefixes({ version: 1, overrides: {}, unlinkedPrefixes: { Y: '', Z: 3 } }))
      .toThrow(/unlinkedPrefixes Y.*unlinkedPrefixes Z/)
    expect(() => parseUnlinkedPrefixes({ version: 1, overrides: {}, unlinkedPrefixes: [] }))
      .toThrow('unlinkedPrefixes must be an object')
  })

  it('fails on unknown elementIds, unknown fields and malformed values', () => {
    expect(() => parseOverrides({ version: 2, overrides: {} }, KNOWN)).toThrow('version must be 1')
    expect(() => parseOverrides({ version: 1, overrides: {}, extra: true }, KNOWN)).toThrow('unknown field extra')
    expect(() => parseOverrides({ version: 1, overrides: { 'way/9': {} } }, KNOWN))
      .toThrow('way/9 is not an elementId in the snapshot')
    expect(() => parseOverrides({ version: 1, overrides: { 54619721: { category: 'x' } } }, KNOWN))
      .toThrow('54619721 has unknown field category')
    expect(() => parseOverrides({
      version: 1,
      overrides: { 54619721: { name: '', aliases: 'COM 1', roomCodePrefixes: [''], location: { x: 200, y: 1 }, groupKey: 3 } },
    }, KNOWN)).toThrow(/name.*aliases.*roomCodePrefixes.*location.*groupKey/)
    expect(() => parseOverrides([], KNOWN)).toThrow('must be an object')
  })
})
