import { useCallback, useState } from 'react'
import type { WaypointCoordinate } from '../../../../domain/waypoints/waypoint'
import { createPersonalWaypoint, type PersonalWaypointDraft } from '../../../../domain/waypoints/personal/create-personal-waypoint'
import type { PersonalWaypointValidationIssue } from '../../../../domain/waypoints/personal/personal-waypoint'
import type { PersonalWaypointStore } from '../../../../domain/waypoints/personal/personal-waypoint-store'

export function usePersonalWaypointWorkflow(store: PersonalWaypointStore) {
  const [readResult, setReadResult] = useState(() => store.read())
  const [draft, setDraft] = useState<PersonalWaypointDraft>({
    name: '',
    category: '',
    note: '',
    coordinate: { longitude: 103.7844, latitude: 1.2933 },
  })
  const [status, setStatus] = useState<string | null>(null)
  const [issues, setIssues] = useState<readonly PersonalWaypointValidationIssue[]>([])

  const refresh = useCallback(() => setReadResult(store.read()), [store])

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
    const created = createPersonalWaypoint(draft, {
      createId: () => crypto.randomUUID(),
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

  return { readResult, draft, status, issues, refresh, startDraft, updateDraft, save }
}
