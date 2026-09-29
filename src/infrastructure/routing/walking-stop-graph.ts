import type { WalkingConnection } from '../../app/contracts/routing'
import { fetchJson } from '../data/json.ts'

export const WALKING_STOP_GRAPH_VERSION = 1

export interface WalkingStopGraph {
  readonly version: typeof WALKING_STOP_GRAPH_VERSION
  readonly networkVersion: number
  readonly routingProfile: 'pedestrian'
  readonly routingDataVersion: string
  readonly stopIds: readonly string[]
  readonly connections: readonly WalkingConnection[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requireText(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Walking stop graph ${label} must be a non-empty string`)
  }
  return value
}

function requireMetric(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`Walking stop graph ${label} must be a non-negative number`)
  }
  return value
}

export function validateWalkingStopGraph(input: unknown): WalkingStopGraph {
  if (!isRecord(input) || input.version !== WALKING_STOP_GRAPH_VERSION) {
    throw new Error(`Walking stop graph version must be ${WALKING_STOP_GRAPH_VERSION}`)
  }
  if (typeof input.networkVersion !== 'number' || !Number.isInteger(input.networkVersion)) {
    throw new Error('Walking stop graph networkVersion must be an integer')
  }
  if (input.routingProfile !== 'pedestrian') {
    throw new Error('Walking stop graph routingProfile must be pedestrian')
  }
  const routingDataVersion = requireText(input.routingDataVersion, 'routingDataVersion')
  if (!Array.isArray(input.stopIds) || input.stopIds.length === 0) {
    throw new Error('Walking stop graph stopIds must not be empty')
  }

  const stopIds = input.stopIds.map((stopId, index) => requireText(stopId, `stopIds[${index}]`))
  const stopIdSet = new Set(stopIds)
  if (stopIdSet.size !== stopIds.length) {
    throw new Error('Walking stop graph stopIds must be unique')
  }
  if (!Array.isArray(input.connections)) {
    throw new Error('Walking stop graph connections must be an array')
  }

  const connectionKeys = new Set<string>()
  const connections = input.connections.map((value, index): WalkingConnection => {
    if (!isRecord(value)) throw new Error(`Walking stop graph connection ${index} must be an object`)
    const fromStopId = requireText(value.fromStopId, `connections[${index}].fromStopId`)
    const toStopId = requireText(value.toStopId, `connections[${index}].toStopId`)
    if (!stopIdSet.has(fromStopId) || !stopIdSet.has(toStopId)) {
      throw new Error(`Walking stop graph connection ${index} references an unknown stop`)
    }
    if (fromStopId === toStopId) {
      throw new Error(`Walking stop graph connection ${index} must not connect a stop to itself`)
    }
    const key = `${fromStopId}\u0000${toStopId}`
    if (connectionKeys.has(key)) {
      throw new Error(`Walking stop graph repeats connection ${fromStopId} -> ${toStopId}`)
    }
    connectionKeys.add(key)
    return Object.freeze({
      fromKey: `stop:${fromStopId}`,
      toKey: `stop:${toStopId}`,
      distanceMeters: requireMetric(value.distanceMeters, `connections[${index}].distanceMeters`),
      durationSeconds: requireMetric(value.durationSeconds, `connections[${index}].durationSeconds`),
    })
  })
  const expectedConnectionCount = stopIds.length * (stopIds.length - 1)
  if (connections.length !== expectedConnectionCount) {
    throw new Error(
      `Walking stop graph must contain ${expectedConnectionCount} directed connections`,
    )
  }

  return Object.freeze({
    version: WALKING_STOP_GRAPH_VERSION,
    networkVersion: input.networkVersion,
    routingProfile: 'pedestrian',
    routingDataVersion,
    stopIds: Object.freeze(stopIds),
    connections: Object.freeze(connections),
  })
}

export type WalkingStopGraphLoader = (signal: AbortSignal) => Promise<WalkingStopGraph>

export function loadWalkingStopGraph(
  signal: AbortSignal,
): Promise<WalkingStopGraph> {
  return fetchJson('/data/walking-stop-graph.json', signal, 'Walking stop graph')
    .then(validateWalkingStopGraph)
}
