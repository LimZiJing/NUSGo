import { isValidLocationCoordinates } from '../location/coordinates'
import type { WaypointCoordinate } from './waypoint'

export type CoordinateInputError = 'unreadable' | 'latitude-out-of-range' | 'longitude-out-of-range'

export type CoordinateInputResult =
  | { readonly ok: true; readonly coordinate: WaypointCoordinate; readonly outsideSingapore: boolean }
  | { readonly ok: false; readonly error: CoordinateInputError; readonly message: string }

const PAIR = /^([+-]?(?:\d+(?:\.\d+)?|\.\d+))\s*(?:,\s*|\s)([+-]?(?:\d+(?:\.\d+)?|\.\d+))$/

// Loose bounding box around Singapore, used only to warn about likely typos.
const SINGAPORE_BOUNDS = { south: 1.13, north: 1.48, west: 103.59, east: 104.09 }

const MESSAGES: Record<CoordinateInputError, string> = {
  unreadable: 'Enter latitude, then longitude, in decimal degrees, for example 1.2966, 103.7764.',
  'latitude-out-of-range': 'Latitude must be between −90 and 90. Enter latitude first.',
  'longitude-out-of-range': 'Longitude must be between −180 and 180.',
}

function failure(error: CoordinateInputError): CoordinateInputResult {
  return { ok: false, error, message: MESSAGES[error] }
}

/** Parses one pasted "latitude, longitude" string in decimal degrees. */
export function parseCoordinateInput(input: string): CoordinateInputResult {
  const match = PAIR.exec(input.trim())
  if (!match) return failure('unreadable')
  const latitude = Number(match[1])
  const longitude = Number(match[2])
  if (!isValidLocationCoordinates(0, latitude)) return failure('latitude-out-of-range')
  if (!isValidLocationCoordinates(longitude, 0)) return failure('longitude-out-of-range')
  const { south, north, west, east } = SINGAPORE_BOUNDS
  return {
    ok: true,
    coordinate: { latitude, longitude },
    outsideSingapore: latitude < south || latitude > north || longitude < west || longitude > east,
  }
}
