import { useCallback, useEffect, useRef, useState } from 'react'
import type { WaypointCoordinate } from '../../../../domain/waypoints/waypoint'
import {
  DEFAULT_PERSONAL_WAYPOINT_COORDINATE,
  DEFAULT_PERSONAL_WAYPOINT_MARKER_COLOR,
  DEFAULT_PERSONAL_WAYPOINT_MARKER_ICON,
} from '../../../../domain/waypoints/personal/personal-waypoint'
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

export interface PersonalWaypointEditConflict {
  readonly revision: PersonalWaypointStoreRevision | null
  readonly latestWaypoint: PersonalWaypoint | null
}

type PersonalWaypointWorkflowStatusKind = 'success' | 'problem'

interface PersonalWaypointWorkflowStatus {
  readonly message: string
  readonly kind: PersonalWaypointWorkflowStatusKind
  readonly revision: number
}

function getEditConflict(
  readResult: PersonalWaypointStoreReadResult,
  waypointId: string,
): PersonalWaypointEditConflict | null {
  if (readResult.kind !== 'ready' || readResult.rejectedRecords.count > 0) return null
  return {
    revision: readResult.revision,
    latestWaypoint: readResult.waypoints.find(({ id }) => id === waypointId) ?? null,
  }
}

export function usePersonalWaypointWorkflow(store: PersonalWaypointStore) {
  const [readResult, setReadResult] = useState(() => store.read())
  const [draft, setDraft] = useState<PersonalWaypointDraft>({
    name: '',
    category: '',
    note: '',
    coordinate: DEFAULT_PERSONAL_WAYPOINT_COORDINATE,
    markerColor: DEFAULT_PERSONAL_WAYPOINT_MARKER_COLOR,
    markerIcon: DEFAULT_PERSONAL_WAYPOINT_MARKER_ICON,
  })
  const [statusUpdate, setStatusUpdate] = useState<PersonalWaypointWorkflowStatus | null>(null)
  const statusRevision = useRef(0)
  const [issues, setIssues] = useState<readonly PersonalWaypointValidationIssue[]>([])
  const [editingWaypointId, setEditingWaypointId] = useState<string | null>(null)
  const [editingBaseRevision, setEditingBaseRevision] = useState<PersonalWaypointStoreRevision | null>(null)
  const [editConflict, setEditConflict] = useState<PersonalWaypointEditConflict | null>(null)

  const setStatus = useCallback((message: string, kind: PersonalWaypointWorkflowStatusKind) => {
    statusRevision.current += 1
    setStatusUpdate({ message, kind, revision: statusRevision.current })
  }, [])
  const clearStatus = useCallback(() => setStatusUpdate(null), [])

  useEffect(() => {
    if (!statusUpdate || statusUpdate.kind !== 'success') return

    const timeoutId = window.setTimeout(() => {
      setStatusUpdate((current) => current?.revision === statusUpdate.revision ? null : current)
    }, 7000)

    return () => window.clearTimeout(timeoutId)
  }, [statusUpdate])

  const refresh = useCallback(() => setReadResult(store.read()), [store])

  const updateCollection = useCallback((
    update: (waypoints: readonly PersonalWaypoint[]) => readonly PersonalWaypoint[],
    successMessage: string,
  ): boolean => {
    const current = store.read()
    setReadResult(current)
    const blockedMessage = getBlockedMutationMessage(current)
    if (blockedMessage) {
      setStatus(blockedMessage, 'problem')
      return false
    }
    if (current.kind !== 'ready') return false

    const nextWaypoints = update(current.waypoints)
    if (nextWaypoints === current.waypoints) return false

    const outcome = store.replaceAll(nextWaypoints, current.revision)
    if (outcome.kind !== 'saved') {
      setReadResult(store.read())
      setStatus(getMutationFailureMessage(outcome), 'problem')
      return false
    }

    setReadResult(store.read())
    setStatus(successMessage, 'success')
    return true
  }, [setStatus, store])

  const removeWaypoint = useCallback((waypointId: string): boolean => updateCollection(
    (waypoints) => {
      const nextWaypoints = waypoints.filter(({ id }) => id !== waypointId)
      return nextWaypoints.length === waypoints.length ? waypoints : nextWaypoints
    },
    'Place removed.',
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
    'Order saved.',
  ), [updateCollection])

  const clearAll = useCallback((): boolean => {
    const current = store.read()
    setReadResult(current)
    const blockedMessage = getBlockedMutationMessage(current)
    if (blockedMessage) {
      setStatus(blockedMessage, 'problem')
      return false
    }
    if (current.kind !== 'ready' || current.waypoints.length === 0) return false

    const outcome = store.clear(current.revision)
    if (outcome.kind !== 'cleared') {
      setReadResult(store.read())
      setStatus(getMutationFailureMessage(outcome), 'problem')
      return false
    }

    setReadResult(store.read())
    setStatus('All places cleared.', 'success')
    return true
  }, [setStatus, store])

  const startDraft = useCallback((coordinate: WaypointCoordinate) => {
    setEditingWaypointId(null)
    setEditConflict(null)
    setEditingBaseRevision(null)
    setDraft({
      name: '',
      category: '',
      note: '',
      coordinate,
      markerColor: DEFAULT_PERSONAL_WAYPOINT_MARKER_COLOR,
      markerIcon: DEFAULT_PERSONAL_WAYPOINT_MARKER_ICON,
    })
    setIssues([])
    clearStatus()
  }, [clearStatus])

  const startEdit = useCallback((waypoint: PersonalWaypoint): boolean => {
    const current = store.read()
    setReadResult(current)
    const blockedMessage = getBlockedMutationMessage(current)
    if (blockedMessage) {
      setStatus(blockedMessage, 'problem')
      return false
    }
    if (current.kind !== 'ready') return false

    const savedWaypoint = current.waypoints.find(({ id }) => id === waypoint.id)
    if (!savedWaypoint) {
      setStatus('This waypoint is no longer saved. The latest list has been reloaded.', 'problem')
      return false
    }

    setEditingWaypointId(savedWaypoint.id)
    setEditConflict(null)
    setEditingBaseRevision(current.revision)
    setDraft({
      name: savedWaypoint.name,
      category: savedWaypoint.category,
      note: savedWaypoint.note ?? '',
      coordinate: savedWaypoint.coordinate,
      markerColor: savedWaypoint.markerColor,
      markerIcon: savedWaypoint.markerIcon,
    })
    setIssues([])
    clearStatus()
    return true
  }, [clearStatus, setStatus, store])

  const cancelEdit = useCallback(() => {
    setEditingWaypointId(null)
    setEditingBaseRevision(null)
    setEditConflict(null)
    setIssues([])
    clearStatus()
  }, [clearStatus])

  const updateDraft = useCallback((changes: Partial<PersonalWaypointDraft>) => {
    setDraft((current) => ({ ...current, ...changes }))
    setIssues([])
    clearStatus()
  }, [clearStatus])

  const save = useCallback(() => {
    if (editingWaypointId) {
      const current = store.read()
      const expectedRevision = editConflict ? editConflict.revision : editingBaseRevision
      setReadResult(current)
      const blockedMessage = getBlockedMutationMessage(current)
      if (blockedMessage) {
        setStatus(blockedMessage, 'problem')
        return false
      }
      if (current.kind !== 'ready') return false

      if (current.revision !== expectedRevision) {
        const conflict = getEditConflict(current, editingWaypointId)
        if (conflict) {
          setEditConflict(conflict)
          clearStatus()
        }
        return false
      }

      const savedWaypoint = current.waypoints.find(({ id }) => id === editingWaypointId)
      if (!savedWaypoint) {
        setEditConflict({ revision: current.revision, latestWaypoint: null })
        clearStatus()
        return false
      }

      const updated = updatePersonalWaypoint(savedWaypoint, draft, {
        now: () => new Date().toISOString(),
      })
      if (!updated.ok) {
        setIssues(updated.issues)
        setStatus('Check the highlighted fields before saving.', 'problem')
        return false
      }

      const nextWaypoints = current.waypoints.map((waypoint) => (
        waypoint.id === editingWaypointId ? updated.waypoint : waypoint
      ))
      const outcome = store.replaceAll(nextWaypoints, expectedRevision)
      if (outcome.kind !== 'saved') {
        const latest = store.read()
        setReadResult(latest)
        if (outcome.kind === 'conflict') {
          const conflict = getEditConflict(latest, editingWaypointId)
          if (conflict) {
            setEditConflict(conflict)
            clearStatus()
            return false
          }
        }
        setStatus(getMutationFailureMessage(outcome), 'problem')
        return false
      }

      setReadResult(store.read())
      setStatus('Changes saved.', 'success')
      setIssues([])
      setEditingWaypointId(null)
      setEditConflict(null)
      setEditingBaseRevision(null)
      return true
    }

    if (typeof globalThis.crypto?.randomUUID !== 'function') {
      setStatus('This browser cannot securely save a waypoint. Your draft is still here.', 'problem')
      return false
    }

    const created = createPersonalWaypoint(draft, {
      createId: () => globalThis.crypto.randomUUID(),
      now: () => new Date().toISOString(),
    })
    if (!created.ok) {
      setIssues(created.issues)
      setStatus('Check the highlighted fields before saving.', 'problem')
      return false
    }

    const current = store.read()
    setReadResult(current)
    if (current.kind !== 'ready' || current.rejectedRecords.count > 0) {
      setStatus('Saved waypoint data could not be safely updated. Your draft is still here.', 'problem')
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
        : 'The waypoint could not be saved. Your draft is still here.', 'problem')
      return false
    }

    setReadResult(store.read())
    setStatus('Waypoint saved.', 'success')
    setIssues([])
    return true
  }, [clearStatus, draft, editConflict, editingBaseRevision, editingWaypointId, setStatus, store])

  const resetUnreadableData = useCallback((): boolean => {
    const current = store.read()
    setReadResult(current)
    if (current.kind !== 'recovery-required') return false

    const outcome = store.clear(current.revision)
    if (outcome.kind !== 'cleared') {
      setReadResult(store.read())
      setStatus(getMutationFailureMessage(outcome), 'problem')
      return false
    }

    setReadResult(store.read())
    setStatus('Unreadable Personal Waypoint data was reset from this browser profile.', 'success')
    return true
  }, [setStatus, store])

  const discardRejectedRecords = useCallback((): boolean => {
    const current = store.read()
    setReadResult(current)
    if (current.kind !== 'ready' || current.rejectedRecords.count === 0) return false

    const outcome = store.replaceAll(current.waypoints, current.revision)
    if (outcome.kind !== 'saved') {
      setReadResult(store.read())
      setStatus(getMutationFailureMessage(outcome), 'problem')
      return false
    }

    setReadResult(store.read())
    setStatus('Unreadable waypoint records were discarded. Readable waypoints were kept.', 'success')
    return true
  }, [setStatus, store])

  return {
    readResult,
    draft,
    status: statusUpdate?.message ?? null,
    statusKind: statusUpdate?.kind ?? null,
    statusRevision: statusUpdate?.revision ?? 0,
    issues,
    editingWaypointId,
    editConflict,
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
