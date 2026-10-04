import { describe, expect, it } from 'vitest'
import { parseLtaPublicBusStopMapping } from './mapping'

describe('parseLtaPublicBusStopMapping', () => {
  it('normalizes valid service mappings', () => {
    expect(parseLtaPublicBusStopMapping({
      stops: [{ stopId: 'KRB', busStopCode: '16009', services: ['95', '10', '95'] }],
    })).toEqual([{ stopId: 'KRB', busStopCode: '16009', services: ['10', '95'] }])
  })

  it.each([
    { stopId: 'bad id', busStopCode: '16009', services: ['95'] },
    { stopId: 'KRB', busStopCode: '1609', services: ['95'] },
    { stopId: 'KRB', busStopCode: '16009', services: [] },
    { stopId: 'KRB', busStopCode: '16009', services: ['95!'] },
  ])('rejects invalid mapping %#', (stop) => {
    expect(() => parseLtaPublicBusStopMapping({ stops: [stop] })).toThrow()
  })

  it('rejects duplicate stop IDs', () => {
    expect(() => parseLtaPublicBusStopMapping({
      stops: [
        { stopId: 'KRB', busStopCode: '16009', services: ['95'] },
        { stopId: 'KRB', busStopCode: '16010', services: ['95'] },
      ],
    })).toThrow('Duplicate')
  })
})
