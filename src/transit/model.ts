import type {
  TransitNetwork,
  TransitVerificationManifest,
} from '../types/transit'

export class TransitValidationError extends Error {
  readonly issues: readonly string[]

  constructor(issues: readonly string[]) {
    super(issues.join('; '))
    this.name = 'TransitValidationError'
    this.issues = Object.freeze([...issues])
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function describe(value: unknown): string {
  if (value === undefined) return 'missing'
  if (typeof value === 'string') return value
  return String(value)
}

function idFor(value: Record<string, unknown>, index: number): string {
  return typeof value.id === 'string' && value.id.length > 0
    ? value.id
    : `<index ${index}>`
}

function addRequiredTextIssue(
  value: unknown,
  label: string,
  issues: string[],
): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    issues.push(`${label} must be a non-empty string`)
  }
}

export function validateTransitNetwork(input: unknown): TransitNetwork {
  const issues: string[] = []

  if (!isRecord(input)) {
    throw new TransitValidationError(['Transit network must be an object'])
  }

  const stops = input.stops
  const routes = input.routes
  if (!Array.isArray(stops)) {
    issues.push('Transit network stops must be an array')
  }
  if (!Array.isArray(routes)) {
    issues.push('Transit network routes must be an array')
  }
  if (!Array.isArray(stops) || !Array.isArray(routes)) {
    throw new TransitValidationError(issues)
  }

  const stopById = new Map<string, Record<string, unknown>>()
  const routeIds = new Set<string>()

  for (const [index, value] of routes.entries()) {
    if (!isRecord(value)) {
      issues.push(`Transit route at index ${index} must be an object`)
      continue
    }

    const routeId = idFor(value, index)
    if (typeof value.id !== 'string' || value.id.length === 0) {
      issues.push(`Transit route ${routeId} must have a non-empty ID`)
    } else if (routeIds.has(value.id)) {
      issues.push(`Duplicate transit route ID: ${value.id}`)
    } else {
      routeIds.add(value.id)
    }
  }

  for (const [index, value] of stops.entries()) {
    if (!isRecord(value)) {
      issues.push(`Transit stop at index ${index} must be an object`)
      continue
    }

    const stopId = idFor(value, index)
    if (typeof value.id !== 'string' || value.id.length === 0) {
      issues.push(`Transit stop ${stopId} must have a non-empty ID`)
    } else if (stopById.has(value.id)) {
      issues.push(`Duplicate transit stop ID: ${value.id}`)
    } else {
      stopById.set(value.id, value)
    }

    if (
      typeof value.latitude !== 'number' ||
      !Number.isFinite(value.latitude) ||
      value.latitude < -90 ||
      value.latitude > 90
    ) {
      issues.push(`Transit stop ${stopId} has invalid latitude: ${describe(value.latitude)}`)
    }
    if (
      typeof value.longitude !== 'number' ||
      !Number.isFinite(value.longitude) ||
      value.longitude < -180 ||
      value.longitude > 180
    ) {
      issues.push(`Transit stop ${stopId} has invalid longitude: ${describe(value.longitude)}`)
    }

    if (!Array.isArray(value.services)) {
      issues.push(`Transit stop ${stopId} services must be an array`)
    } else {
      for (const service of value.services) {
        if (typeof service !== 'string') {
          issues.push(`Transit stop ${stopId} has invalid service ID: ${describe(service)}`)
        } else if (!service.startsWith('PUB:') && !routeIds.has(service)) {
          issues.push(`Transit stop ${stopId} references unknown internal route service: ${service}`)
        }
      }
    }
  }

  for (const [index, value] of routes.entries()) {
    if (!isRecord(value)) continue
    const routeId = idFor(value, index)

    if (typeof value.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(value.color)) {
      issues.push(`Transit route ${routeId} has non-hex route color: ${describe(value.color)}`)
    }

    if (!Array.isArray(value.stopIds)) {
      issues.push(`Transit route ${routeId} stop IDs must be an array`)
      continue
    }
    if (value.stopIds.length < 2) {
      issues.push(`Transit route ${routeId} must contain at least two stops`)
    }

    const routeStopIds = new Set<string>()
    for (const stopIdValue of value.stopIds) {
      if (typeof stopIdValue !== 'string') {
        issues.push(`Transit route ${routeId} has an invalid stop ID: ${describe(stopIdValue)}`)
        continue
      }
      if (routeStopIds.has(stopIdValue)) {
        issues.push(`Transit route ${routeId} repeats stop: ${stopIdValue}`)
      }
      routeStopIds.add(stopIdValue)

      const stop = stopById.get(stopIdValue)
      if (!stop) {
        issues.push(`Transit route ${routeId} references unknown stop: ${stopIdValue}`)
      } else if (
        Array.isArray(stop.services) &&
        typeof value.id === 'string' &&
        !stop.services.includes(value.id)
      ) {
        issues.push(`Transit route ${routeId} stop ${stopIdValue} is missing route service reference`)
      }
    }
  }

  for (const [index, value] of stops.entries()) {
    if (!isRecord(value)) continue
    const stopId = idFor(value, index)
    const opposite = value.opposite
    if (opposite === undefined || opposite === null) continue
    if (typeof opposite !== 'string') {
      issues.push(`Transit stop ${stopId} has an invalid opposite stop reference: ${describe(opposite)}`)
      continue
    }

    const oppositeStop = stopById.get(opposite)
    if (!oppositeStop) {
      issues.push(`Transit stop ${stopId} references unknown opposite stop: ${opposite}`)
    } else if (oppositeStop.opposite !== value.id) {
      issues.push(`Transit stop ${stopId} opposite reference is not reciprocal with ${opposite}`)
    }
  }

  if (issues.length > 0) throw new TransitValidationError(issues)
  return input as unknown as TransitNetwork
}

