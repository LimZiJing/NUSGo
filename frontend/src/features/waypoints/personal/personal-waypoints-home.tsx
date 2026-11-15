import { PERSONAL_WAYPOINTS_MAX_COUNT } from '../../../domain/waypoints/personal/personal-waypoint'
import type { PersonalWaypointStoreReadResult } from '../../../domain/waypoints/personal/personal-waypoint-store'
import type { PersonalWaypointCategoryOption } from '../../../domain/waypoints/personal/personal-waypoint-category-visibility'
import type { PersonalWaypoint } from '../../../domain/waypoints/personal/personal-waypoint'
import { useLayoutEffect, useRef, useState } from 'react'
import type { Ref } from 'react'
import { Button } from '../../../ui/button'
import { PersonalWaypointCategoryVisibility } from './components/personal-waypoint-category-visibility'
import { PersonalWaypointEditActions } from './components/personal-waypoint-edit-actions'
import { PersonalWaypointList } from './components/personal-waypoint-list'

export function PersonalWaypointsHome({
  readResult,
  status,
  onAdd,
  onOpenDetails,
  onSearchFilterChange,
  editing,
  onRemove,
  onMove,
  onReorder,
  onResetUnreadableData,
  onDiscardRejectedRecords,
  editingCategories,
  onConfirmEdits,
  onCancelEdits,
  categoryOptions,
  hiddenCategories,
  draftHiddenCategories,
  categoryPickerOpen,
  categoryVisibilityStatus,
  onSetCategoryVisible,
  onToggleCategoryPicker,
  onClearCategoryVisibilityChanges,
  onCancelCategoryVisibilityChanges,
  onDoneCategoryVisibilityChanges,
  categoryPickerTriggerRef,
  initialFocusRef,
  onRenameCategory,
  onMergeCategoryVisibility,
}: {
  readonly readResult: PersonalWaypointStoreReadResult
  readonly status: string | null
  readonly onAdd: () => void
  readonly onOpenDetails: (waypoint: PersonalWaypoint, trigger: HTMLElement) => void
  readonly onSearchFilterChange?: (active: boolean) => void
  readonly editing: boolean
  readonly onRemove: (waypointId: string) => void
  readonly onMove: (waypointId: string, category: string) => void
  readonly onReorder: (waypointId: string, targetIndex: number) => void
  /** Categories to keep visible while editing, including any the pending edits have emptied. */
  readonly editingCategories?: readonly string[]
  readonly onConfirmEdits: () => void
  readonly onCancelEdits: () => void
  readonly onResetUnreadableData: () => void
  readonly onDiscardRejectedRecords: () => void
  readonly categoryOptions: readonly PersonalWaypointCategoryOption[]
  readonly hiddenCategories: readonly string[]
  readonly draftHiddenCategories: readonly string[]
  readonly categoryPickerOpen: boolean
  readonly categoryVisibilityStatus: string | null
  readonly onSetCategoryVisible: (category: string, visible: boolean) => void
  readonly onToggleCategoryPicker: () => void
  readonly onClearCategoryVisibilityChanges: (categories: readonly string[]) => void
  readonly onCancelCategoryVisibilityChanges: () => void
  readonly onDoneCategoryVisibilityChanges: () => void
  readonly categoryPickerTriggerRef?: Ref<HTMLButtonElement>
  readonly initialFocusRef?: Ref<HTMLButtonElement>
  readonly onRenameCategory?: (from: string, to: string) => readonly PersonalWaypoint[] | null
  readonly onMergeCategoryVisibility?: (from: string, to: string) => boolean | null
}) {
  const ready = readResult.kind === 'ready'
  const canAdd = ready && readResult.rejectedRecords.count === 0 &&
    readResult.waypoints.length < PERSONAL_WAYPOINTS_MAX_COUNT
  const canManage = ready && readResult.rejectedRecords.count === 0
  const [editAnnouncement, setEditAnnouncement] = useState('')
  const emptyStateRef = useRef<HTMLParagraphElement>(null)
  const waypointCount = ready ? readResult.waypoints.length : null
  const atWaypointLimit = ready && readResult.waypoints.length >= PERSONAL_WAYPOINTS_MAX_COUNT
  const previousWaypointCount = useRef(waypointCount)

  useLayoutEffect(() => {
    if (previousWaypointCount.current !== null && previousWaypointCount.current > 0 && waypointCount === 0) {
      setEditAnnouncement('')
      emptyStateRef.current?.focus()
    }
    previousWaypointCount.current = waypointCount
  }, [waypointCount])

  return <div className="personal-waypoints-home">
    {/* While editing, the confirm/cancel pair takes the place of Add waypoint, so the screen has
        one decisive action rather than a primary button that cannot be used mid-edit. */}
    {editing
      ? <PersonalWaypointEditActions onConfirm={onConfirmEdits} onCancel={onCancelEdits} />
      : <Button label="Add waypoint" variant="primary" onClick={onAdd} disabled={!canAdd} ref={initialFocusRef} />}
    {status && <p className="personal-waypoints-status personal-waypoints-status-problem" role="status">{status}</p>}
    {atWaypointLimit && <p className="personal-waypoints-limit">
      The limit of {PERSONAL_WAYPOINTS_MAX_COUNT} waypoints has been reached.
    </p>}
    {editAnnouncement && <p className="visually-hidden" aria-live="polite">{editAnnouncement}</p>}
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
      <>
        {categoryVisibilityStatus && <p className="personal-waypoints-status personal-waypoints-status-problem" role="status">
          {categoryVisibilityStatus}
        </p>}
        <PersonalWaypointList
          waypoints={readResult.waypoints}
          canEdit={canManage}
          editing={editing}
          categoryPicker={categoryOptions.length > 0 ? <PersonalWaypointCategoryVisibility
            categories={categoryOptions}
            hiddenCategories={hiddenCategories}
            draftHiddenCategories={draftHiddenCategories}
            pickerOpen={categoryPickerOpen}
            onTogglePicker={onToggleCategoryPicker}
            onSetCategoryVisible={onSetCategoryVisible}
            triggerRef={categoryPickerTriggerRef}
            onClear={() => onClearCategoryVisibilityChanges(categoryOptions.map(({ category }) => category))}
            onCancel={onCancelCategoryVisibilityChanges}
            onDone={onDoneCategoryVisibilityChanges}
          /> : undefined}
          onOpenDetails={onOpenDetails}
          onSearchFilterChange={onSearchFilterChange}
          onRemove={onRemove}
          onMove={onMove}
          onReorder={onReorder}
          editingCategories={editingCategories}
          onEditAnnouncement={setEditAnnouncement}
          onRenameCategory={onRenameCategory}
          onMergeCategoryVisibility={onMergeCategoryVisibility}
        />
      </>
    )}
  </div>
}
