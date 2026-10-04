import { describe, expect, it } from 'vitest'
import { isLtaServiceOperating, parseLtaServiceSchedule } from './schedule'

const schedule = parseLtaServiceSchedule({
  ServiceNo: '95',
  BusStopCode: '18331',
  WD_FirstBus: '0530',
  WD_LastBus: '2400',
  SAT_FirstBus: '0600',
  SAT_LastBus: '2300',
  SUN_FirstBus: '0700',
  SUN_LastBus: '2300',
})!

describe('LTA service schedules', () => {
  it('parses schedule windows', () => {
    expect(schedule.weekday).toEqual({ firstBus: '0530', lastBus: '2400' })
  })

  it('uses Singapore local time and handles 2400', () => {
    expect(isLtaServiceOperating(schedule, Date.parse('2026-10-05T15:00:00Z'))).toBe(true)
    expect(isLtaServiceOperating(schedule, Date.parse('2026-10-05T17:00:00Z'))).toBe(false)
  })

  it('handles an after-midnight window from the previous service day', () => {
    const overnight = parseLtaServiceSchedule({
      ServiceNo: '95',
      BusStopCode: '18331',
      WD_FirstBus: '2300',
      WD_LastBus: '0030',
      SAT_FirstBus: '2300',
      SAT_LastBus: '0030',
      SUN_FirstBus: '2300',
      SUN_LastBus: '0030',
    })!
    expect(isLtaServiceOperating(overnight, Date.parse('2026-10-05T16:15:00Z'))).toBe(true)
    expect(isLtaServiceOperating(overnight, Date.parse('2026-10-05T17:00:00Z'))).toBe(false)
  })
})
