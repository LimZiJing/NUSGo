import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { KeyboardEvent } from 'react'
import { DragDropProvider, PointerSensor } from '@dnd-kit/react'
import type { DragEndEvent, DragOverEvent } from '@dnd-kit/react'
import type { PersonalWaypoint } from '../../../../domain/waypoints/personal/personal-waypoint'
import { Button } from '../../../../ui/button'
import { ConfirmDialog } from '../../../../ui/confirm-dialog'
import { SearchField } from '../../../../ui/search-field'
import { categoryMergeConfirmation } from '../../../../domain/waypoints/personal/personal-waypoint-category-rename'
import { filterPersonalWaypoints } from '../data/filter-personal-waypoints'
import { groupPersonalWaypointsByCategory } from '../data/group-personal-waypoints'
import { PersonalWaypointCategoryGroup } from './personal-waypoint-category-group'
import {
  PersonalWaypointListRow,
  PersonalWaypointSortableListRow,
} from './personal-waypoint-list-row'

const reorderInstructionsId = 'personal-waypoint-reorder-instructions'
const expandedCategoriesStorageKey = 'navus:personal-waypoint-expanded-categories:v1'
/** How long a dragged place must rest over a collapsed category before it opens. */
const hoverExpandDelayMs = 1500

interface KeyboardReorderState {
  readonly waypointId: string
  readonly startIndex: number
  readonly currentIndex: number
  readonly category: string
}

function readExpandedCategories(): string[] {
  try {
    const raw = window.localStorage.getItem(expandedCategoriesStorageKey)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : []
  } catch {
    // Expansion memory is a convenience; storage being unavailable must not break the list.
    return []
  }
}

function writeExpandedCategories(categories: readonly string[]): void {
  try {
    window.localStorage.setItem(expandedCategoriesStorageKey, JSON.stringify(categories))
  } catch {
    // Storage is optional. Falling back to in-memory state is acceptable here.
  }
}

function categoryListId(category: string): string {
  return `waypoint-category-list-${encodeURIComponent(category)}`
}

function categoryHeadingId(category: string): string {
  return `waypoint-category-heading-${encodeURIComponent(category)}`
}

interface PersonalWaypointListProps {
  readonly waypoints: readonly PersonalWaypoint[]
  readonly canEdit: boolean
  readonly editing: boolean
  readonly categoryPicker?: ReactNode
  /** Categories to keep on screen while editing, including ones the pending edits have emptied. */
  readonly editingCategories?: readonly string[]
  readonly onOpenDetails: (waypoint: PersonalWaypoint, trigger: HTMLElement) => void
  readonly onSearchFilterChange?: (active: boolean) => void
  readonly onRemove: (waypointId: string) => void
  /** Reorders within a category, or moves to another category when the destination differs. */
  readonly onMove: (waypointId: string, category: string) => void
  readonly onReorder: (waypointId: string, targetIndex: number) => void
  readonly onEditAnnouncement?: (message: string) => void
  /** Renames (or merges) a category. Returns the saved collection, or null when nothing was written. */
  readonly onRenameCategory?: (from: string, to: string) => readonly PersonalWaypoint[] | null
  /** Reports whether the merged category will be shown on the map, or null when unknown. */
  readonly onMergeCategoryVisibility?: (from: string, to: string) => boolean | null
}

/**
 * One category's rows. It is a component rather than a render helper so the ref writes that queue a
 * focus restore happen inside event handlers instead of during the parent's render.
 */
