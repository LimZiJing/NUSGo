import type {
  PersonalWaypointStore,
  PersonalWaypointStoreMutationResult,
  PersonalWaypointStoreReadResult,
  PersonalWaypointStoreRevision,
} from '../../domain/waypoints/personal/personal-waypoint-store'
import type {
  PersonalWaypoint,
  PersonalWaypointValidationIssue,
} from '../../domain/waypoints/personal/personal-waypoint'
import { validatePersonalWaypoints } from '../../domain/waypoints/personal/personal-waypoint'

const PERSONAL_WAYPOINTS_KEY = 'navus:personal-waypoints:v1'
const PERSONAL_WAYPOINTS_VERSION = 1

type BrowserStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
type StorageProvider = () => BrowserStorage

type StoredWaypoints =
  | { readonly kind: 'valid'; readonly waypoints: readonly PersonalWaypoint[] }
  | {
      readonly kind: 'partial'
      readonly waypoints: readonly PersonalWaypoint[]
      readonly rejectedRecords: {
        readonly count: number
        readonly issues: readonly PersonalWaypointValidationIssue[]
      }
    }
  | {
      readonly kind: 'invalid'
      readonly reason: 'malformed-data' | 'unsupported-version'
    }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toRevision(raw: string): PersonalWaypointStoreRevision {
  return raw as PersonalWaypointStoreRevision
}

function parseStoredWaypoints(raw: string): StoredWaypoints {
  let envelope: unknown
  try {
    envelope = JSON.parse(raw)
  } catch {
    return { kind: 'invalid', reason: 'malformed-data' }
  }

  if (!isRecord(envelope) || typeof envelope.version !== 'number') {
    return { kind: 'invalid', reason: 'malformed-data' }
  }
  if (Object.keys(envelope).some((field) => field !== 'version' && field !== 'waypoints')) {
    return { kind: 'invalid', reason: 'malformed-data' }
  }
  if (envelope.version !== PERSONAL_WAYPOINTS_VERSION) {
    return { kind: 'invalid', reason: 'unsupported-version' }
  }
  if (!Array.isArray(envelope.waypoints)) {
    return { kind: 'invalid', reason: 'malformed-data' }
  }

  const result = validatePersonalWaypoints(envelope.waypoints)
  if (result.ok) return { kind: 'valid', waypoints: result.waypoints }

  return {
    kind: 'partial',
    waypoints: result.waypoints,
    rejectedRecords: {
      count: envelope.waypoints.length - result.waypoints.length,
      issues: result.issues,
    },
  }
}

export function createLocalPersonalWaypointStore(
  getStorage: StorageProvider = () => window.localStorage,
): PersonalWaypointStore {
  function read(): PersonalWaypointStoreReadResult {
    let raw: string | null
    try {
      raw = getStorage().getItem(PERSONAL_WAYPOINTS_KEY)
    } catch {
      return { kind: 'unavailable', operation: 'read' }
    }

    if (raw === null) {
      return {
        kind: 'ready',
        waypoints: [],
        revision: null,
        rejectedRecords: { count: 0, issues: [] },
      }
    }

    const parsed = parseStoredWaypoints(raw)
    if (parsed.kind === 'invalid') {
      // Preserve unreadable values so recovery can be an explicit user action.
      return { kind: 'recovery-required', reason: parsed.reason, revision: toRevision(raw) }
    }

    return {
      kind: 'ready',
      waypoints: parsed.waypoints,
      revision: toRevision(raw),
      rejectedRecords: parsed.kind === 'partial'
        ? parsed.rejectedRecords
        : { count: 0, issues: [] },
    }
  }

  function replaceAll(
    waypoints: readonly PersonalWaypoint[],
    expectedRevision: PersonalWaypointStoreRevision | null,
  ): PersonalWaypointStoreMutationResult {
    const validation = validatePersonalWaypoints(waypoints)
    if (!validation.ok) return { kind: 'invalid', issues: validation.issues }

    let storage: BrowserStorage
    let raw: string | null
    try {
      storage = getStorage()
      raw = storage.getItem(PERSONAL_WAYPOINTS_KEY)
    } catch {
      return { kind: 'unavailable', operation: 'read' }
    }

    // Compare the loaded snapshot before replacing the complete collection.
    if (raw !== expectedRevision) return { kind: 'conflict' }
    if (raw !== null && parseStoredWaypoints(raw).kind === 'invalid') {
      return { kind: 'recovery-required' }
    }

    try {
      const value = JSON.stringify({
        version: PERSONAL_WAYPOINTS_VERSION,
        waypoints: validation.waypoints,
      })
      storage.setItem(PERSONAL_WAYPOINTS_KEY, value)
      return { kind: 'saved', revision: toRevision(value) }
    } catch {
      return { kind: 'unavailable', operation: 'write' }
    }
  }

  function clear(
    expectedRevision: PersonalWaypointStoreRevision | null,
  ): PersonalWaypointStoreMutationResult {
    let storage: BrowserStorage
    let raw: string | null
    try {
      storage = getStorage()
      raw = storage.getItem(PERSONAL_WAYPOINTS_KEY)
    } catch {
      return { kind: 'unavailable', operation: 'read' }
    }

    if (raw !== expectedRevision) return { kind: 'conflict' }

    try {
      storage.removeItem(PERSONAL_WAYPOINTS_KEY)
      return { kind: 'cleared' }
    } catch {
      return { kind: 'unavailable', operation: 'remove' }
    }
  }

  return { read, replaceAll, clear }
}
