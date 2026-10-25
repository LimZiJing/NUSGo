import {
  PERSONAL_WAYPOINTS_MAX_COUNT,
  type PersonalWaypoint,
} from '../../../domain/waypoints/personal/personal-waypoint'
import type { Ref } from 'react'
import { Button } from '../../../ui/button'

type PersonalWaypointReadView =
  | {
      readonly kind: 'ready'
      readonly waypoints: readonly PersonalWaypoint[]
      readonly rejectedRecords: { readonly count: number }
    }
  | { readonly kind: 'recovery-required' }
  | { readonly kind: 'unavailable' }

export function PersonalWaypointsHome({ readResult, status, onAdd, initialFocusRef }: {
  readonly readResult: PersonalWaypointReadView
  readonly status: string | null
  readonly onAdd: () => void
  readonly initialFocusRef?: Ref<HTMLButtonElement>
}) {
  const ready = readResult.kind === 'ready'
  const canAdd = ready && readResult.rejectedRecords.count === 0 &&
    readResult.waypoints.length < PERSONAL_WAYPOINTS_MAX_COUNT
  return <div className="personal-waypoints-home">
    <p>Personal Waypoints are saved in this browser profile.</p>
    <Button label="Add waypoint" variant="primary" onClick={onAdd} disabled={!canAdd} ref={initialFocusRef} />
    {status && <p role="status">{status}</p>}
    {readResult.kind === 'unavailable' && <p role="alert">Browser storage is unavailable. Waypoints cannot be saved here.</p>}
    {readResult.kind === 'recovery-required' && <p role="alert">Saved waypoint data needs recovery. It has been left untouched.</p>}
    {ready && readResult.rejectedRecords.count > 0 && <p role="alert">
      {readResult.rejectedRecords.count} saved waypoint records could not be read.
      Adding a waypoint is paused so those records are not overwritten.
    </p>}
    {ready && readResult.waypoints.length >= PERSONAL_WAYPOINTS_MAX_COUNT &&
      <p role="status">The limit of {PERSONAL_WAYPOINTS_MAX_COUNT} waypoints has been reached.</p>}
    {ready && readResult.waypoints.length > 0 && <div className="personal-waypoint-saved-list">
      <h3>Saved waypoints ({readResult.waypoints.length})</h3>
      <ul>{readResult.waypoints.map((waypoint) => <li key={waypoint.id}>
        <strong>{waypoint.name}</strong><span>{waypoint.category}</span>
      </li>)}</ul>
    </div>}
  </div>
}
