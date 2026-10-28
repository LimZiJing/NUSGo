import { PERSONAL_WAYPOINTS_MAX_COUNT } from '../../../domain/waypoints/personal/personal-waypoint'
import type { PersonalWaypointStoreReadResult } from '../../../domain/waypoints/personal/personal-waypoint-store'
import { useLayoutEffect, useRef, useState } from 'react'
import type { Ref } from 'react'
import { Button } from '../../../ui/button'
import { PersonalWaypointList } from './components/personal-waypoint-list'

export function PersonalWaypointsHome({
  readResult,
  status,
  onAdd,
  editing,
  onSelectWaypoint,
  onRemove,
  onMove,
  onClearAll,
  onResetUnreadableData,
  onDiscardRejectedRecords,
  initialFocusRef,
}: {
  readonly readResult: PersonalWaypointStoreReadResult
  readonly status: string | null
  readonly onAdd: () => void
  readonly editing: boolean
  readonly onSelectWaypoint: (waypointId: string, trigger: HTMLButtonElement) => void
  readonly onRemove: (waypointId: string) => void
  readonly onMove: (waypointId: string, neighborId: string) => void
  readonly onClearAll: () => void
  readonly onResetUnreadableData: () => void
  readonly onDiscardRejectedRecords: () => void
  readonly initialFocusRef?: Ref<HTMLButtonElement>
}) {
  const ready = readResult.kind === 'ready'
  const canAdd = ready && readResult.rejectedRecords.count === 0 &&
    readResult.waypoints.length < PERSONAL_WAYPOINTS_MAX_COUNT
  const canManage = ready && readResult.rejectedRecords.count === 0
  const [editAnnouncement, setEditAnnouncement] = useState('')
  const emptyStateRef = useRef<HTMLParagraphElement>(null)
  const waypointCount = ready ? readResult.waypoints.length : null
  const previousWaypointCount = useRef(waypointCount)
  const combinedStatus = [
    status,
    editAnnouncement,
    ready && readResult.waypoints.length >= PERSONAL_WAYPOINTS_MAX_COUNT
      ? `The limit of ${PERSONAL_WAYPOINTS_MAX_COUNT} waypoints has been reached.`
      : null,
  ].filter((message): message is string => message !== null && message !== '').join(' ')

  useLayoutEffect(() => {
    if (previousWaypointCount.current !== null && previousWaypointCount.current > 0 && waypointCount === 0) {
      setEditAnnouncement('')
      emptyStateRef.current?.focus()
    }
    previousWaypointCount.current = waypointCount
  }, [waypointCount])

  return <div className="personal-waypoints-home">
    <Button label="Add waypoint" variant="primary" onClick={onAdd} disabled={!canAdd} ref={initialFocusRef} />
    <p className="personal-waypoint-privacy-note">Personal Waypoints are saved in this browser profile.</p>
    {combinedStatus && <p role="status">{combinedStatus}</p>}
    {readResult.kind === 'unavailable' && <p role="alert">Browser storage is unavailable. Waypoints cannot be saved here.</p>}
    {readResult.kind === 'recovery-required' && <>
      <p role="alert">Saved waypoint data needs recovery. It has been left untouched.</p>
      <Button label="Reset saved waypoint data" onClick={() => {
        if (window.confirm('Reset the unreadable Personal Waypoints data? This removes only the Personal Waypoints storage key.')) {
          onResetUnreadableData()
        }
      }} />
    </>}
    {ready && readResult.rejectedRecords.count > 0 && <>
      <p role="alert">
        {readResult.rejectedRecords.count} saved waypoint records could not be read.
        Adding or changing waypoints is paused until you choose a recovery action.
      </p>
      <Button label="Discard unreadable records" onClick={() => {
        const count = readResult.rejectedRecords.count
        const records = count === 1 ? 'record' : 'records'
        if (window.confirm(`Discard ${count} unreadable waypoint ${records} and keep the readable Personal Waypoints?`)) {
          onDiscardRejectedRecords()
        }
      }} />
    </>}
    {ready && readResult.waypoints.length === 0 && <p
      ref={emptyStateRef}
      className="personal-waypoint-empty"
      tabIndex={-1}
    >
      No saved waypoints yet. Add a waypoint to start your list.
    </p>}
    {ready && readResult.waypoints.length > 0 && (
      <PersonalWaypointList
        waypoints={readResult.waypoints}
        canEdit={canManage}
        editing={editing}
        onSelect={onSelectWaypoint}
        onRemove={onRemove}
        onMove={onMove}
        onClearAll={onClearAll}
        onEditAnnouncement={setEditAnnouncement}
      />
    )}
  </div>
}
