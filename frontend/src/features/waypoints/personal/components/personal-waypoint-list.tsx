import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { KeyboardEvent } from 'react'
import { arrayMove, move } from '@dnd-kit/helpers'
import { DragDropProvider, PointerSensor, useDroppable } from '@dnd-kit/react'
import type { DragDropManager } from '@dnd-kit/react'
import type { DragEndEvent } from '@dnd-kit/react'
import type { PersonalWaypoint } from '../../../../domain/waypoints/personal/personal-waypoint'
import { Button, IconButton } from '../../../../ui/button'
import { SearchField } from '../../../../ui/search-field'
import { MenuItem } from '../../../../ui/menu-item'
import { EllipsisVerticalIcon, MapIcon, PlusIcon } from '../../../../ui/icons'
import { filterPersonalWaypoints } from '../data/filter-personal-waypoints'
import {
  PersonalWaypointListRow,
  PersonalWaypointSortableListRow,
} from './personal-waypoint-list-row'

const reorderInstructionsId = 'personal-waypoint-reorder-instructions'
const expandedCategoriesStorageKey = 'navus:personal-waypoints:expanded-categories:v1'

// Insertion position within a category, derived from the pointer against visible row midpoints.
// Rows are passed in final order with the moved waypoint already excluded, so the count of
// midpoints above the pointer is exactly the insertion index.
// eslint-disable-next-line react-refresh/only-export-components
export function resolveInsertionIndexFromPointer(
  rowMidpoints: readonly number[],
  pointerY: number,
): number {
  return rowMidpoints.filter((midpoint) => midpoint < pointerY).length
}

// Visible row midpoints for a category, excluding the dragged row. Returns null when the group
// has no measurable rows (collapsed heading, or only the dragged place), so the caller falls back
// to "append" for a heading drop or the library-projected index for a row drop.
// eslint-disable-next-line react-refresh/only-export-components
export function visibleRowMidpoints(
  categoryWaypointIds: readonly string[],
  excludedWaypointId: string,
  handles: ReadonlyMap<string, HTMLButtonElement | null>,
): number[] | null {
  const midpoints: number[] = []
  for (const id of categoryWaypointIds) {
    if (id === excludedWaypointId) continue
    const row = handles.get(id)?.closest('li')
    if (!row) continue
    const rect = row.getBoundingClientRect()
    if (rect.width === 0 && rect.height === 0) continue
    midpoints.push(rect.top + rect.height / 2)
  }
  return midpoints.length > 0 ? midpoints.sort((left, right) => left - right) : null
}

// eslint-disable-next-line react-refresh/only-export-components
export function moveGroupedWaypointFromDrag({
  waypointId,
  targetId,
  sourceGroup,
  sourceIndex,
  targetGroup,
  targetIndex,
  resolvedIndex,
  waypoints,
  onMoveToPosition,
}: {
  readonly waypointId: string
  readonly targetId: string
  readonly sourceGroup?: string
  readonly sourceIndex?: number
  readonly targetGroup?: string
  readonly targetIndex?: number
  /** Pointer-derived index; authoritative when the destination rows are visible. */
  readonly resolvedIndex?: number
  readonly waypoints: readonly PersonalWaypoint[]
  readonly onMoveToPosition?: (waypointId: string, category: string, indexWithinCategory: number) => boolean
}): { readonly kind: 'moved' | 'unchanged' | 'failed' | 'invalid'; readonly category?: string; readonly index?: number } {
  const waypoint = waypoints.find(({ id }) => id === waypointId)
  if (!waypoint) return { kind: 'invalid' }
  const groupPrefix = 'personal-waypoint-category:'
  const targetCategory = targetId.startsWith(groupPrefix)
    ? decodeURIComponent(targetId.slice(groupPrefix.length))
    : targetGroup ?? sourceGroup
  const appendIndex = waypoints.filter(({ category, id }) => category === targetCategory && id !== waypointId).length
  // A collapsed heading has no visible rows, so its only meaning is "append".
  const insertionIndex = resolvedIndex ?? (targetId.startsWith(groupPrefix) ? appendIndex : targetIndex ?? sourceIndex)
  if (!targetCategory || !Number.isInteger(insertionIndex) || insertionIndex === undefined || insertionIndex < 0) return { kind: 'invalid' }
  const sourceGlobalIndex = waypoints.findIndex(({ id }) => id === waypointId)
  const originalCategoryIndex = waypoints.filter(({ category }, index) => category === waypoint.category && index < sourceGlobalIndex).length
  if (targetCategory === waypoint.category && insertionIndex === originalCategoryIndex) return { kind: 'unchanged', category: targetCategory, index: insertionIndex }
  return onMoveToPosition?.(waypointId, targetCategory, insertionIndex)
    ? { kind: 'moved', category: targetCategory, index: insertionIndex }
    : { kind: 'failed', category: targetCategory, index: insertionIndex }
}

