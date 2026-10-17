import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseNusServiceWindows } from './service-windows.ts'

describe('NUS service-window response parsing', () => {
  it('normalizes valid windows and rejects malformed response envelopes', () => {
    assert.deepEqual(parseNusServiceWindows({
      data: {
        RouteMinMaxTime: [
          { FirstTime: '06:00', LastTime: '23:00', DayType: 'Daily', Dates: '2026-10-15, invalid' },
          { FirstTime: '', LastTime: '23:00', DayType: 'Daily' },
        ],
      },
    }, 'D1'), [{
      routeId: 'D1',
      firstTime: '06:00',
      lastTime: '23:00',
      dayType: 'Daily',
      dates: ['2026-10-15'],
    }])
    assert.throws(() => parseNusServiceWindows({ data: {} }, 'D1'), /response was invalid/)
  })
})
