import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { KeyboardEvent } from 'react'
import { move } from '@dnd-kit/helpers'
import { DragDropProvider, PointerSensor } from '@dnd-kit/react'
import type { DragEndEvent } from '@dnd-kit/react'
import type { PersonalWaypoint } from '../../../../domain/waypoints/personal/personal-waypoint'
import { Button } from '../../../../ui/button'
import { DisclosureHeader } from '../../../../ui/disclosure-header'
import { SearchField } from '../../../../ui/search-field'
import { filterPersonalWaypoints } from '../data/filter-personal-waypoints'
import { groupPersonalWaypointsByCategory, personalWaypointCountLabel } from '../data/group-personal-waypoints'
import {
  PersonalWaypointListRow,
  PersonalWaypointSortableListRow,
} from './personal-waypoint-list-row'

const reorderInstructionsId = 'personal-waypoint-reorder-instructions'
const expandedCategoriesStorageKey = 'navus:personal-waypoint-expanded-categories:v1'

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
  /** When set, the list shows only that category and drops the group headings. */
  readonly category?: string
  readonly canEdit: boolean
  readonly editing: boolean
  readonly categoryPicker?: ReactNode
  readonly onOpenDetails: (waypoint: PersonalWaypoint, trigger: HTMLElement) => void
  readonly onOpenCategory: (category: string) => void
  readonly onSearchFilterChange?: (active: boolean) => void
  readonly onRemove: (waypointId: string) => void
  readonly onMove: (waypointId: string, targetIndex: number) => boolean
  readonly onEditAnnouncement?: (message: string) => void
}

/**
 * One category's rows. It is a component rather than a render helper so the ref writes that queue a
 * focus restore happen inside event handlers instead of during the parent's render.
 */
function PersonalWaypointRowList({
  categoryWaypoints,
  categoryView,
  category,
  waypoints,
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
  readonly categoryWaypoints: readonly PersonalWaypoint[]
  readonly categoryView: boolean
  readonly category?: string
  readonly waypoints: readonly PersonalWaypoint[]
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
  return (
    <ul
      className="personal-waypoint-list-rows"
      data-editing={editMode ? 'true' : 'false'}
      aria-label={categoryView ? `Saved places in ${category}` : 'Saved places'}
    >
      {categoryWaypoints.map((waypoint) => {
        const index = waypoints.findIndex(({ id }) => id === waypoint.id)
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
          <PersonalWaypointSortableListRow key={waypoint.id} {...rowProps} />
        ) : (
          <PersonalWaypointListRow key={waypoint.id} {...rowProps} />
        )
      })}
    </ul>
  )
}

