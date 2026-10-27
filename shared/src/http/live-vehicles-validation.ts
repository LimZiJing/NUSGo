import { SHUTTLE_LOAD_LEVELS, type ShuttleLoadLevel } from '../transit/live-arrivals.ts'
import type { ApiShuttleVehiclesResponse, ShuttleVehiclePosition } from './live-data-contracts.ts'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value))
}

function isFiniteNumberInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
}

function isLoadLevel(value: unknown): value is ShuttleLoadLevel {
  return typeof value === 'string' && (SHUTTLE_LOAD_LEVELS as readonly string[]).includes(value)
}

function parseVehicle(value: unknown): ShuttleVehiclePosition | null {
  if (!isRecord(value) || !isNonEmptyString(value.routeId) || !isNonEmptyString(value.plate) ||
    !isFiniteNumberInRange(value.lat, -90, 90) || !isFiniteNumberInRange(value.lng, -180, 180) ||
    !isFiniteNumberInRange(value.headingDegrees, 0, 360) ||
    !isFiniteNumberInRange(value.speed, 0, Number.POSITIVE_INFINITY) ||
    !isLoadLevel(value.load) || !isIsoTimestamp(value.observedAt) || !isIsoTimestamp(value.expiresAt)) {
    return null
  }
  return {
    routeId: value.routeId,
    plate: value.plate,
    lat: value.lat,
    lng: value.lng,
    headingDegrees: value.headingDegrees,
    speed: value.speed,
    load: value.load,
    observedAt: value.observedAt,
    expiresAt: value.expiresAt,
  }
}

/** Validate the complete vehicles response; any invalid entry rejects the whole response. */
export function parseApiShuttleVehiclesResponse(value: unknown): ApiShuttleVehiclesResponse | null {
  if (!isRecord(value) || !isIsoTimestamp(value.observedAt) || !isIsoTimestamp(value.expiresAt) ||
    !Array.isArray(value.vehicles)) {
    return null
  }

  const vehicles: ShuttleVehiclePosition[] = []
  for (const item of value.vehicles) {
    const vehicle = parseVehicle(item)
    if (!vehicle) return null
    vehicles.push(vehicle)
  }

  if (value.unavailableRouteIds === undefined) {
    return { observedAt: value.observedAt, expiresAt: value.expiresAt, vehicles }
  }
  if (!Array.isArray(value.unavailableRouteIds) || !value.unavailableRouteIds.every(isNonEmptyString)) {
    return null
  }
  return {
    observedAt: value.observedAt,
    expiresAt: value.expiresAt,
    vehicles,
    unavailableRouteIds: value.unavailableRouteIds,
  }
}
