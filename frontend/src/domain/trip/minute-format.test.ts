import { describe, expect, it } from 'vitest'
import { formatMinutes } from './minute-format'

describe('minute format', () => {
  it('formats Stop timing minutes using the selected display choice', () => {
    expect(formatMinutes(12)).toBe('12′')
    expect(formatMinutes(12, 'm')).toBe('12m')
    expect(formatMinutes(12, 'min')).toBe('12 min')
  })
})
