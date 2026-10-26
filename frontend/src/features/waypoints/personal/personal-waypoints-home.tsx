import { PERSONAL_WAYPOINTS_MAX_COUNT } from '../../../domain/waypoints/personal/personal-waypoint'
import type { PersonalWaypointStoreReadResult } from '../../../domain/waypoints/personal/personal-waypoint-store'
import type { Ref } from 'react'
import { Button } from '../../../ui/button'
import { PersonalWaypointList } from './components/personal-waypoint-list'

export function PersonalWaypointsHome({
  readResult,
  status,
  onAdd,
  editing,
  onRemove,
  onMove,
  onClearAll,
  initialFocusRef,
}: {
  readonly readResult: PersonalWaypointStoreReadResult
  readonly status: string | null
  readonly onAdd: () => void
  readonly editing: boolean
  readonly onRemove: (waypointId: string) => void
  readonly onMove: (waypointId: string, neighborId: string) => void
  readonly onClearAll: () => void
  readonly initialFocusRef?: Ref<HTMLButtonElement>
}) {
  const ready = readResult.kind === 'ready'
  const canAdd = ready && readResult.rejectedRecords.count === 0 &&
    readResult.waypoints.length < PERSONAL_WAYPOINTS_MAX_COUNT
  const canManage = ready && readResult.rejectedRecords.count === 0
  return <div className="personal-waypoints-home">
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
    {ready && readResult.waypoints.length === 0 && <p className="personal-waypoint-empty">
      No saved waypoints yet. Add a waypoint to start your list.
    </p>}
    {ready && readResult.waypoints.length > 0 && (
      <PersonalWaypointList
        waypoints={readResult.waypoints}
        canEdit={canManage}
        editing={editing}
        onRemove={onRemove}
        onMove={onMove}
        onClearAll={onClearAll}
      />
    )}
  </div>
}
