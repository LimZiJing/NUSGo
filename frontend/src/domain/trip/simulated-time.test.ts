import { describe, expect, it } from 'vitest'
import { formatSingaporeDateTime, parseSingaporeDateTime } from './simulated-time'

describe('Singapore Journey test clock', () => {
  it('parses a Singapore date and time independently of the browser timezone', () => {
    expect(parseSingaporeDateTime('2026-09-23T07:15')).toBe(Date.parse('2026-09-22T23:15:00Z'))
    expect(formatSingaporeDateTime(Date.parse('2026-09-22T23:15:00Z'))).toBe('2026-09-23T07:15')
  })

  it.each(['', '2026-02-30T12:00', '2026-13-01T12:00', '2026-10-01T24:00', '2026-10-01T12:60'])('rejects an invalid value: %s', (value) => {
    expect(parseSingaporeDateTime(value)).toBeNull()
  })

})