export function PersonalWaypointList({
  waypoints,
  category,
  canEdit,
  editing,
  categoryPicker,
  onOpenDetails,
  onOpenCategory,
  onSearchFilterChange,
  onRemove,
  onMove,
  onEditAnnouncement,
}: PersonalWaypointListProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedCategories, setExpandedCategories] = useState<string[]>(readExpandedCategories)
  const [collapsedEditCategories, setCollapsedEditCategories] = useState<string[]>([])
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
  const groups = useMemo(() => groupPersonalWaypointsByCategory(visibleWaypoints), [visibleWaypoints])
  const editMode = canEdit && editing && waypoints.length > 0
  const canReorder = editMode && waypoints.length > 1 && !hasSearchFilter && !categoryView

  const changeSearchQuery = (query: string): void => {
    setSearchQuery(query)
    onSearchFilterChange?.(query.trim().length > 0)
  }

  const setCategoryExpanded = (name: string, expanded: boolean): void => {
    setExpandedCategories((current) => {
      const next = expanded
        ? [...new Set([...current, name])]
        : current.filter((entry) => entry !== name)
      writeExpandedCategories(next)
      return next
    })
  }

  const expandAll = (): void => {
    const names = groupPersonalWaypointsByCategory(waypoints).map(({ category: name }) => name)
    setCollapsedEditCategories([])
    setExpandedCategories(names)
    writeExpandedCategories(names)
  }

  const collapseAll = (): void => {
    if (editMode) setCollapsedEditCategories(groups.map(({ category: name }) => name))
    setExpandedCategories([])
    writeExpandedCategories([])
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

        // `moveWaypoint` splices the place out and re-inserts it at the FINAL flat index. Stepping
        // within a category means displacing whichever place currently sits at the destination
        // position, so the final index is that neighbour's flat index. Using the moved place's own
        // index would point at where it already is and save nothing.
        const neighbour = groupWaypoints[targetPosition]
        const targetIndex = waypoints.findIndex(({ id }) => id === neighbour.id)
        if (!onMove(waypointId, targetIndex)) {
          onEditAnnouncement?.(`Could not save the new position for ${waypoint.name}.`)
          return
        }

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

    if (!onMove(waypointId, targetIndex)) {
      onEditAnnouncement?.(`Could not save the new position for ${waypoint.name}.`)
      handleRefs.current.get(waypointId)?.focus()
      return
    }

    pendingFocusRef.current = { waypointId, action: 'reorder' }
    onEditAnnouncement?.(`${waypoint.name} moved to position ${targetIndex + 1} of ${waypoints.length}.`)
  }

  const queueRemoveFocus = useCallback((waypointId: string): void => {
    pendingFocusRef.current = { waypointId, action: 'remove' }
  }, [])

  const renderRows = (categoryWaypoints: readonly PersonalWaypoint[]) => (
    <PersonalWaypointRowList
      categoryWaypoints={categoryWaypoints}
      categoryView={categoryView}
      category={category}
      waypoints={waypoints}
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

  const reorderInstructions = editMode
    ? <p id={reorderInstructionsId} className="visually-hidden">
      Press Space or Enter to start reordering. Use the Up and Down arrow keys to change position. Press Space or Enter to save, or Escape to cancel.
    </p>
    : null

  return <section className="personal-waypoint-list" aria-label={categoryView ? `Saved places in ${category}` : 'Saved places'}>
    <div className="personal-waypoint-list-controls">
      <SearchField
        aria-label={categoryView ? `Search ${category} places` : 'Search saved places'}
        placeholder={categoryView ? `Search ${category} places` : 'Search saved places'}
        inputRef={searchInputRef}
        value={searchQuery}
        onChange={(event) => changeSearchQuery(event.target.value)}
      />
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
        {reorderInstructions}
        {canReorder ? <DragDropProvider sensors={[PointerSensor]} onDragEnd={handleDragEnd}>
          {categoryView ? renderRows(visibleWaypoints) : groups.map(({ category: name, waypoints: grouped }) => {
            const expanded = !collapsedEditCategories.includes(name)
            return <section className="personal-waypoint-category-group" key={name}>
              <DisclosureHeader
                id={categoryHeadingId(name)}
                label={name}
                detail={personalWaypointCountLabel(grouped.length)}
                expanded={expanded}
                controls={categoryListId(name)}
                expandDisabled={hasSearchFilter}
                onToggle={() => {
                  setCollapsedEditCategories((current) => current.includes(name)
                    ? current.filter((entry) => entry !== name)
                    : [...current, name])
                  setCategoryExpanded(name, !expanded)
                }}
              />
              <div hidden={!expanded}>{renderRows(grouped)}</div>
            </section>
          })}
        </DragDropProvider> : categoryView ? renderRows(visibleWaypoints) : <>
          {!hasSearchFilter && <div className="personal-waypoint-groups-actions">
            <Button label="Expand all" variant="ghost" onClick={expandAll} />
            <Button label="Collapse all" variant="ghost" onClick={collapseAll} />
          </div>}
          <div className="personal-waypoint-groups">
          {groups.map(({ category: name, waypoints: grouped }) => {
            const expanded = hasSearchFilter || (editMode
              ? !collapsedEditCategories.includes(name)
              : expandedCategories.includes(name))
            return <section className="personal-waypoint-category-group" key={name}>
              <DisclosureHeader
                id={categoryHeadingId(name)}
                label={name}
                detail={personalWaypointCountLabel(grouped.length)}
                expanded={expanded}
                controls={categoryListId(name)}
                expandDisabled={hasSearchFilter}
                onToggle={() => setCategoryExpanded(name, !expanded)}
                onOpen={() => onOpenCategory(name)}
                openLabel={`Open ${name}, ${personalWaypointCountLabel(grouped.length)}`}
              />
              <div id={categoryListId(name)} hidden={!expanded}>{renderRows(grouped)}</div>
            </section>
          })}
          </div>
        </>}
      </>
    ) : (
      <div className="personal-waypoint-list-empty">
        <p>{hasSearchFilter ? 'No saved places match this search.' : 'No saved places yet.'}</p>
        {hasSearchFilter && <Button label="Clear search" variant="ghost" onClick={() => changeSearchQuery('')} />}
      </div>
    )}
  </section>
}
