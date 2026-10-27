import { describe, expect, it } from 'vitest'
import { parseApiShuttleVehiclesResponse } from './live-vehicles-validation.ts'

const observedAt = '2026-10-27T08:00:00.000Z'
const expiresAt = '2026-10-27T08:00:30.000Z'

function vehicle(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    routeId: 'A1',
    plate: 'SBS1234X',
    lat: 1.2966,
    lng: 103.7764,
    headingDegrees: 90,
    speed: 12.5,
    load: 'medium',
    observedAt,
    expiresAt,
    ...overrides,
  }
}

function response(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { observedAt, expiresAt, vehicles: [vehicle()], ...overrides }
}

describe('parseApiShuttleVehiclesResponse', () => {
  it('accepts a valid response without unavailableRouteIds', () => {
    expect(parseApiShuttleVehiclesResponse(response())).toEqual({
      observedAt,
      expiresAt,
      vehicles: [vehicle()],
    })
  })

  it('accepts a valid response with unavailableRouteIds', () => {
    expect(parseApiShuttleVehiclesResponse(response({ unavailableRouteIds: ['A2', 'B1'] }))).toEqual({
      observedAt,
      expiresAt,
      vehicles: [vehicle()],
      unavailableRouteIds: ['A2', 'B1'],
    })
  })

  it('accepts an empty vehicles list', () => {
    expect(parseApiShuttleVehiclesResponse(response({ vehicles: [] }))).toEqual({
      observedAt,
      expiresAt,
      vehicles: [],
    })
  })

  it('strips unknown fields', () => {
    const parsed = parseApiShuttleVehiclesResponse(response({ extra: true, vehicles: [vehicle({ extra: 1 })] }))
    expect(parsed).toEqual({ observedAt, expiresAt, vehicles: [vehicle()] })
  })

  it('rejects a non-object', () => {
    expect(parseApiShuttleVehiclesResponse('not a response')).toBeNull()
    expect(parseApiShuttleVehiclesResponse([])).toBeNull()
    expect(parseApiShuttleVehiclesResponse(null)).toBeNull()
  })

  it('rejects an invalid date', () => {
    expect(parseApiShuttleVehiclesResponse(response({ observedAt: 'yesterday' }))).toBeNull()
  })

  it('rejects a latitude out of range', () => {
    expect(parseApiShuttleVehiclesResponse(response({ vehicles: [vehicle({ lat: 90.5 })] }))).toBeNull()
  })

  it('rejects a heading of 361 degrees', () => {
    expect(parseApiShuttleVehiclesResponse(response({ vehicles: [vehicle({ headingDegrees: 361 })] }))).toBeNull()
  })

  it('rejects a negative speed', () => {
    expect(parseApiShuttleVehiclesResponse(response({ vehicles: [vehicle({ speed: -1 })] }))).toBeNull()
  })

  it('rejects an unknown load level', () => {
    expect(parseApiShuttleVehiclesResponse(response({ vehicles: [vehicle({ load: 'crowded' })] }))).toBeNull()
  })

  it('rejects a missing plate', () => {
    const withoutPlate = vehicle()
    delete withoutPlate.plate
    expect(parseApiShuttleVehiclesResponse(response({ vehicles: [withoutPlate] }))).toBeNull()
  })

  it('rejects a whitespace-only route ID or plate', () => {
    expect(parseApiShuttleVehiclesResponse(response({ vehicles: [vehicle({ routeId: '   ' })] }))).toBeNull()
    expect(parseApiShuttleVehiclesResponse(response({ vehicles: [vehicle({ plate: ' \t ' })] }))).toBeNull()
  })

  it('rejects a whitespace-only entry in unavailableRouteIds', () => {
    expect(parseApiShuttleVehiclesResponse(response({ unavailableRouteIds: ['A2', '  '] }))).toBeNull()
  })

  it('returns trimmed route IDs and plates', () => {
    const parsed = parseApiShuttleVehiclesResponse(response({
      vehicles: [vehicle({ routeId: ' A1 ', plate: ' SBS1234X ' })],
      unavailableRouteIds: [' A2 '],
    }))
    expect(parsed?.vehicles[0].routeId).toBe('A1')
    expect(parsed?.vehicles[0].plate).toBe('SBS1234X')
    expect(parsed?.unavailableRouteIds).toEqual(['A2'])
  })

  it('rejects a non-string entry in unavailableRouteIds', () => {
    expect(parseApiShuttleVehiclesResponse(response({ unavailableRouteIds: ['A2', 3] }))).toBeNull()
  })
})