function PersonalWaypointRowList({
  category,
  categoryWaypoints,
  editMode,
  canReorder,
  keyboardReorder,
  handleDescriptionId,
  onHandleKeyDown,
  onQueueRemoveFocus,
  onRemove,
  onOpenDetails,
  registerHandleRef,
}: {
  readonly category: string
  readonly categoryWaypoints: readonly PersonalWaypoint[]
  readonly editMode: boolean
  readonly canReorder: boolean
  readonly keyboardReorder: KeyboardReorderState | null
  readonly handleDescriptionId: string
  readonly onHandleKeyDown: (waypointId: string, event: KeyboardEvent<HTMLButtonElement>) => void
  readonly onQueueRemoveFocus: (waypointId: string) => void
  readonly onRemove: (waypointId: string) => void
  readonly onOpenDetails: (waypoint: PersonalWaypoint, trigger: HTMLElement) => void
  readonly registerHandleRef: (waypointId: string, element: HTMLButtonElement | null) => void
}) {
  if (categoryWaypoints.length === 0) {
    // An emptied category stays droppable, so it says what it is for rather than showing a bare gap.
    return <p className="personal-waypoint-category-empty">
      No places. Drop one here to move it into this category.
    </p>
  }

  return (
    <ul
      className="personal-waypoint-list-rows"
      data-editing={editMode ? 'true' : 'false'}
      aria-label="Saved places"
    >
      {categoryWaypoints.map((waypoint, index) => {
        const rowProps = {
          waypoint,
          editing: editMode,
          handleDisabled: !canReorder || Boolean(keyboardReorder && keyboardReorder.waypointId !== waypoint.id),
          keyboardReordering: keyboardReorder?.waypointId === waypoint.id,
          index,
          handleDescriptionId,
          onHandleKeyDown,
          onRemove: (id: string) => {
            onQueueRemoveFocus(id)
            onRemove(id)
          },
          onOpenDetails,
          onHandleRef: registerHandleRef,
        }

        return canReorder ? (
          <PersonalWaypointSortableListRow key={waypoint.id} group={category} {...rowProps} />
        ) : (
          <PersonalWaypointListRow key={waypoint.id} {...rowProps} />
        )
      })}
    </ul>
  )
}

