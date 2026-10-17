import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createLtaScheduleLoader, isLtaServiceOperating, parseLtaServiceSchedule } from './service-schedules.ts'

const mappings = [{ stopId: 'STOP-A', busStopCode: '12345', services: ['95'] }]

describe('LTA service schedules', () => {
  it('parses route operating windows', () => {
    const schedule = parseLtaServiceSchedule({
      ServiceNo: '95',
      BusStopCode: '12345',
      WD_FirstBus: '0530',
      WD_LastBus: '2400',
      SAT_FirstBus: '0600',
      SAT_LastBus: '2300',
      SUN_FirstBus: '0700',
      SUN_LastBus: '2300',
    })

    assert.deepEqual(schedule?.weekday, { firstBus: '0530', lastBus: '2400' })
    assert.equal(schedule ? isLtaServiceOperating(schedule, Date.parse('2026-10-05T15:00:00Z')) : false, true)
    assert.equal(schedule ? isLtaServiceOperating(schedule, Date.parse('2026-10-05T17:00:00Z')) : true, false)
  })

  it('handles an after-midnight window that belongs to the previous service day', () => {
    const schedule = parseLtaServiceSchedule({
      ServiceNo: '95',
      BusStopCode: '12345',
      WD_FirstBus: '2300',
      WD_LastBus: '0030',
      SAT_FirstBus: '2300',
      SAT_LastBus: '0030',
      SUN_FirstBus: '2300',
      SUN_LastBus: '0030',
    })

    assert.ok(schedule)
    assert.equal(isLtaServiceOperating(schedule, Date.parse('2026-10-05T16:15:00Z')), true)
    assert.equal(isLtaServiceOperating(schedule, Date.parse('2026-10-05T17:00:00Z')), false)
  })

  it('loads checked mappings once and limits schedule rows to mapped service-stop pairs', async () => {
    let calls = 0
    const loader = createLtaScheduleLoader({
      mappings,
      accountKey: 'test-account-key',
      fetcher: async (input, init) => {
        calls += 1
        assert.equal(input, 'https://datamall2.mytransport.sg/ltaodataservice/v3/BusRoutes?$skip=0')
        assert.deepEqual(init?.headers, { Accept: 'application/json', AccountKey: 'test-account-key' })
        return new Response(JSON.stringify({
          value: [
            {
              ServiceNo: '95',
              BusStopCode: '12345',
              WD_FirstBus: '0530',
              WD_LastBus: '2400',
              SAT_FirstBus: '0600',
              SAT_LastBus: '2300',
              SUN_FirstBus: '0700',
              SUN_LastBus: '2300',
            },
            {
              ServiceNo: '95',
              BusStopCode: '99999',
              WD_FirstBus: '0000',
              WD_LastBus: '2400',
            },
          ],
        }))
      },
    })
    const signal = new AbortController().signal

    assert.equal(await loader('95', '12345', Date.parse('2026-10-05T15:00:00Z'), signal), true)
    assert.equal(await loader('95', '12345', Date.parse('2026-10-05T17:00:00Z'), signal), false)
    assert.equal(await loader('96', '12345', Date.parse('2026-10-05T15:00:00Z'), signal), null)
    assert.equal(calls, 1)
  })
})
