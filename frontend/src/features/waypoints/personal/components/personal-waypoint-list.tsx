import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { KeyboardEvent } from 'react'
import { arrayMove, move } from '@dnd-kit/helpers'
import { DragDropProvider, PointerSensor } from '@dnd-kit/react'
import type { DragEndEvent } from '@dnd-kit/react'
import type { PersonalWaypoint } from '../../../../domain/waypoints/personal/personal-waypoint'
import { Button } from '../../../../ui/button'
import { SearchField } from '../../../../ui/search-field'
import { filterPersonalWaypoints } from '../data/filter-personal-waypoints'
import {
  PersonalWaypointListRow,
  PersonalWaypointSortableListRow,
} from './personal-waypoint-list-row'

const reorderInstructionsId = 'personal-waypoint-reorder-instructions'

interface KeyboardReorderState {
  readonly waypointId: string
  readonly startIndex: number
  readonly currentIndex: number
}

interface PersonalWaypointListProps {
  readonly waypoints: readonly PersonalWaypoint[]
  readonly category?: string
  readonly canEdit: boolean
  readonly editing: boolean
  readonly categoryPicker?: ReactNode
  readonly onFocusWaypoint?: (waypoint: PersonalWaypoint) => void
  readonly onDirections?: (waypoint: PersonalWaypoint) => void
  readonly onSearchFilterChange?: (active: boolean) => void
  readonly onRemove: (waypointId: string) => void
  readonly onMove: (waypointId: string, targetIndex: number) => boolean
  readonly onEditAnnouncement?: (message: string) => void
}

