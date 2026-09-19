import type { VenueLocation, VenueLocationMap } from './types'

export class VenueValidationError extends Error {
  readonly issues: readonly string[]

  constructor(issues: readonly string[]) {
    super(issues.join('; '))
    this.name = 'VenueValidationError'
    this.issues = Object.freeze([...issues])
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isValidFloor(value: unknown): boolean {
  return (
    value === undefined || value === null ||
    (typeof value === 'number' && Number.isFinite(value)) ||
    (typeof value === 'string' && value.trim().length > 0)
  )
}

function validateVenue(
  code: string,
  value: unknown,
  issues: string[],
): value is VenueLocation {
  if (!isRecord(value)) {
    issues.push(`Venue ${code} must be an object`)
    return false
  }

  if (typeof value.roomName !== 'string' || value.roomName.trim().length === 0) {
    issues.push(`Venue ${code} roomName must be a non-empty string`)
  }
  if (!isValidFloor(value.floor)) {
    issues.push(`Venue ${code} floor must be a finite number, non-empty string, or null`)
  }

  if (value.location === undefined) return true
  if (!isRecord(value.location)) {
    issues.push(`Venue ${code} location must be an object when provided`)
    return false
  }

  const longitude = value.location.x
  const latitude = value.location.y
  if (
    typeof longitude !== 'number' ||
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180
  ) {
    issues.push(`Venue ${code} has invalid longitude: ${String(longitude)}`)
  }
  if (
    typeof latitude !== 'number' ||
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90
  ) {
    issues.push(`Venue ${code} has invalid latitude: ${String(latitude)}`)
  }

  return true
}

export function validateVenueLocationMap(input: unknown): VenueLocationMap {
  const issues: string[] = []
  if (!isRecord(input)) {
    throw new VenueValidationError(['Venue data must be an object'])
  }

  for (const [code, value] of Object.entries(input)) {
    if (code.trim().length === 0) {
      issues.push('Venue code must be a non-empty string')
      continue
    }
    validateVenue(code, value, issues)
  }

  if (issues.length > 0) throw new VenueValidationError(issues)
  return input as VenueLocationMap
}

export function getVenueCount(venues: VenueLocationMap): number {
  return Object.values(venues).filter((venue) => venue.location).length
}
