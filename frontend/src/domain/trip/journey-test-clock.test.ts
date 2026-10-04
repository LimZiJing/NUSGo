import { describe, expect, it } from 'vitest'
import {
  createTestShuttleWaitingTimeProvider,
  formatSingaporeDateTime,
  parseSingaporeDateTime,
} from './journey-test-clock'

describe('Singapore Journey test clock', () => {
  it('parses a Singapore date and time independently of the browser timezone', () => {
    expect(parseSingaporeDateTime('2026-09-23T07:15')).toBe(Date.parse('2026-09-22T23:15:00Z'))
    expect(formatSingaporeDateTime(Date.parse('2026-09-22T23:15:00Z'))).toBe('2026-09-23T07:15')
  })

  it.each(['', '2026-02-30T12:00', '2026-13-01T12:00', '2026-10-01T24:00', '2026-10-01T12:60'])('rejects an invalid value: %s', (value) => {
    expect(parseSingaporeDateTime(value)).toBeNull()
  })

  it('charges five minutes at each boarding and checks service at that boarding instant', () => {
    const wait = createTestShuttleWaitingTimeProvider(Date.parse('2026-09-23T14:50:00Z'), {
      A1: [{ routeId: 'A1', firstTime: '07:15', lastTime: '23:00', dayType: 'Mon-Fri', dates: [] }],
      B1: [{ routeId: 'B1', firstTime: '07:15', lastTime: '23:00', dayType: 'Mon-Fri', dates: [] }],
    })
    const record = {} as Parameters<typeof wait>[0]
    expect(wait(record, { routeId: 'A1', boardingStopId: 'STOP-A', elapsedSeconds: 0 })).toBe(300)
    expect(wait(record, { routeId: 'B1', boardingStopId: 'STOP-B', elapsedSeconds: 240 })).toBe(300)
    expect(wait(record, { routeId: 'B1', boardingStopId: 'STOP-B', elapsedSeconds: 600 })).toBeNull()
  })
})