export function PersonalWaypointList({
  waypoints,
  category,
  canEdit,
  editing,
  categoryPicker,
  onFocusWaypoint,
  onDirections,
  onSearchFilterChange,
  onRemove,
  onMove,
  onEditAnnouncement,
}: PersonalWaypointListProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [keyboardReorder, setKeyboardReorder] = useState<KeyboardReorderState | null>(null)
  const previousEditing = useRef(editing)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const handleRefs = useRef(new Map<string, HTMLButtonElement>())
  const pendingFocusRef = useRef<{ readonly waypointId: string; readonly action: 'reorder' | 'remove' } | null>(null)
  const categoryView = category !== undefined
  const activeCategory = categoryView ? category : ''
  const hasSearchFilter = searchQuery.trim().length > 0
  const visibleWaypoints = useMemo(() => filterPersonalWaypoints(
    waypoints,
    searchQuery,
    activeCategory || null,
  ), [activeCategory, searchQuery, waypoints])
  const editMode = canEdit && editing && waypoints.length > 0
  const canReorder = editMode && waypoints.length > 1 && !hasSearchFilter && !categoryView

  const changeSearchQuery = (query: string): void => {
    setSearchQuery(query)
    onSearchFilterChange?.(query.trim().length > 0)
  }

  useEffect(() => {
    if (previousEditing.current === editing) return
    previousEditing.current = editing
    onEditAnnouncement?.(editing ? 'Edit mode.' : 'List mode.')
  }, [editing, onEditAnnouncement])

  useEffect(() => () => onSearchFilterChange?.(false), [onSearchFilterChange])

  useLayoutEffect(() => {
    const pendingFocus = pendingFocusRef.current
    if (!pendingFocus) return
    pendingFocusRef.current = null

    if (pendingFocus.action === 'remove') {
      searchInputRef.current?.focus()
    } else {
      handleRefs.current.get(pendingFocus.waypointId)?.focus()
    }
  })

  const registerHandleRef = useCallback((waypointId: string, element: HTMLButtonElement | null) => {
    if (element) handleRefs.current.set(waypointId, element)
    else handleRefs.current.delete(waypointId)
  }, [])

  const handleReorderKeyDown = (
    waypointId: string,
    index: number,
    event: KeyboardEvent<HTMLButtonElement>,
  ): void => {
    if (!canReorder) return
    const isSpaceKey = event.key === ' ' || event.key === 'Space' || event.code === 'Space'
    const waypoint = waypoints.find(({ id }) => id === waypointId)
    if (!waypoint) return

    if (keyboardReorder) {
      if (keyboardReorder.waypointId !== waypointId) return

      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        event.preventDefault()
        const direction = event.key === 'ArrowUp' ? -1 : 1
        const currentIndex = Math.max(0, Math.min(waypoints.length - 1, keyboardReorder.currentIndex + direction))
        if (currentIndex === keyboardReorder.currentIndex) {
          onEditAnnouncement?.(`${waypoint.name} is at position ${currentIndex + 1} of ${waypoints.length}.`)
          return
        }
        setKeyboardReorder({ ...keyboardReorder, currentIndex })
        onEditAnnouncement?.(`${waypoint.name}, position ${currentIndex + 1} of ${waypoints.length}.`)
        return
      }

      if (event.key === 'Escape') {
        event.preventDefault()
        setKeyboardReorder(null)
        onEditAnnouncement?.(`Reordering ${waypoint.name} canceled.`)
        return
      }

      if (isSpaceKey || event.key === 'Enter') {
        event.preventDefault()
        const targetIndex = keyboardReorder.currentIndex
        setKeyboardReorder(null)
        if (targetIndex === keyboardReorder.startIndex) {
          onEditAnnouncement?.(`${waypoint.name} remains at position ${targetIndex + 1} of ${waypoints.length}.`)
          return
        }

        if (!onMove(waypointId, targetIndex)) {
          onEditAnnouncement?.(`Could not save the new position for ${waypoint.name}.`)
          return
        }

        pendingFocusRef.current = { waypointId, action: 'reorder' }
        onEditAnnouncement?.(`${waypoint.name} moved to position ${targetIndex + 1} of ${waypoints.length}.`)
      }
      return
    }

    if (!isSpaceKey && event.key !== 'Enter') return
    event.preventDefault()
    setKeyboardReorder({ waypointId, startIndex: index, currentIndex: index })
    onEditAnnouncement?.(`Picked up ${waypoint.name}, position ${index + 1} of ${waypoints.length}. Use the arrow keys to move it. Press Enter or Space to save, or Escape to cancel.`)
  }

  const keyboardPreviewWaypoints = keyboardReorder
    ? arrayMove([...visibleWaypoints], keyboardReorder.startIndex, keyboardReorder.currentIndex)
    : visibleWaypoints
  const handleDragEnd = (event: DragEndEvent): void => {
    const source = event.operation.source
    if (!source) return
    const waypointId = String(source.id)
    const waypoint = waypoints.find(({ id }) => id === waypointId)
    const originalIndex = waypoints.findIndex(({ id }) => id === waypointId)
    if (!waypoint || originalIndex < 0) return

    if (event.canceled || !event.operation.target || !canReorder) {
      onEditAnnouncement?.(`Reordering ${waypoint.name} canceled.`)
      handleRefs.current.get(waypointId)?.focus()
      return
    }

    const reordered = move([...waypoints], event)
    const targetIndex = reordered.findIndex(({ id }) => id === waypointId)
    if (targetIndex < 0 || targetIndex === originalIndex) {
      onEditAnnouncement?.(`${waypoint.name} remains at position ${originalIndex + 1} of ${waypoints.length}.`)
      handleRefs.current.get(waypointId)?.focus()
      return
    }

    const saved = onMove(waypointId, targetIndex)
    if (!saved) {
      onEditAnnouncement?.(`Could not save the new position for ${waypoint.name}.`)
      handleRefs.current.get(waypointId)?.focus()
      return
    }

    pendingFocusRef.current = { waypointId, action: 'reorder' }
    onEditAnnouncement?.(`${waypoint.name} moved to position ${targetIndex + 1} of ${waypoints.length}.`)
  }

  const listRows = <ul
    className="personal-waypoint-list-rows"
    data-editing={editMode ? 'true' : 'false'}
    tabIndex={0}
    aria-label={categoryView ? `Saved Personal Waypoints in ${category}` : 'Saved Personal Waypoints'}
  >
    {keyboardPreviewWaypoints.map((waypoint, index) => {
      const rowProps = {
        waypoint,
        editing: editMode,
        handleDisabled: !canReorder || Boolean(keyboardReorder && keyboardReorder.waypointId !== waypoint.id),
        keyboardReordering: keyboardReorder?.waypointId === waypoint.id,
        index,
        handleDescriptionId: reorderInstructionsId,
        onHandleKeyDown: handleReorderKeyDown,
        onRemove: (id: string) => {
          pendingFocusRef.current = { waypointId: id, action: 'remove' }
          onRemove(id)
        },
        onFocusWaypoint,
        onDirections,
        onHandleRef: registerHandleRef,
      }

      return canReorder ? (
        <PersonalWaypointSortableListRow key={waypoint.id} {...rowProps} index={index} />
      ) : (
        <PersonalWaypointListRow key={waypoint.id} {...rowProps} />
      )
    })}
  </ul>

  return <section className="personal-waypoint-list" aria-label={categoryView ? `Saved places in ${category}` : 'Saved places'}>
    <div className="personal-waypoint-list-controls">
      <div className="personal-waypoint-list-search">
        <SearchField
          aria-label={categoryView ? `Search ${category} places` : 'Search saved places'}
          placeholder={categoryView ? `Search ${category} places` : 'Search saved places'}
          inputRef={searchInputRef}
          value={searchQuery}
          onChange={(event) => changeSearchQuery(event.target.value)}
        />
      </div>
      {categoryPicker}
    </div>

    {editMode && (hasSearchFilter || categoryView) && (
      <p className="personal-waypoint-list-filter-note">
        {categoryView
          ? 'Return to All places to reorder saved places.'
          : 'Clear search to reorder or clear all saved places.'}
      </p>
    )}

    {visibleWaypoints.length > 0 ? (
      <>
        {editMode && <p id={reorderInstructionsId} className="visually-hidden">
          Press Space or Enter to start reordering. Use the Up and Down arrow keys to change position. Press Space or Enter to save, or Escape to cancel.
        </p>}
        {canReorder ? (
          <DragDropProvider sensors={[PointerSensor]} onDragEnd={handleDragEnd}>
            {listRows}
          </DragDropProvider>
        ) : listRows}
      </>
    ) : (
      <div className="personal-waypoint-list-empty">
        <p>No waypoints match this search.</p>
        <Button label="Clear search" onClick={() => changeSearchQuery('')} />
      </div>
    )}
  </section>
}