export function PersonalWaypointList({
  waypoints,
  canEdit,
  editing,
  categoryPicker,
  editingCategories,
  onOpenDetails,
  onSearchFilterChange,
  onRemove,
  onMove,
  onReorder,
  onEditAnnouncement,
  onRenameCategory,
  onMergeCategoryVisibility,
}: PersonalWaypointListProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedCategories, setExpandedCategories] = useState<string[]>(readExpandedCategories)
  const [collapsedEditCategories, setCollapsedEditCategories] = useState<string[]>([])
  const [keyboardReorder, setKeyboardReorder] = useState<KeyboardReorderState | null>(null)
  const [mergeRequest, setMergeRequest] = useState<{ readonly from: string; readonly to: string } | null>(null)
  const [hoverCategory, setHoverCategory] = useState<string | null>(null)
  const previousEditing = useRef(editing)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const handleRefs = useRef(new Map<string, HTMLButtonElement>())
  const pendingFocusRef = useRef<{ readonly waypointId: string; readonly action: 'reorder' | 'remove' } | null>(null)
  const hoverTimerRef = useRef<number | null>(null)
  const hasSearchFilter = searchQuery.trim().length > 0
  const visibleWaypoints = useMemo(
    () => filterPersonalWaypoints(waypoints, searchQuery, null),
    [searchQuery, waypoints],
  )
  const groups = useMemo(() => groupPersonalWaypointsByCategory(visibleWaypoints), [visibleWaypoints])
  const editMode = canEdit && editing && waypoints.length > 0
  const canReorder = editMode && waypoints.length > 1 && !hasSearchFilter

  // A category the pending edits have emptied keeps its place in the list, so it remains a drop
  // target. It is appended rather than merged into the group order because it has no places left.
  const emptyEditingCategories = (editingCategories ?? []).filter(
    (category) => !groups.some((group) => group.category === category),
  )

  // A rename that lands on an existing category merges the two, so it asks first.
  const requestRenameCategory = (from: string, to: string): void => {
    const taken = waypoints.some((waypoint) => waypoint.category.trim() === to)
    if (taken) {
      setMergeRequest({ from, to })
      return
    }
    const saved = onRenameCategory?.(from, to) ?? null
    onEditAnnouncement?.(saved ? `Renamed ${from} to ${to}.` : `Could not rename ${from}.`)
  }

  const confirmMerge = (): void => {
    const request = mergeRequest
    if (!request) return
    setMergeRequest(null)
    const saved = onRenameCategory?.(request.from, request.to) ?? null
    if (!saved) {
      onEditAnnouncement?.(`Could not merge ${request.from} into ${request.to}.`)
      return
    }
    const visibleAfter = onMergeCategoryVisibility?.(request.from, request.to) ?? null
    // A null answer means the visibility could not be read or saved, so name the problem instead
    // of claiming the merged category is shown or hidden.
    onEditAnnouncement?.(visibleAfter === null
      ? `Merged ${request.from} into ${request.to}. Its map visibility could not be saved.`
      : `Merged ${request.from} into ${request.to}. ${categoryMergeConfirmation(visibleAfter)}.`)
  }

  const changeSearchQuery = (query: string): void => {
    setSearchQuery(query)
    onSearchFilterChange?.(query.trim().length > 0)
  }

  const isCategoryExpanded = (name: string): boolean => (
    hasSearchFilter || (editMode
      ? !collapsedEditCategories.includes(name)
      : expandedCategories.includes(name))
  )

  const setCategoryExpanded = (name: string, expanded: boolean): void => {
    if (editMode) {
      setCollapsedEditCategories((current) => expanded
        ? current.filter((entry) => entry !== name)
        : [...new Set([...current, name])])
    }
    setExpandedCategories((current) => {
      const next = expanded
        ? [...new Set([...current, name])]
        : current.filter((entry) => entry !== name)
      writeExpandedCategories(next)
      return next
    })
  }

  const expandAll = (): void => {
    const names = [...new Set([...groupPersonalWaypointsByCategory(waypoints).map(({ category }) => category), ...emptyEditingCategories])]
    setCollapsedEditCategories([])
    setExpandedCategories(names)
    writeExpandedCategories(names)
  }

  const collapseAll = (): void => {
    if (editMode) setCollapsedEditCategories([...groups.map(({ category }) => category), ...emptyEditingCategories])
    setExpandedCategories([])
    writeExpandedCategories([])
  }

  useEffect(() => {
    if (previousEditing.current === editing) return
    previousEditing.current = editing
    onEditAnnouncement?.(editing ? 'Edit mode.' : 'List mode.')
  }, [editing, onEditAnnouncement])

  useEffect(() => () => onSearchFilterChange?.(false), [onSearchFilterChange])

  // Only disposes the timer on unmount. The highlight itself is cleared by the drag handlers and by
  // leaving edit mode, so no state is set here.
  useEffect(() => () => {
    if (hoverTimerRef.current !== null) window.clearTimeout(hoverTimerRef.current)
  }, [])

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

  // Keyboard reordering is scoped to the place's own category, so its announcements count that
  // category's places rather than the whole collection.
  const handleReorderKeyDown = (
    waypointId: string,
    event: KeyboardEvent<HTMLButtonElement>,
  ): void => {
    if (!canReorder) return
    const isSpaceKey = event.key === ' ' || event.key === 'Space' || event.code === 'Space'
    const waypoint = waypoints.find(({ id }) => id === waypointId)
    if (!waypoint) return
    // A key that is neither the pick-up key nor part of an active reorder does nothing.
    if (!keyboardReorder && !isSpaceKey && event.key !== 'Enter') return

    if (keyboardReorder && keyboardReorder.waypointId === waypointId) {
      const group = groupPersonalWaypointsByCategory(waypoints).find(({ category: name }) => name === waypoint.category)
      const groupWaypoints = group?.waypoints ?? [waypoint]
      const position = keyboardReorder.currentIndex

      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        event.preventDefault()
        const direction = event.key === 'ArrowUp' ? -1 : 1
        const nextPosition = Math.max(0, Math.min(groupWaypoints.length - 1, position + direction))
        if (nextPosition === position) {
          onEditAnnouncement?.(`${waypoint.name} is at position ${position + 1} of ${groupWaypoints.length}.`)
          return
        }
        setKeyboardReorder({ ...keyboardReorder, currentIndex: nextPosition })
        onEditAnnouncement?.(`${waypoint.name}, position ${nextPosition + 1} of ${groupWaypoints.length}.`)
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
        const startIndex = keyboardReorder.startIndex
        const targetPosition = keyboardReorder.currentIndex
        setKeyboardReorder(null)
        if (targetPosition === startIndex) {
          onEditAnnouncement?.(`${waypoint.name} remains at position ${targetPosition + 1} of ${groupWaypoints.length}.`)
          return
        }

        // Reordering is a flat-index operation, so stepping within a category means displacing
        // whichever place currently sits at the destination position. Using the moved place's own
        // index would point at where it already is and save nothing.
        const neighbour = groupWaypoints[targetPosition]
        const targetIndex = waypoints.findIndex(({ id }) => id === neighbour.id)
        onReorder(waypointId, targetIndex)
        pendingFocusRef.current = { waypointId, action: 'reorder' }
        onEditAnnouncement?.(`${waypoint.name} moved to position ${targetPosition + 1} of ${groupWaypoints.length}.`)
      }
      return
    }

    if (!isSpaceKey && event.key !== 'Enter') return
    event.preventDefault()
    const group = groupPersonalWaypointsByCategory(waypoints).find(({ category: name }) => name === waypoint.category)
    const groupWaypoints = group?.waypoints ?? [waypoint]
    const startIndex = groupWaypoints.findIndex(({ id }) => id === waypointId)
    setKeyboardReorder({ waypointId, startIndex, currentIndex: startIndex, category: waypoint.category })
    onEditAnnouncement?.(`Picked up ${waypoint.name}, position ${startIndex + 1} of ${groupWaypoints.length}. Use the arrow keys to move it. Press Enter or Space to save, or Escape to cancel.`)
  }

  const clearHoverTimer = (): void => {
    if (hoverTimerRef.current !== null) window.clearTimeout(hoverTimerRef.current)
    hoverTimerRef.current = null
  }

  /**
   * The category whose card contains a point, from the rendered geometry.
   *
   * The drag's own collision result cannot answer this: a sortable row is a droppable too, and it
   * wins the collision against the card around it, so the reported target is always whichever row
   * sits under the pointer — usually the dragged row itself. Reading the cards' rectangles instead
   * gives the category the person is visibly dragging over, which is also what the highlight shows.
   */
  const categoryAtPoint = (point: { readonly x: number; readonly y: number } | null): string | null => {
    if (!point) return null
    for (const element of document.querySelectorAll<HTMLElement>('.personal-waypoint-category-group')) {
      const box = element.getBoundingClientRect()
      const inside = point.x >= box.left && point.x <= box.right && point.y >= box.top && point.y <= box.bottom
      if (!inside) continue
      // The card carries its category on its own heading, which is the same string the list groups by.
      return element.querySelector('.disclosure-header-label')?.textContent?.trim() ?? null
    }
    return null
  }

  // Every drag starts with no highlight, so a previous drag can never leak one into this one.
  const handleDragStart = (): void => {
    setHoverCategory(null)
    clearHoverTimer()
  }

  // Resting over a collapsed category highlights it and, after a short dwell, opens it so its rows
  // become reachable without dropping blind. Leaving the card cancels both.
  const handleDragOver = (event: DragOverEvent): void => {
    const category = canReorder ? categoryAtPoint(event.operation.position.current) : null
    if (!category) {
      clearHoverTimer()
      setHoverCategory(null)
      return
    }
    if (category === hoverCategory) return

    clearHoverTimer()
    setHoverCategory(category)
    if (isCategoryExpanded(category)) return

    hoverTimerRef.current = window.setTimeout(() => {
      hoverTimerRef.current = null
      setCategoryExpanded(category, true)
      onEditAnnouncement?.(`${category} expanded.`)
    }, hoverExpandDelayMs)
  }

  const handleDragEnd = (event: DragEndEvent): void => {
    // Where the pointer finished, resolved against the cards. This is the category the bounding box
    // was drawn around, so the place lands where the highlight said it would.
    const droppedOnCategory = categoryAtPoint(event.operation.position.current) ?? hoverCategory
    clearHoverTimer()
    setHoverCategory(null)

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

    // Dropping onto a different category card is a move.
    if (droppedOnCategory && droppedOnCategory !== waypoint.category.trim()) {
      onMove(waypointId, droppedOnCategory)
      handleRefs.current.get(waypointId)?.focus()
      onEditAnnouncement?.(`${waypoint.name} moved to ${droppedOnCategory}.`)
      return
    }

    // Otherwise the drop reorders within the current category. The saved order is flat while the
    // screen is grouped, so the destination is the flat index of whichever place now sits where the
    // dragged one was dropped.
    const targetWaypointId = event.operation.target.id === undefined ? null : String(event.operation.target.id)
    const targetIndex = targetWaypointId === null
      ? originalIndex
      : waypoints.findIndex(({ id }) => id === targetWaypointId)
    if (targetIndex < 0 || targetIndex === originalIndex) {
      onEditAnnouncement?.(`${waypoint.name} remains at position ${originalIndex + 1} of ${waypoints.length}.`)
      handleRefs.current.get(waypointId)?.focus()
      return
    }

    onReorder(waypointId, targetIndex)
    pendingFocusRef.current = { waypointId, action: 'reorder' }
    onEditAnnouncement?.(`${waypoint.name} moved to position ${targetIndex + 1} of ${waypoints.length}.`)
  }

  const queueRemoveFocus = useCallback((waypointId: string): void => {
    pendingFocusRef.current = { waypointId, action: 'remove' }
  }, [])

  const renderRows = (category: string, categoryWaypoints: readonly PersonalWaypoint[]) => (
    <PersonalWaypointRowList
      category={category}
      categoryWaypoints={categoryWaypoints}
      editMode={editMode}
      canReorder={canReorder}
      keyboardReorder={keyboardReorder}
      handleDescriptionId={reorderInstructionsId}
      onHandleKeyDown={handleReorderKeyDown}
      onQueueRemoveFocus={queueRemoveFocus}
      onRemove={onRemove}
      onOpenDetails={onOpenDetails}
      registerHandleRef={registerHandleRef}
    />
  )

  const renderGroup = (category: string, categoryWaypoints: readonly PersonalWaypoint[]) => (
    <PersonalWaypointCategoryGroup
      key={category}
      category={category}
      waypoints={categoryWaypoints}
      expanded={isCategoryExpanded(category)}
      listId={categoryListId(category)}
      headingId={categoryHeadingId(category)}
      highlighted={hoverCategory === category}
      expandDisabled={hasSearchFilter}
      onToggle={() => setCategoryExpanded(category, !isCategoryExpanded(category))}
      onRename={onRenameCategory && editMode ? (next) => requestRenameCategory(category, next) : undefined}
    >
      {renderRows(category, categoryWaypoints)}
    </PersonalWaypointCategoryGroup>
  )

  const reorderInstructions = editMode
    ? <p id={reorderInstructionsId} className="visually-hidden">
      Press Space or Enter to start reordering. Use the Up and Down arrow keys to change position. Press Space or Enter to save, or Escape to cancel.
    </p>
    : null

  const noGroupsAtAll = groups.length === 0 && emptyEditingCategories.length === 0

  return <section className="personal-waypoint-list" aria-label="Saved places">
    <div className="personal-waypoint-list-controls">
      <SearchField
        aria-label="Search saved places"
        placeholder="Search saved places"
        inputRef={searchInputRef}
        value={searchQuery}
        onChange={(event) => changeSearchQuery(event.target.value)}
      />
      {categoryPicker}
    </div>

    {editMode && hasSearchFilter && (
      <p className="personal-waypoint-list-filter-note">
        Clear search to reorder or move saved places.
      </p>
    )}

    {!noGroupsAtAll ? (
      <>
        {reorderInstructions}
        {canReorder ? (
          <DragDropProvider sensors={[PointerSensor]} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
            {groups.map(({ category, waypoints: grouped }) => renderGroup(category, grouped))}
            {emptyEditingCategories.map((category) => renderGroup(category, []))}
          </DragDropProvider>
        ) : (
          <>
            {!hasSearchFilter && <div className="personal-waypoint-groups-actions">
              <Button label="Expand all" variant="ghost" onClick={expandAll} />
              <Button label="Collapse all" variant="ghost" onClick={collapseAll} />
            </div>}
            <div className="personal-waypoint-groups">
              {groups.map(({ category, waypoints: grouped }) => renderGroup(category, grouped))}
              {editMode && emptyEditingCategories.map((category) => renderGroup(category, []))}
            </div>
          </>
        )}
      </>
    ) : (
      <div className="personal-waypoint-list-empty">
        <p>{hasSearchFilter ? 'No saved places match this search.' : 'No saved places yet.'}</p>
        {hasSearchFilter && <Button label="Clear search" variant="ghost" onClick={() => changeSearchQuery('')} />}
      </div>
    )}
    <ConfirmDialog
      open={mergeRequest !== null}
      title={mergeRequest ? `Merge “${mergeRequest.from}” into “${mergeRequest.to}”?` : 'Merge categories?'}
      confirmLabel="Merge categories"
      onConfirm={confirmMerge}
      onCancel={() => setMergeRequest(null)}
    >
      {mergeRequest && <p>
        {mergeRequest.to} already exists. Its places stay first, then {mergeRequest.from}'s. No places are lost.
      </p>}
    </ConfirmDialog>
  </section>
}
