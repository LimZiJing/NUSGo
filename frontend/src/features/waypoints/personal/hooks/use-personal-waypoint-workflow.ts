import { useCallback, useState } from 'react'
import type { WaypointCoordinate } from '../../../../domain/waypoints/waypoint'
import { DEFAULT_PERSONAL_WAYPOINT_COORDINATE } from '../../../../domain/waypoints/personal/personal-waypoint'
import { createPersonalWaypoint, type PersonalWaypointDraft } from '../../../../domain/waypoints/personal/create-personal-waypoint'
import type { PersonalWaypoint, PersonalWaypointValidationIssue } from '../../../../domain/waypoints/personal/personal-waypoint'
import { updatePersonalWaypoint } from '../../../../domain/waypoints/personal/update-personal-waypoint'
import type {
  PersonalWaypointStore,
  PersonalWaypointStoreMutationResult,
  PersonalWaypointStoreReadResult,
  PersonalWaypointStoreRevision,
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
  const [editingWaypointId, setEditingWaypointId] = useState<string | null>(null)
  const [editingBaseRevision, setEditingBaseRevision] = useState<PersonalWaypointStoreRevision | null>(null)

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
    setEditingWaypointId(null)
    setEditingBaseRevision(null)
    setDraft({ name: '', category: '', note: '', coordinate })
    setIssues([])
    setStatus(null)
  }, [])

  const startEdit = useCallback((waypoint: PersonalWaypoint): boolean => {
    const current = store.read()
    setReadResult(current)
    const blockedMessage = getBlockedMutationMessage(current)
    if (blockedMessage) {
      setStatus(blockedMessage)
      return false
    }
    if (current.kind !== 'ready') return false

    const savedWaypoint = current.waypoints.find(({ id }) => id === waypoint.id)
    if (!savedWaypoint) {
      setStatus('This waypoint is no longer saved. The latest list has been reloaded.')
      return false
    }

    setEditingWaypointId(savedWaypoint.id)
    setEditingBaseRevision(current.revision)
    setDraft({
      name: savedWaypoint.name,
      category: savedWaypoint.category,
      note: savedWaypoint.note ?? '',
      coordinate: savedWaypoint.coordinate,
    })
    setIssues([])
    setStatus(null)
    return true
  }, [store])

  const cancelEdit = useCallback(() => {
    setEditingWaypointId(null)
    setEditingBaseRevision(null)
    setIssues([])
    setStatus(null)
  }, [])

  const updateDraft = useCallback((changes: Partial<PersonalWaypointDraft>) => {
    setDraft((current) => ({ ...current, ...changes }))
    setIssues([])
    setStatus(null)
  }, [])

  const save = useCallback(() => {
    if (editingWaypointId) {
      const current = store.read()
      setReadResult(current)
      const blockedMessage = getBlockedMutationMessage(current)
      if (blockedMessage) {
        setStatus(blockedMessage)
        return false
      }
      if (current.kind !== 'ready') return false

      const savedWaypoint = current.waypoints.find(({ id }) => id === editingWaypointId)
      if (!savedWaypoint) {
        setStatus('This waypoint is no longer saved. The latest list is shown and your edit draft is still here.')
        return false
      }

      const updated = updatePersonalWaypoint(savedWaypoint, draft, {
        now: () => new Date().toISOString(),
      })
      if (!updated.ok) {
        setIssues(updated.issues)
        setStatus('Check the highlighted fields before saving.')
        return false
      }

      const nextWaypoints = current.waypoints.map((waypoint) => (
        waypoint.id === editingWaypointId ? updated.waypoint : waypoint
      ))
      // Keep the revision captured when editing began so a newer saved collection cannot be overwritten silently.
      const outcome = store.replaceAll(nextWaypoints, editingBaseRevision)
      if (outcome.kind !== 'saved') {
        const latest = store.read()
        setReadResult(latest)
        // A second Save is an explicit user decision after this refreshed conflict message.
        if (outcome.kind === 'conflict' && latest.kind === 'ready' && latest.rejectedRecords.count === 0) {
          setEditingBaseRevision(latest.revision)
        }
        setStatus(getMutationFailureMessage(outcome))
        return false
      }

      setReadResult(store.read())
      setStatus('Waypoint changes saved.')
      setIssues([])
      setEditingWaypointId(null)
      setEditingBaseRevision(null)
      return true
    }

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
  }, [draft, editingBaseRevision, editingWaypointId, store])

  const resetUnreadableData = useCallback((): boolean => {
    const current = store.read()
    setReadResult(current)
    if (current.kind !== 'recovery-required') return false

    const outcome = store.clear(current.revision)
    if (outcome.kind !== 'cleared') {
      setReadResult(store.read())
      setStatus(getMutationFailureMessage(outcome))
      return false
    }

    setReadResult(store.read())
    setStatus('Unreadable Personal Waypoint data was reset from this browser profile.')
    return true
  }, [store])

  const discardRejectedRecords = useCallback((): boolean => {
    const current = store.read()
    setReadResult(current)
    if (current.kind !== 'ready' || current.rejectedRecords.count === 0) return false

    const outcome = store.replaceAll(current.waypoints, current.revision)
    if (outcome.kind !== 'saved') {
      setReadResult(store.read())
      setStatus(getMutationFailureMessage(outcome))
      return false
    }

    setReadResult(store.read())
    setStatus('Unreadable waypoint records were discarded. Readable waypoints were kept.')
    return true
  }, [store])

  return {
    readResult,
    draft,
    status,
    issues,
    editingWaypointId,
    refresh,
    startDraft,
    startEdit,
    cancelEdit,
    updateDraft,
    save,
    removeWaypoint,
    moveWaypoint,
    clearAll,
    resetUnreadableData,
    discardRejectedRecords,
  }
}