export function validateTransitVerificationManifest(
  network: TransitNetwork,
  input: unknown,
): TransitVerificationManifest {
  const issues: string[] = []
  if (!isRecord(input)) {
    throw new TransitValidationError(['Transit verification manifest must be an object'])
  }

  if (input.version !== 1) {
    issues.push(`Transit verification manifest version must be 1: ${describe(input.version)}`)
  }
  addRequiredTextIssue(input.reviewedAt, 'Transit verification manifest reviewedAt', issues)
  if (!isRecord(input.geometry)) {
    issues.push('Transit verification manifest geometry must be an object')
  } else {
    addRequiredTextIssue(input.geometry.source, 'Transit verification manifest geometry source', issues)
    addRequiredTextIssue(input.geometry.reviewedAt, 'Transit verification manifest geometry reviewedAt', issues)
    addRequiredTextIssue(input.geometry.reviewNotes, 'Transit verification manifest geometry reviewNotes', issues)
  }

  addRequiredTextIssue(input.routeOrderSource, 'Transit verification manifest routeOrderSource', issues)
  addRequiredTextIssue(input.coordinateSource, 'Transit verification manifest coordinateSource', issues)

  if (!Array.isArray(input.routes)) {
    issues.push('Transit verification manifest routes must be an array')
  } else {
    if (input.routes.length !== network.routes.length) {
      issues.push(
        `Transit verification manifest must cover ${network.routes.length} routes: found ${input.routes.length}`,
      )
    }

    const networkRoutes = new Map(network.routes.map((route) => [route.id, route]))
    const seenRouteIds = new Set<string>()
    for (const [index, value] of input.routes.entries()) {
      if (!isRecord(value)) {
        issues.push(`Transit verification route at index ${index} must be an object`)
        continue
      }
      const routeId = idFor(value, index)
      if (typeof value.routeId !== 'string' || value.routeId.length === 0) {
        issues.push(`Transit verification route ${routeId} must have a non-empty route ID`)
        continue
      }
      if (seenRouteIds.has(value.routeId)) {
        issues.push(`Duplicate transit verification route ID: ${value.routeId}`)
      }
      seenRouteIds.add(value.routeId)
      addRequiredTextIssue(value.direction, `Transit verification route ${value.routeId} direction`, issues)

      const networkRoute = networkRoutes.get(value.routeId)
      if (!networkRoute) {
        issues.push(`Transit verification manifest references unknown route: ${value.routeId}`)
      }
      if (!Array.isArray(value.orderedStopIds)) {
        issues.push(`Transit verification route ${value.routeId} ordered stop IDs must be an array`)
      } else if (networkRoute && JSON.stringify(value.orderedStopIds) !== JSON.stringify(networkRoute.stopIds)) {
        issues.push(`Transit verification route ${value.routeId} stop order does not match the network model`)
      }
    }

    for (const route of network.routes) {
      if (!seenRouteIds.has(route.id)) {
        issues.push(`Transit verification manifest is missing route: ${route.id}`)
      }
    }
  }

  if (issues.length > 0) throw new TransitValidationError(issues)
  return input as unknown as TransitVerificationManifest
}