function readExpandedCategories(): string[] {
  try {
    const stored = window.localStorage.getItem(expandedCategoriesStorageKey)
    const parsed: unknown = stored ? JSON.parse(stored) : []
    return Array.isArray(parsed) ? parsed.filter((category): category is string => typeof category === 'string') : []
  } catch {
    return []
  }
}

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
  readonly onOpenDetails?: (waypoint: PersonalWaypoint, trigger: HTMLElement) => void
  readonly onDirections?: (waypoint: PersonalWaypoint) => void
  readonly onAddCategory?: (category: string) => void
  readonly canAddWaypoint?: boolean
  readonly hiddenCategories?: readonly string[]
  readonly onSetCategoryVisibleImmediately?: (category: string, visible: boolean) => void
  readonly onSearchFilterChange?: (active: boolean) => void
  readonly onRemove: (waypointId: string) => void
  readonly moveCategoryOptions?: readonly string[]
  readonly onMoveToCategory?: (waypointId: string, category: string) => boolean
  readonly onMoveToPosition?: (waypointId: string, category: string, indexWithinCategory: number) => boolean
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
  onOpenDetails,
  onDirections,
  onAddCategory,
  canAddWaypoint = true,
  hiddenCategories = [],
  onSetCategoryVisibleImmediately,
  onSearchFilterChange,
  onRemove,
  moveCategoryOptions = [],
  onMoveToCategory,
  onMoveToPosition,
  onMove,
  onEditAnnouncement,
}: PersonalWaypointListProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedCategories, setExpandedCategories] = useState<string[]>(readExpandedCategories)
  const [collapsedEditCategories, setCollapsedEditCategories] = useState<string[]>([])
  const [keyboardReorder, setKeyboardReorder] = useState<KeyboardReorderState | null>(null)
  const [openCategoryMenu, setOpenCategoryMenu] = useState<string | null>(null)
  const previousEditing = useRef(editing)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const pendingMoveRestoreRef = useRef<{ readonly scrollTop: number; readonly waypointId?: string } | null>(null)
  useLayoutEffect(() => {
    if (pendingMoveRestoreRef.current === null) return
    const pending = pendingMoveRestoreRef.current
    pendingMoveRestoreRef.current = null
    const panel = document.getElementById('more-panel-scroll')
    if (panel) panel.scrollTop = pending.scrollTop
    const restoreFocus = (): void => {
      const movedHandle = pending.waypointId ? handleRefs.current.get(pending.waypointId) : null
      if (movedHandle?.isConnected) movedHandle.focus({ preventScroll: true })
      else searchInputRef.current?.focus({ preventScroll: true })
    }
    restoreFocus()
    if (pending.waypointId && !handleRefs.current.get(pending.waypointId)?.isConnected) {
      requestAnimationFrame(restoreFocus)
    }
  })
  const moveToCategory = (waypointId: string, nextCategory: string): boolean => {
    const panel = document.getElementById('more-panel-scroll')
    const succeeded = onMoveToCategory?.(waypointId, nextCategory) ?? false
    if (succeeded) pendingMoveRestoreRef.current = { scrollTop: panel?.scrollTop ?? 0, waypointId }
    return succeeded
  }
  const handleRefs = useRef(new Map<string, HTMLButtonElement>())
  const pendingFocusRef = useRef<{ readonly waypointId: string; readonly action: 'reorder' | 'remove' } | null>(null)
  const categoryMenuRootRef = useRef<HTMLDivElement>(null)
  const categoryMenuTriggerRefs = useRef(new Map<string, HTMLButtonElement>())
  const categoryMenuItemRef = useRef<HTMLButtonElement>(null)
  const categoryView = category !== undefined
  const activeCategory = categoryView ? category : ''
  const hasSearchFilter = searchQuery.trim().length > 0
  const visibleWaypoints = useMemo(() => filterPersonalWaypoints(
    waypoints,
    searchQuery,
    activeCategory || null,
  ), [activeCategory, searchQuery, waypoints])
  const keyboardPreviewWaypoints = keyboardReorder
    ? arrayMove([...visibleWaypoints], keyboardReorder.startIndex, keyboardReorder.currentIndex)
    : visibleWaypoints
  const groupedWaypoints = useMemo(() => {
    const groups = new Map<string, PersonalWaypoint[]>()
    for (const waypoint of keyboardPreviewWaypoints) {
      const group = groups.get(waypoint.category) ?? []
      group.push(waypoint)
      groups.set(waypoint.category, group)
    }
    return [...groups].sort(([left], [right]) => left.localeCompare(right))
  }, [keyboardPreviewWaypoints])
  const editMode = canEdit && editing && waypoints.length > 0
  const canReorder = editMode && waypoints.length > 1 && !hasSearchFilter && !categoryView
  const canDragGrouped = canReorder && Boolean(onMoveToPosition)
  const setCategoryExpanded = (category: string, expanded: boolean): void => {
    if (hasSearchFilter) return
    if (editMode) {
      setCollapsedEditCategories((current) => expanded
        ? current.filter((item) => item !== category)
        : [...new Set([...current, category])])
      return
    }
    const next = expanded ? [...new Set([...expandedCategories, category])] : expandedCategories.filter((item) => item !== category)
    setExpandedCategories(next)
    try { window.localStorage.setItem(expandedCategoriesStorageKey, JSON.stringify(next)) } catch { /* Storage is optional. */ }
  }

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

  useEffect(() => {
    if (!openCategoryMenu) return
    const closeOnOutside = (event: PointerEvent): void => {
      if (!categoryMenuRootRef.current?.contains(event.target as Node)) setOpenCategoryMenu(null)
    }
    document.addEventListener('pointerdown', closeOnOutside)
    return () => document.removeEventListener('pointerdown', closeOnOutside)
  }, [openCategoryMenu])

  useLayoutEffect(() => {
    if (openCategoryMenu) categoryMenuItemRef.current?.focus()
  }, [openCategoryMenu])

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
        pendingFocusRef.current = { waypointId, action: 'reorder' }
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
    pendingFocusRef.current = { waypointId, action: 'reorder' }
    onEditAnnouncement?.(`Picked up ${waypoint.name}, position ${index + 1} of ${waypoints.length}. Use the arrow keys to move it. Press Enter or Space to save, or Escape to cancel.`)
  }

  const handleDragEnd = (event: DragEndEvent, manager: DragDropManager): void => {
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

    if (canDragGrouped) {
      const targetId = String(event.operation.target.id)
      // Sortable projects destination group/index even when collision resolves to the source itself.
      const sortableSource = source as typeof source & { readonly group?: string; readonly index?: number }
      const sortableTarget = event.operation.target as typeof event.operation.target & { readonly group?: string; readonly index?: number }
      // Capture pointer and destination geometry synchronously: the drag operation resets before
      // the deferred write runs, and the list re-renders right after it.
      const pointerY = event.operation.position?.current?.y
      const groupPrefix = 'personal-waypoint-category:'
      const pointerCategory = targetId.startsWith(groupPrefix)
        ? decodeURIComponent(targetId.slice(groupPrefix.length))
        : sortableTarget.group
      const resolvedIndex = pointerY === undefined || pointerCategory === undefined
        ? undefined
        : (() => {
          const midpoints = visibleRowMidpoints(
            waypoints.filter(({ category }) => category === pointerCategory).map(({ id }) => id),
            waypointId,
            handleRefs.current,
          )
          return midpoints ? resolveInsertionIndexFromPointer(midpoints, pointerY) : undefined
        })()
      const applyMoveAfterDrop = (): void => {
        if (!manager.dragOperation.status.idle) {
          requestAnimationFrame(applyMoveAfterDrop)
          return
        }
        pendingMoveRestoreRef.current = { scrollTop: document.getElementById('more-panel-scroll')?.scrollTop ?? 0, waypointId }
        const moveResult = moveGroupedWaypointFromDrag({
          waypointId,
          targetId,
          sourceGroup: sortableSource.group,
          sourceIndex: sortableSource.index,
          targetGroup: sortableTarget.group,
          targetIndex: sortableTarget.index,
          resolvedIndex,
          waypoints,
          onMoveToPosition,
        })
        if (moveResult.kind === 'unchanged') {
          pendingMoveRestoreRef.current = null
          const originalCategoryIndex = moveResult.index ?? 0
          onEditAnnouncement?.(`${waypoint.name} remains in position ${originalCategoryIndex + 1} of its category.`)
          handleRefs.current.get(waypointId)?.focus()
          return
        }
        const saved = moveResult.kind === 'moved'
        if (moveResult.kind === 'failed') onEditAnnouncement?.(`Could not save the new position for ${waypoint.name}.`)
        else if (saved) onEditAnnouncement?.(`${waypoint.name} moved to ${moveResult.category}.`)
        else onEditAnnouncement?.(`Could not determine a destination for ${waypoint.name}.`)
        if (!saved) {
          pendingMoveRestoreRef.current = null
          handleRefs.current.get(waypointId)?.focus()
        }
      }
      requestAnimationFrame(applyMoveAfterDrop)
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
        moveCategoryOptions,
        onMoveToCategory: moveToCategory,
        onFocusWaypoint,
        onOpenDetails,
        onDirections,
        onHandleRef: registerHandleRef,
      }

      return canReorder && !keyboardReorder ? (
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
        {categoryView || keyboardReorder ? listRows : <>
          {!hasSearchFilter && <div className="personal-waypoint-groups-actions">
            <Button label="Expand all" variant="ghost" onClick={() => {
              const categories = groupedWaypoints.map(([name]) => name)
              setCollapsedEditCategories([])
              setExpandedCategories(categories)
              try { window.localStorage.setItem(expandedCategoriesStorageKey, JSON.stringify(categories)) } catch { /* Storage is optional. */ }
            }} />
            <Button label="Collapse all" variant="ghost" onClick={() => {
              if (editMode) setCollapsedEditCategories(groupedWaypoints.map(([name]) => name))
              setExpandedCategories([])
              try { window.localStorage.setItem(expandedCategoriesStorageKey, '[]') } catch { /* Storage is optional. */ }
            }} />
          </div>}
          <DragDropProvider sensors={[PointerSensor]} onDragEnd={handleDragEnd}>
          {groupedWaypoints.map(([name, items]) => {
            const expanded = hasSearchFilter || (editMode ? !collapsedEditCategories.includes(name) : expandedCategories.includes(name))
            const hidden = hiddenCategories.includes(name)
            return <CategoryDropGroup category={name} enabled={canDragGrouped} key={name} className={canDragGrouped ? 'personal-waypoint-category-group personal-waypoint-category-drop-target' : 'personal-waypoint-category-group'} label={`${name}, ${items.length} places`}>
              <div className="personal-waypoint-category-heading-row">
                <button id={`waypoint-category-heading-${encodeURIComponent(name)}`} className="personal-waypoint-category-heading" type="button" aria-disabled={hasSearchFilter || undefined} aria-expanded={expanded} aria-controls={`waypoint-category-list-${encodeURIComponent(name)}`} onClick={() => setCategoryExpanded(name, !expanded)}>
                  <span>{name}</span><span className="personal-waypoint-category-count">{items.length}</span>
                  <span aria-hidden="true">{expanded ? '⌄' : '›'}</span>
                </button>
                <div className="personal-waypoint-category-menu-root" data-owns-escape={openCategoryMenu === name ? 'true' : undefined} ref={openCategoryMenu === name ? categoryMenuRootRef : undefined} onKeyDown={(event) => {
                  if (event.key !== 'Escape') return
                  event.preventDefault()
                  event.stopPropagation()
                  setOpenCategoryMenu(null)
                  categoryMenuTriggerRefs.current.get(name)?.focus()
                }}>
                  <IconButton label={`${name} options`} icon={<EllipsisVerticalIcon />} variant="plain" ref={(element) => { if (element) categoryMenuTriggerRefs.current.set(name, element) }} expanded={openCategoryMenu === name} controls={`waypoint-category-menu-${encodeURIComponent(name)}`} onClick={() => setOpenCategoryMenu(openCategoryMenu === name ? null : name)} />
                  {openCategoryMenu === name && <div id={`waypoint-category-menu-${encodeURIComponent(name)}`} className="personal-waypoint-category-menu" role="group" aria-label={`${name} actions`}>
                    {onAddCategory && <MenuItem ref={categoryMenuItemRef} label="Add waypoint here" icon={<PlusIcon />} disabled={!canAddWaypoint} onClick={() => { setOpenCategoryMenu(null); onAddCategory(name) }} />}
                    {onSetCategoryVisibleImmediately && <MenuItem ref={onAddCategory ? undefined : categoryMenuItemRef} label={hidden ? 'Show pins on map' : 'Hide pins on map'} icon={<MapIcon />} onClick={() => {
                      onSetCategoryVisibleImmediately(name, hidden)
                      setOpenCategoryMenu(null)
                      categoryMenuTriggerRefs.current.get(name)?.focus()
                    }} />}
                  </div>}
                </div>
              </div>
              <ul id={`waypoint-category-list-${encodeURIComponent(name)}`} hidden={!expanded} data-editing={editMode ? 'true' : 'false'} className="personal-waypoint-list-rows" aria-label={`${name} waypoints`}>
                {items.map((waypoint) => {
                  const rowProps = {
                  waypoint, editing: editMode, handleDisabled: !canReorder, index: waypoints.findIndex(({ id }) => id === waypoint.id), handleDescriptionId: reorderInstructionsId,
                  onRemove: (id: string) => { pendingFocusRef.current = { waypointId: id, action: 'remove' }; onRemove(id) },
                  onFocusWaypoint, onOpenDetails, onDirections, onHandleRef: registerHandleRef, onHandleKeyDown: handleReorderKeyDown, moveCategoryOptions, onMoveToCategory: moveToCategory,
                  }
                  return canDragGrouped
                    ? <PersonalWaypointSortableListRow key={waypoint.id} {...rowProps} group={name} index={items.findIndex(({ id }) => id === waypoint.id)} />
                    : <PersonalWaypointListRow key={waypoint.id} {...rowProps} />
                })}
              </ul>
            </CategoryDropGroup>
          })}
          </DragDropProvider>
        </>}
      </>
    ) : (
      <div className="personal-waypoint-list-empty">
        <p>No waypoints match this search.</p>
        <Button label="Clear search" onClick={() => changeSearchQuery('')} />
      </div>
    )}
  </section>
}

function CategoryDropGroup({
  category,
  enabled,
  className,
  label,
  children,
}: {
  readonly category: string
  readonly enabled: boolean
  readonly className: string
  readonly label: string
  readonly children: ReactNode
}) {
  const { ref, isDropTarget } = useDroppable({ id: `personal-waypoint-category:${encodeURIComponent(category)}`, disabled: !enabled })
  return <section ref={ref} className={className} data-drop-target={isDropTarget ? 'true' : undefined} aria-label={label}>
    {children}
  </section>
}
