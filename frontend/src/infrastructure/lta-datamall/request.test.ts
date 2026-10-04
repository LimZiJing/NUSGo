import { describe, expect, it } from 'vitest'
import { parseRequestedLtaStops } from './request'

const mappings = [
  { stopId: 'KRB', busStopCode: '16009', services: ['95'] },
  { stopId: 'KR-MRT', busStopCode: '18331', services: ['95'] },
]

describe('parseRequestedLtaStops', () => {
  it('accepts stop request objects and removes duplicates', () => {
    expect(parseRequestedLtaStops(JSON.stringify([{ stopId: 'KRB' }, { stopId: 'KRB' }]), mappings)).toEqual([mappings[0]])
  })

  it('rejects unknown stops', () => {
    expect(() => parseRequestedLtaStops(JSON.stringify(['UNKNOWN']), mappings)).toThrow('Unknown')
  })
})
