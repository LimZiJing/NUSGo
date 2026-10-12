import type {
  TransitNetwork,
  TransitNetworkMetadata,
  TransitRoute,
  TransitStop,
  TransitVerificationManifest,
} from './types.ts'

export class TransitValidationError extends Error {
  readonly issues: readonly string[]

  constructor(issues: readonly string[]) {
    super(issues.join('; '))
    this.name = 'TransitValidationError'
    this.issues = Object.freeze([...issues])
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function describe(value: unknown): string {
  if (value === undefined) return 'missing'
  if (typeof value === 'string') return value
  return String(value)
}

function idFor(value: Record<string, unknown>, index: number): string {
  return typeof value.id === 'string' && value.id.trim().length > 0
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

function requireValidatedText(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new Error(`Validated transit ${label} is not text`)
  return value
}

function createTransitNetworkSnapshot(input: Record<string, unknown>): TransitNetwork {
  const metadataInput = input.metadata
  const routesInput = input.routes
  const stopsInput = input.stops
  if (!isRecord(metadataInput) || !Array.isArray(routesInput) || !Array.isArray(stopsInput)) {
    throw new Error('Transit network snapshot received invalid validated input')
  }

  const metadata: TransitNetworkMetadata = Object.freeze({
    source: requireValidatedText(metadataInput.source, 'metadata source'),
    routeStopOrder: requireValidatedText(metadataInput.routeStopOrder, 'metadata routeStopOrder'),
    routeGeometry: requireValidatedText(metadataInput.routeGeometry, 'metadata routeGeometry'),
    verifiedAt: requireValidatedText(metadataInput.verifiedAt, 'metadata verifiedAt'),
    routeOrderSource: requireValidatedText(metadataInput.routeOrderSource, 'metadata routeOrderSource'),
    coordinateSource: requireValidatedText(metadataInput.coordinateSource, 'metadata coordinateSource'),
  })

  const routes = routesInput.map((value): TransitRoute => {
    if (!isRecord(value) || !Array.isArray(value.stopIds) ||
      typeof value.id !== 'string' || typeof value.name !== 'string' || typeof value.color !== 'string' ||
      !value.stopIds.every((stopId): stopId is string => typeof stopId === 'string')) {
      throw new Error('Transit network snapshot received invalid validated route')
    }
    return Object.freeze({
      id: value.id,
      name: value.name,
      color: value.color,
      stopIds: Object.freeze([...value.stopIds]),
    })
  })

  const stops = stopsInput.map((value): TransitStop => {
    if (!isRecord(value) || !Array.isArray(value.services) ||
      typeof value.id !== 'string' || typeof value.longName !== 'string' || typeof value.shortName !== 'string' ||
      typeof value.latitude !== 'number' || typeof value.longitude !== 'number' ||
      !value.services.every((service): service is string => typeof service === 'string')) {
      throw new Error('Transit network snapshot received invalid validated stop')
    }
    const opposite = value.opposite
    if (opposite !== undefined && opposite !== null && typeof opposite !== 'string') {
      throw new Error('Transit network snapshot received invalid validated opposite stop')
    }
    return Object.freeze({
      id: value.id,
      longName: value.longName,
      shortName: value.shortName,
      latitude: value.latitude,
      longitude: value.longitude,
      services: Object.freeze([...value.services]),
      ...(opposite === undefined ? {} : { opposite }),
    })
  })

  return Object.freeze({
    version: 1,
    metadata,
    routes: Object.freeze(routes),
    stops: Object.freeze(stops),
  })
}

export function validateTransitNetwork(input: unknown): TransitNetwork {
  const issues: string[] = []

  if (!isRecord(input)) {
    throw new TransitValidationError(['Transit network must be an object'])
  }

  if (input.version !== 1) {
    issues.push(`Transit network version must be 1: ${describe(input.version)}`)
  }
  if (!isRecord(input.metadata)) {
    issues.push('Transit network metadata must be an object')
  } else {
    for (const field of ['source', 'routeStopOrder', 'routeGeometry', 'verifiedAt', 'routeOrderSource', 'coordinateSource'] as const) {
      addRequiredTextIssue(input.metadata[field], `Transit network metadata ${field}`, issues)
    }
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
  const routeById = new Map<string, Record<string, unknown>>()

  for (const [index, value] of routes.entries()) {
    if (!isRecord(value)) {
      issues.push(`Transit route at index ${index} must be an object`)
      continue
    }

    const routeId = idFor(value, index)
    if (typeof value.id !== 'string' || value.id.trim().length === 0) {
      issues.push(`Transit route ${routeId} must have a non-empty ID`)
    } else if (routeIds.has(value.id)) {
      issues.push(`Duplicate transit route ID: ${value.id}`)
    } else {
      routeIds.add(value.id)
      routeById.set(value.id, value)
    }
  }

  for (const [index, value] of stops.entries()) {
    if (!isRecord(value)) {
      issues.push(`Transit stop at index ${index} must be an object`)
      continue
    }

    const stopId = idFor(value, index)
    if (typeof value.id !== 'string' || value.id.trim().length === 0) {
      issues.push(`Transit stop ${stopId} must have a non-empty ID`)
    } else if (stopById.has(value.id)) {
      issues.push(`Duplicate transit stop ID: ${value.id}`)
    } else {
      stopById.set(value.id, value)
    }

    addRequiredTextIssue(value.longName, `Transit stop ${stopId} longName`, issues)
    addRequiredTextIssue(value.shortName, `Transit stop ${stopId} shortName`, issues)

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
    } else if (value.services.length === 0) {
      issues.push(`Transit stop ${stopId} services must contain at least one service`)
    } else {
      const serviceIds = new Set<string>()
      for (const service of value.services) {
        if (typeof service !== 'string' || service.trim().length === 0) {
          issues.push(`Transit stop ${stopId} has invalid service ID: ${describe(service)}`)
          continue
        }
        if (serviceIds.has(service)) {
          issues.push(`Transit stop ${stopId} repeats service: ${service}`)
        }
        serviceIds.add(service)
        if (!service.startsWith('PUB:') && !routeIds.has(service)) {
          issues.push(`Transit stop ${stopId} references unknown internal route service: ${service}`)
        }
      }
    }
  }

  for (const [index, value] of routes.entries()) {
    if (!isRecord(value)) continue
    const routeId = idFor(value, index)

    addRequiredTextIssue(value.name, `Transit route ${routeId} name`, issues)
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
    const finalStopIndex = value.stopIds.length - 1
    const firstStopId = value.stopIds[0]
    for (const [stopIndex, stopIdValue] of value.stopIds.entries()) {
      if (typeof stopIdValue !== 'string' || stopIdValue.trim().length === 0) {
        issues.push(`Transit route ${routeId} has an invalid stop ID: ${describe(stopIdValue)}`)
        continue
      }
      const isClosingTerminal =
        stopIndex === finalStopIndex &&
        stopIdValue === firstStopId
      if (routeStopIds.has(stopIdValue) && !isClosingTerminal) {
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
    if (typeof opposite !== 'string' || opposite.trim().length === 0) {
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

  for (const [stopId, stop] of stopById) {
    if (!Array.isArray(stop.services)) continue
    for (const service of stop.services) {
      if (!routeIds.has(service)) continue
      const route = routeById.get(service)
      if (
        route &&
        Array.isArray(route.stopIds) &&
        !route.stopIds.includes(stopId)
      ) {
        issues.push(`Transit stop ${stopId} service ${service} is missing stop membership on route ${service}`)
      }
    }
  }

  if (issues.length > 0) throw new TransitValidationError(issues)
  return createTransitNetworkSnapshot(input)
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
      if (typeof value.routeId !== 'string' || value.routeId.trim().length === 0) {
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
      } else {
        const seenStopIds = new Set<string>()
        const finalStopIndex = value.orderedStopIds.length - 1
        const firstStopId = value.orderedStopIds[0]
        for (const [stopIndex, stopId] of value.orderedStopIds.entries()) {
          if (typeof stopId !== 'string' || stopId.trim().length === 0) {
            issues.push(`Transit verification route ${value.routeId} ordered stop ${stopIndex} must be a non-empty string`)
          } else if (
            seenStopIds.has(stopId) &&
            !(stopIndex === finalStopIndex && stopId === firstStopId)
          ) {
            issues.push(`Transit verification route ${value.routeId} repeats stop: ${stopId}`)
          }
          if (typeof stopId === 'string') seenStopIds.add(stopId)
        }
        if (networkRoute && JSON.stringify(value.orderedStopIds) !== JSON.stringify(networkRoute.stopIds)) {
          issues.push(`Transit verification route ${value.routeId} stop order does not match the network model`)
        }
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
