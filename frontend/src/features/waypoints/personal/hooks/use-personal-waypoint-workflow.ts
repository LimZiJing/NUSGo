import { useCallback, useState } from 'react'
import type { WaypointCoordinate } from '../../../../domain/waypoints/waypoint'
import { DEFAULT_PERSONAL_WAYPOINT_COORDINATE } from '../../../../domain/waypoints/personal/personal-waypoint'
import { createPersonalWaypoint, type PersonalWaypointDraft } from '../../../../domain/waypoints/personal/create-personal-waypoint'
import type { PersonalWaypoint, PersonalWaypointValidationIssue } from '../../../../domain/waypoints/personal/personal-waypoint'
import type {
  PersonalWaypointStore,
  PersonalWaypointStoreMutationResult,
  PersonalWaypointStoreReadResult,
} from '../../../../domain/waypoints/personal/personal-waypoint-store'

function getBlockedMutationMessage(readResult: PersonalWaypointStoreReadResult): string | null {
  if (readResult.kind === 'unavailable') {
    return 'Waypoint storage is unavailable. The saved list was not changed.'
  }
  if (readResult.kind === 'recovery-required') {
    return 'Saved waypoint data needs recovery. It has been left untouched.'
  }
  if (readResult.rejectedRecords.count > 0) {
    return 'Some saved waypoints could not be read. The saved list was not changed.'
  }
  return null
}

function getMutationFailureMessage(outcome: PersonalWaypointStoreMutationResult): string {
  switch (outcome.kind) {
    case 'conflict':
      return 'Waypoints changed in another tab. Review the latest saved list and try again.'
    case 'recovery-required':
      return 'Saved waypoint data needs recovery. It has been left untouched.'
    case 'invalid':
      return 'The waypoint list could not be safely updated. Saved data was not changed.'
    case 'unavailable':
      return 'Waypoint storage is unavailable. The saved list was not changed.'
    case 'saved':
      return 'Waypoint changes saved.'
    case 'cleared':
      return 'Personal Waypoints cleared.'
  }
}

export function usePersonalWaypointWorkflow(store: PersonalWaypointStore) {
  const [readResult, setReadResult] = useState(() => store.read())
  const [draft, setDraft] = useState<PersonalWaypointDraft>({
    name: '',
    category: '',
    note: '',
    coordinate: DEFAULT_PERSONAL_WAYPOINT_COORDINATE,
  })
  const [status, setStatus] = useState<string | null>(null)
  const [issues, setIssues] = useState<readonly PersonalWaypointValidationIssue[]>([])

  const refresh = useCallback(() => setReadResult(store.read()), [store])

  const updateCollection = useCallback((
    update: (waypoints: readonly PersonalWaypoint[]) => readonly PersonalWaypoint[],
    successMessage: string,
  ): boolean => {
    const current = store.read()
    setReadResult(current)
    const blockedMessage = getBlockedMutationMessage(current)
    if (blockedMessage) {
      setStatus(blockedMessage)
      return false
    }
    if (current.kind !== 'ready') return false

    const nextWaypoints = update(current.waypoints)
    if (nextWaypoints === current.waypoints) return false

    const outcome = store.replaceAll(nextWaypoints, current.revision)
    if (outcome.kind !== 'saved') {
      setReadResult(store.read())
      setStatus(getMutationFailureMessage(outcome))
      return false
    }

    setReadResult(store.read())
    setStatus(successMessage)
    return true
  }, [store])

  const removeWaypoint = useCallback((waypointId: string): boolean => updateCollection(
    (waypoints) => {
      const nextWaypoints = waypoints.filter(({ id }) => id !== waypointId)
      return nextWaypoints.length === waypoints.length ? waypoints : nextWaypoints
    },
    'Waypoint removed from this browser profile.',
  ), [updateCollection])

  const moveWaypoint = useCallback((waypointId: string, neighborId: string): boolean => updateCollection(
    (waypoints) => {
      const waypointIndex = waypoints.findIndex(({ id }) => id === waypointId)
      const neighborIndex = waypoints.findIndex(({ id }) => id === neighborId)
      if (waypointIndex < 0 || neighborIndex < 0 || waypointIndex === neighborIndex) return waypoints

      const nextWaypoints = [...waypoints]
      const movedWaypoint = nextWaypoints[waypointIndex]
      nextWaypoints[waypointIndex] = nextWaypoints[neighborIndex]
      nextWaypoints[neighborIndex] = movedWaypoint
      return nextWaypoints
    },
    'Waypoint order saved in this browser profile.',
  ), [updateCollection])

  const clearAll = useCallback((): boolean => {
    const current = store.read()
    setReadResult(current)
    const blockedMessage = getBlockedMutationMessage(current)
    if (blockedMessage) {
      setStatus(blockedMessage)
      return false
    }
    if (current.kind !== 'ready' || current.waypoints.length === 0) return false

    const outcome = store.clear(current.revision)
    if (outcome.kind !== 'cleared') {
      setReadResult(store.read())
      setStatus(getMutationFailureMessage(outcome))
      return false
    }

    setReadResult(store.read())
    setStatus('Personal Waypoints cleared from this browser profile.')
    return true
  }, [store])

  const startDraft = useCallback((coordinate: WaypointCoordinate) => {
    setDraft({ name: '', category: '', note: '', coordinate })
    setIssues([])
    setStatus(null)
  }, [])

  const updateDraft = useCallback((changes: Partial<PersonalWaypointDraft>) => {
    setDraft((current) => ({ ...current, ...changes }))
    setIssues([])
    setStatus(null)
  }, [])

  const save = useCallback(() => {
    if (typeof globalThis.crypto?.randomUUID !== 'function') {
      setStatus('This browser cannot securely save a waypoint. Your draft is still here.')
      return false
    }

    const created = createPersonalWaypoint(draft, {
      createId: () => globalThis.crypto.randomUUID(),
      now: () => new Date().toISOString(),
    })
    if (!created.ok) {
      setIssues(created.issues)
      setStatus('Check the highlighted fields before saving.')
      return false
    }

    const current = store.read()
    setReadResult(current)
    if (current.kind !== 'ready' || current.rejectedRecords.count > 0) {
      setStatus('Saved waypoint data could not be safely updated. Your draft is still here.')
      return false
    }

    const outcome = store.replaceAll(
      [...current.waypoints, created.waypoint],
      current.revision,
    )
    if (outcome.kind !== 'saved') {
      setReadResult(store.read())
      setStatus(outcome.kind === 'conflict'
        ? 'Waypoints changed in another tab. Review the latest saved list and try again.'
        : 'The waypoint could not be saved. Your draft is still here.')
      return false
    }

    setReadResult(store.read())
    setStatus('Waypoint saved in this browser profile.')
    setIssues([])
    return true
  }, [draft, store])

  return {
    readResult,
    draft,
    status,
    issues,
    refresh,
    startDraft,
    updateDraft,
    save,
    removeWaypoint,
    moveWaypoint,
    clearAll,
  }
}
