import { PERSONAL_WAYPOINTS_MAX_COUNT } from '../../../domain/waypoints/personal/personal-waypoint'
import type { PersonalWaypointStoreReadResult } from '../../../domain/waypoints/personal/personal-waypoint-store'
import type { PersonalWaypointCategoryOption } from '../../../domain/waypoints/personal/personal-waypoint-category-visibility'
import type { PersonalWaypoint } from '../../../domain/waypoints/personal/personal-waypoint'
import { useLayoutEffect, useRef, useState } from 'react'
import type { Ref } from 'react'
import { Button } from '../../../ui/button'
import { PersonalWaypointCategoryVisibility } from './components/personal-waypoint-category-visibility'
import { PersonalWaypointList } from './components/personal-waypoint-list'

export function PersonalWaypointsHome({
  readResult,
  status,
  onAdd,
  onFocusWaypoint,
  onOpenDetails,
  onDirectionsWaypoint,
  onSearchFilterChange,
  editing,
  onRemove,
  onMove,
  onMoveToCategory,
  onMoveToPosition,
  onResetUnreadableData,
  onDiscardRejectedRecords,
  categoryOptions,
  hiddenCategories,
  draftHiddenCategories,
  categoryPickerOpen,
  selectedCategory,
  categoryVisibilityStatus,
  onSetCategoryVisible,
  onSetCategoryVisibleImmediately,
  onOpenCategory,
  onBackToCategories,
  onToggleCategoryPicker,
  onClearCategoryVisibilityChanges,
  onCancelCategoryVisibilityChanges,
  onDoneCategoryVisibilityChanges,
  categoryBackButtonRef,
  categoryPickerTriggerRef,
}: {
  readonly readResult: PersonalWaypointStoreReadResult
  readonly status: string | null
  readonly onAdd: (category?: string) => void
  readonly onFocusWaypoint: (waypoint: PersonalWaypoint) => void
  readonly onOpenDetails?: (waypoint: PersonalWaypoint, trigger: HTMLElement) => void
  readonly onDirectionsWaypoint?: (waypoint: PersonalWaypoint) => void
  readonly onSearchFilterChange?: (active: boolean) => void
  readonly editing: boolean
  readonly onRemove: (waypointId: string) => void
  readonly onMove: (waypointId: string, targetIndex: number) => boolean
  readonly onMoveToCategory?: (waypointId: string, category: string) => boolean
  readonly onMoveToPosition?: (waypointId: string, category: string, indexWithinCategory: number) => boolean
  readonly onResetUnreadableData: () => void
  readonly onDiscardRejectedRecords: () => void
  readonly categoryOptions: readonly PersonalWaypointCategoryOption[]
  readonly hiddenCategories: readonly string[]
  readonly draftHiddenCategories: readonly string[]
  readonly categoryPickerOpen: boolean
  readonly selectedCategory: string | null
  readonly categoryVisibilityStatus: string | null
  readonly onSetCategoryVisible: (category: string, visible: boolean) => void
  readonly onSetCategoryVisibleImmediately?: (category: string, visible: boolean) => void
  readonly onOpenCategory: (category: string) => void
  readonly onBackToCategories: () => void
  readonly onToggleCategoryPicker: () => void
  readonly onClearCategoryVisibilityChanges: (categories: readonly string[]) => void
  readonly onCancelCategoryVisibilityChanges: () => void
  readonly onDoneCategoryVisibilityChanges: () => void
  readonly categoryBackButtonRef?: Ref<HTMLButtonElement>
  readonly categoryPickerTriggerRef?: Ref<HTMLButtonElement>
}) {
  const ready = readResult.kind === 'ready'
  const canAdd = ready && readResult.rejectedRecords.count === 0 &&
    readResult.waypoints.length < PERSONAL_WAYPOINTS_MAX_COUNT
  const canManage = ready && readResult.rejectedRecords.count === 0
  const [editAnnouncement, setEditAnnouncement] = useState('')
  const emptyStateRef = useRef<HTMLParagraphElement>(null)
  const waypointCount = ready ? readResult.waypoints.length : null
  const activeCategory = selectedCategory && categoryOptions.some(({ category }) => category === selectedCategory)
    ? selectedCategory
    : null
  const atWaypointLimit = !activeCategory && ready && readResult.waypoints.length >= PERSONAL_WAYPOINTS_MAX_COUNT
  const previousWaypointCount = useRef(waypointCount)

  useLayoutEffect(() => {
    if (previousWaypointCount.current !== null && previousWaypointCount.current > 0 && waypointCount === 0) {
      setEditAnnouncement('')
      emptyStateRef.current?.focus()
    }
    previousWaypointCount.current = waypointCount
  }, [waypointCount])

  return <div className="personal-waypoints-home">
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
        {activeCategory
          ? <div className="personal-waypoint-category-back">
            <Button
              label="Back to categories"
              variant="ghost"
              onClick={onBackToCategories}
              ref={categoryBackButtonRef}
            />
          </div>
          : null}
        {!activeCategory && categoryVisibilityStatus && <p className="personal-waypoints-status personal-waypoints-status-problem" role="status">
          {categoryVisibilityStatus}
        </p>}
        <PersonalWaypointList
          waypoints={readResult.waypoints}
          category={activeCategory ?? undefined}
          canEdit={canManage}
          editing={editing}
          categoryPicker={!activeCategory && categoryOptions.length > 0 ? <PersonalWaypointCategoryVisibility
            categories={categoryOptions}
            hiddenCategories={hiddenCategories}
            draftHiddenCategories={draftHiddenCategories}
            pickerOpen={categoryPickerOpen}
            onTogglePicker={onToggleCategoryPicker}
            onSetCategoryVisible={onSetCategoryVisible}
            onOpenCategory={onOpenCategory}
            triggerRef={categoryPickerTriggerRef}
            onClear={() => onClearCategoryVisibilityChanges(categoryOptions.map(({ category }) => category))}
            onCancel={onCancelCategoryVisibilityChanges}
            onDone={onDoneCategoryVisibilityChanges}
          /> : undefined}
          onFocusWaypoint={onFocusWaypoint}
          onOpenDetails={onOpenDetails}
          onDirections={onDirectionsWaypoint}
          onAddCategory={onAdd}
          canAddWaypoint={canAdd}
          hiddenCategories={hiddenCategories}
          onSetCategoryVisibleImmediately={onSetCategoryVisibleImmediately}
          onSearchFilterChange={onSearchFilterChange}
          onRemove={onRemove}
          onMove={onMove}
          moveCategoryOptions={categoryOptions.map(({ category }) => category)}
          onMoveToCategory={onMoveToCategory}
          onMoveToPosition={onMoveToPosition}
          onEditAnnouncement={setEditAnnouncement}
        />
      </>
    )}
  </div>
}
