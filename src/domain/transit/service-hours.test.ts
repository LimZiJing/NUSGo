import { describe, expect, it } from 'vitest'
import {
  describeShuttleServiceUnavailable,
  evaluateShuttleService,
  type ShuttleServiceWindow,
} from './service-hours'

const windows: ShuttleServiceWindow[] = [
  { routeId: 'D2', firstTime: '07:15', lastTime: '23:00', dayType: 'Mon-Fri', dates: [] },
  { routeId: 'D2', firstTime: '09:00', lastTime: '23:00', dayType: 'Sun', dates: [] },
]

describe('evaluateShuttleService', () => {
  it('uses Singapore local time during service', () => {
    const result = evaluateShuttleService(windows, new Date('2026-09-23T02:00:00.000Z'))

    expect(result).toEqual({ status: 'active', nextStartLabel: null })
  })

  it('reports the next start before service begins', () => {
    const result = evaluateShuttleService(windows, new Date('2026-09-23T22:30:00.000Z'))

    expect(result.status).toBe('before-start')
    expect(result.nextStartLabel).toBe('today at 7:15 AM')
  })

  it('reports tomorrow after the last bus', () => {
    const result = evaluateShuttleService(windows, new Date('2026-09-23T15:30:00.000Z'))

    expect(result.status).toBe('after-end')
    expect(result.nextStartLabel).toBe('tomorrow at 7:15 AM')
    expect(describeShuttleServiceUnavailable(result)).toContain('resumes tomorrow at 7:15 AM')
  })

  it('prefers a dated special-day window over the weekday window', () => {
    const result = evaluateShuttleService([
      ...windows,
      { routeId: 'D2', firstTime: '10:00', lastTime: '12:00', dayType: 'Special Day', dates: ['2026-09-23'] },
    ], new Date('2026-09-23T01:00:00.000Z'))

    expect(result.status).toBe('before-start')
    expect(result.nextStartLabel).toBe('today at 10:00 AM')
  })
})
