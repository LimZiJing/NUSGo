import { useCallback, useMemo, useState } from 'react'
import type {
  PersonalWaypoint,
  PersonalWaypointValidationIssue,
} from '../../../../domain/waypoints/personal/personal-waypoint'
import type {
  PersonalWaypointStore,
  PersonalWaypointStoreMutationResult,
  PersonalWaypointStoreRevision,
} from '../../../../domain/waypoints/personal/personal-waypoint-store'
import {
  createPersonalWaypointEditSession,
  isSessionDirty,
  moveInSession,
  removeInSession,
  renameInSession,
  reorderInSession,
  sessionCategories,
  sessionChangeSummary,
  summariseSession,
  type PersonalWaypointEditSession,
} from '../../../../domain/waypoints/personal/personal-waypoint-edit-session'

export type EditCommitResult =
  | { readonly kind: 'saved'; readonly revision: PersonalWaypointStoreRevision }
  | { readonly kind: 'unchanged' }
  | { readonly kind: 'failed'; readonly message: string }

interface PersonalWaypointEditSessionState {
  readonly stored: readonly PersonalWaypoint[]
  readonly revision: PersonalWaypointStoreRevision | null
  readonly session: PersonalWaypointEditSession
  readonly issue: PersonalWaypointValidationIssue | null
}

function blockedWriteMessage(readResult: ReturnType<PersonalWaypointStore['read']>): string | null {
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

function failureMessage(outcome: PersonalWaypointStoreMutationResult): string {
  switch (outcome.kind) {
    case 'conflict':
      return 'Waypoints changed in another tab. Leave edit mode to see the latest list, then try again.'
    case 'recovery-required':
      return 'Saved waypoint data needs recovery. It has been left untouched.'
    case 'invalid':
      return 'The waypoint list could not be safely updated. Saved data was not changed.'
    case 'unavailable':
      return 'Waypoint storage is unavailable. The saved list was not changed.'
    default:
      return 'The changes could not be saved. Saved data was not changed.'
  }
}

/**
 * One editing transaction for the saved collection.
 *
 * Editing reads the stored collection once, so the session is always based on a revision this hook
 * knows the identity of. Everything the person does while editing — moving a place between
 * categories, reordering, removing, renaming a category — changes only working state. Nothing is
 * written until `commit`, which issues a single versioned write, and `cancel` therefore needs no
 * undo because the store was never touched. A list whose places are edited together is written
 * together or not at all.
 */
export function usePersonalWaypointEditSession(store: PersonalWaypointStore) {
  const [state, setState] = useState<PersonalWaypointEditSessionState | null>(null)

  const begin = useCallback((): string | null => {
    const readResult = store.read()
    const blocked = blockedWriteMessage(readResult)
    if (blocked) return blocked
    if (readResult.kind !== 'ready') return 'The saved list could not be read.'

    setState({
      stored: readResult.waypoints,
      revision: readResult.revision,
      session: createPersonalWaypointEditSession(readResult.waypoints),
      issue: null,
    })
    return null
  }, [store])

  const cancel = useCallback(() => setState(null), [])

  const working = state?.session.working ?? null

  const move = useCallback((waypointId: string, category: string): void => {
    setState((current) => current && {
      ...current,
      session: moveInSession(current.session, waypointId, category, () => new Date().toISOString()),
    })
  }, [])

  const reorder = useCallback((waypointId: string, targetIndex: number): void => {
    setState((current) => current && {
      ...current,
      session: reorderInSession(current.session, waypointId, targetIndex),
    })
  }, [])

  const remove = useCallback((waypointId: string): void => {
    setState((current) => current && {
      ...current,
      session: removeInSession(current.session, waypointId),
    })
  }, [])

  /**
   * Stages a category rename, returning the pending collection afterwards or null when the session
   * refused it (nothing to rename, or a record that fails validation). Nothing is written here: the
   * same contract as `renameCategory`, so the caller can report either outcome the same way.
   *
   * This reads `state` instead of using an updater because the answer has to be known before the
   * caller runs. A rename is a discrete command, not something that can queue behind another edit.
   */
  const rename = useCallback((from: string, to: string): readonly PersonalWaypoint[] | null => {
    if (!state) return null
    const session = renameInSession(state.session, from, to, () => new Date().toISOString())
    if (session === state.session) return null
    setState({ ...state, session })
    return session.working
  }, [state])

  const commit = useCallback((): EditCommitResult => {
    if (!state) return { kind: 'unchanged' }
    if (!isSessionDirty(state.session)) {
      setState(null)
      return { kind: 'unchanged' }
    }

    // Re-read so a write that would clobber another tab is caught before it happens.
    const readResult = store.read()
    const blocked = blockedWriteMessage(readResult)
    if (blocked) {
      setState((current) => current && { ...current, issue: { field: 'waypoints', message: blocked } })
      return { kind: 'failed', message: blocked }
    }
    if (readResult.kind !== 'ready') {
      const message = 'The saved list could not be read. Nothing was changed.'
      setState((current) => current && { ...current, issue: { field: 'waypoints', message } })
      return { kind: 'failed', message }
    }

    if (readResult.revision !== state.revision) {
      const message = failureMessage({ kind: 'conflict' })
      setState((current) => current && { ...current, issue: { field: 'waypoints', message } })
      return { kind: 'failed', message }
    }

    const outcome = store.replaceAll(state.session.working, state.revision)
    if (outcome.kind !== 'saved') {
      const message = failureMessage(outcome)
      setState((current) => current && { ...current, issue: { field: 'waypoints', message } })
      return { kind: 'failed', message }
    }

    // The write succeeded, so the session has nothing left to hold and the caller can report it.
    setState(null)
    return { kind: 'saved', revision: outcome.revision }
  }, [state, store])

  const summary = useMemo(
    () => state ? summariseSession(state.session) : null,
    [state],
  )
  const changeSummary = useMemo(() => summary ? sessionChangeSummary(summary) : null, [summary])
  const categories = useMemo(
    () => state ? sessionCategories(state.session) : [],
    [state],
  )
  const renames = state?.session.renames ?? []

  return {
    /** Non-null while an edit is in progress; the list renders from `working`. */
    editing: state !== null,
    working,
    categories,
    /** Category renames staged so far, so a caller can apply dependent changes on confirm. */
    renames,
    dirty: state ? isSessionDirty(state.session) : false,
    changeSummary,
    issue: state?.issue?.message ?? null,
    begin,
    cancel,
    move,
    reorder,
    remove,
    rename,
    commit,
  }
}
