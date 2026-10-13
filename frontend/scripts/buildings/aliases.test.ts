import { describe, expect, it } from 'vitest'
import { BUILDING_ALIASES, validateAliases } from './aliases'

describe('building alias table', () => {
  it('is valid: non-empty prefixes and names, each prefix listed once', () => {
    expect(validateAliases(BUILDING_ALIASES)).toBe(BUILDING_ALIASES)
  })

  it('rejects blank entries and prefixes listed twice in any spelling', () => {
    expect(() => validateAliases([{ prefix: ' ', name: 'Central Library', evidence: 'x' }]))
      .toThrow('alias 1 prefix must be a non-empty string')
    expect(() => validateAliases([
      { prefix: 'CLB', name: 'Central Library', evidence: 'x' },
      { prefix: 'clb', name: 'Central Library Annexe', evidence: 'x' },
    ])).toThrow('prefix clb is listed more than once')
    expect(() => validateAliases([{ prefix: 'CLB', name: 'Central Library', evidence: '' }]))
      .toThrow('alias 1 evidence must be a non-empty string')
  })
})
