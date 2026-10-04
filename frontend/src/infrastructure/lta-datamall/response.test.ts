import { describe, expect, it } from 'vitest'
import { parseLtaBusArrivalResponse } from './response'

describe('parseLtaBusArrivalResponse', () => {
  it('normalizes the three LTA arrival fields', () => {
    expect(parseLtaBusArrivalResponse({
      Services: [{
        ServiceNo: '95',
        NextBus: { EstimatedArrival: '2026-10-03T10:00:00+08:00', Monitored: 1 },
        NextBus2: { EstimatedArrival: '2026-10-03T10:08:00+08:00', Monitored: 1 },
        NextBus3: { EstimatedArrival: '2026-10-03T10:20:00+08:00', Monitored: 0 },
      }],
    }, ['95'])).toEqual([{
      serviceNumber: '95',
      arrivals: [
        { estimatedAt: '2026-10-03T10:00:00+08:00', monitored: true },
        { estimatedAt: '2026-10-03T10:08:00+08:00', monitored: true },
        { estimatedAt: '2026-10-03T10:20:00+08:00', monitored: false },
      ],
    }])
  })

  it('accepts blank estimates and ignores services outside the mapping', () => {
    expect(parseLtaBusArrivalResponse({
      Services: [
        { ServiceNo: '95', NextBus: { EstimatedArrival: '', Monitored: 0 } },
        { ServiceNo: '10', NextBus: { EstimatedArrival: '2026-10-03T10:00:00+08:00', Monitored: 1 } },
      ],
    }, ['95'])).toEqual([{ serviceNumber: '95', arrivals: [] }])
  })

  it('rejects malformed estimates', () => {
    expect(() => parseLtaBusArrivalResponse({
      Services: [{
        ServiceNo: '95',
        NextBus: { EstimatedArrival: 'soon', Monitored: 1 },
      }],
    }, ['95'])).toThrow('estimated arrival')
  })
})
