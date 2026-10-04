import { describe, expect, it } from 'vitest'
import { parseShuttleArrivalRefreshInterval } from './config.js'

describe('parseShuttleArrivalRefreshInterval', () => {
  it('uses the default when no override is configured', () => {
    expect(parseShuttleArrivalRefreshInterval({})).toBe(30_000)
  })

  it('accepts a positive integer millisecond override', () => {
    expect(parseShuttleArrivalRefreshInterval({ NUS_SHUTTLE_REFRESH_INTERVAL_MS: '45000' })).toBe(45_000)
  })

  it('rejects invalid overrides', () => {
    expect(() => parseShuttleArrivalRefreshInterval({ NUS_SHUTTLE_REFRESH_INTERVAL_MS: '0' }))
      .toThrow('NUS_SHUTTLE_REFRESH_INTERVAL_MS must be an integer of at least 1000 milliseconds')
    expect(() => parseShuttleArrivalRefreshInterval({ NUS_SHUTTLE_REFRESH_INTERVAL_MS: '45 seconds' }))
      .toThrow('NUS_SHUTTLE_REFRESH_INTERVAL_MS must be an integer of at least 1000 milliseconds')
  })
})
