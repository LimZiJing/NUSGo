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

interface PersonalWaypointEditingState {
  readonly waypointId: string
  readonly baseRevision: PersonalWaypointStoreRevision | null
  readonly conflict: PersonalWaypointEditConflict | null
}

type PersonalWaypointWorkflowStatusKind = 'success' | 'problem'

interface PersonalWaypointWorkflowStatus {
  readonly message: string
  readonly kind: PersonalWaypointWorkflowStatusKind
  readonly revision: number
}

function createEmptyPersonalWaypointDraft(
  coordinate: WaypointCoordinate = DEFAULT_PERSONAL_WAYPOINT_COORDINATE,
): PersonalWaypointDraft {
  return {
    name: '',
    category: '',
    note: '',
    coordinate,
    markerColor: DEFAULT_PERSONAL_WAYPOINT_MARKER_COLOR,
    markerIcon: DEFAULT_PERSONAL_WAYPOINT_MARKER_ICON,
  }
}

function getEditConflict(
  readResult: PersonalWaypointStoreReadResult,
  waypointId: string,
): PersonalWaypointEditConflict | null {
  if (readResult.kind !== 'ready' || readResult.rejectedRecords.count > 0) return null
  // A null waypoint means another tab removed this record while it was being edited.
  return {
    revision: readResult.revision,
    latestWaypoint: readResult.waypoints.find(({ id }) => id === waypointId) ?? null,
  }
}

export function usePersonalWaypointWorkflow(store: PersonalWaypointStore) {
  const [readResult, setReadResult] = useState(() => store.read())
  const [draft, setDraft] = useState<PersonalWaypointDraft>(() => createEmptyPersonalWaypointDraft())
  const [statusUpdate, setStatusUpdate] = useState<PersonalWaypointWorkflowStatus | null>(null)
  const statusRevision = useRef(0)
  const [issues, setIssues] = useState<readonly PersonalWaypointValidationIssue[]>([])
  const [editing, setEditing] = useState<PersonalWaypointEditingState | null>(null)
  const editingWaypointId = editing?.waypointId ?? null
  const editConflict = editing?.conflict ?? null

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

  const finishMutation = useCallback((
    outcome: PersonalWaypointStoreMutationResult,
    successKind: 'saved' | 'cleared',
    successMessage: string,
    failureMessage?: string,
  ): boolean => {
    setReadResult(store.read())
    const succeeded = outcome.kind === successKind
    setStatus(
      succeeded ? successMessage : failureMessage ?? getMutationFailureMessage(outcome),
      succeeded ? 'success' : 'problem',
    )
    return succeeded
  }, [setStatus, store])

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
    return finishMutation(outcome, 'saved', successMessage)
  }, [finishMutation, setStatus, store])

  const removeWaypoint = useCallback((waypointId: string): boolean => updateCollection(
    (waypoints) => {
      const nextWaypoints = waypoints.filter(({ id }) => id !== waypointId)
      return nextWaypoints.length === waypoints.length ? waypoints : nextWaypoints
    },
    'Place removed.',
  ), [updateCollection])

  const moveWaypoint = useCallback((waypointId: string, targetIndex: number): boolean => updateCollection(
    (waypoints) => {
      const waypointIndex = waypoints.findIndex(({ id }) => id === waypointId)
      if (waypointIndex < 0 || targetIndex < 0 || targetIndex >= waypoints.length || waypointIndex === targetIndex) {
        return waypoints
      }

      const nextWaypoints = [...waypoints]
      const [movedWaypoint] = nextWaypoints.splice(waypointIndex, 1)
      nextWaypoints.splice(targetIndex, 0, movedWaypoint)
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
    return finishMutation(outcome, 'cleared', 'All places cleared.')
  }, [finishMutation, setStatus, store])

  const startDraft = useCallback((coordinate: WaypointCoordinate, category = '') => {
    setEditing(null)
    setDraft({ ...createEmptyPersonalWaypointDraft(coordinate), category })
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

    setEditing({
      waypointId: savedWaypoint.id,
      baseRevision: current.revision,
      conflict: null,
    })
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
    setEditing(null)
    setIssues([])
    clearStatus()
  }, [clearStatus])

  const updateDraft = useCallback((changes: Partial<PersonalWaypointDraft>) => {
    setDraft((current) => ({ ...current, ...changes }))
    setIssues([])
    clearStatus()
  }, [clearStatus])

  const saveEditedWaypoint = useCallback((): boolean => {
    if (!editing) return false

    const current = store.read()
    const expectedRevision = editing.conflict ? editing.conflict.revision : editing.baseRevision
    setReadResult(current)
    const blockedMessage = getBlockedMutationMessage(current)
    if (blockedMessage) {
      setStatus(blockedMessage, 'problem')
      return false
    }
    if (current.kind !== 'ready') return false

    // Reject stale drafts before replacing the collection; another tab may have changed it.
    if (current.revision !== expectedRevision) {
      const conflict = getEditConflict(current, editing.waypointId)
      if (conflict) {
        setEditing((state) => state && { ...state, conflict })
        clearStatus()
      }
      return false
    }

    const savedWaypoint = current.waypoints.find(({ id }) => id === editing.waypointId)
    if (!savedWaypoint) {
      setEditing((state) => state && {
        ...state,
        conflict: { revision: current.revision, latestWaypoint: null },
      })
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
      waypoint.id === editing.waypointId ? updated.waypoint : waypoint
    ))
    const outcome = store.replaceAll(nextWaypoints, expectedRevision)
    if (outcome.kind !== 'saved') {
      const latest = store.read()
      setReadResult(latest)
      if (outcome.kind === 'conflict') {
        const conflict = getEditConflict(latest, editing.waypointId)
        if (conflict) {
          setEditing((state) => state && { ...state, conflict })
          clearStatus()
          return false
        }
      }
      setStatus(getMutationFailureMessage(outcome), 'problem')
      return false
    }

    finishMutation(outcome, 'saved', 'Changes saved.')
    setIssues([])
    setEditing(null)
    return true
  }, [clearStatus, draft, editing, finishMutation, setStatus, store])

  const saveNewWaypoint = useCallback((): boolean => {
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
    const failureMessage = outcome.kind === 'conflict'
      ? 'Waypoints changed in another tab. Review the latest saved list and try again.'
      : 'The waypoint could not be saved. Your draft is still here.'
    if (!finishMutation(outcome, 'saved', 'Waypoint saved.', failureMessage)) return false

    setIssues([])
    return true
  }, [draft, finishMutation, setReadResult, setStatus, store])

  const save = useCallback(() => (
    editing ? saveEditedWaypoint() : saveNewWaypoint()
  ), [editing, saveEditedWaypoint, saveNewWaypoint])

  const resetUnreadableData = useCallback((): boolean => {
    const current = store.read()
    setReadResult(current)
    if (current.kind !== 'recovery-required') return false

    const outcome = store.clear(current.revision)
    return finishMutation(outcome, 'cleared', 'Unreadable Personal Waypoint data was reset from this browser profile.')
  }, [finishMutation, store])

  const discardRejectedRecords = useCallback((): boolean => {
    const current = store.read()
    setReadResult(current)
    if (current.kind !== 'ready' || current.rejectedRecords.count === 0) return false

    const outcome = store.replaceAll(current.waypoints, current.revision)
    return finishMutation(outcome, 'saved', 'Unreadable waypoint records were discarded. Readable waypoints were kept.')
  }, [finishMutation, store])

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
