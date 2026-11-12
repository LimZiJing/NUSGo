import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { KeyboardEvent } from 'react'
import { arrayMove, move } from '@dnd-kit/helpers'
import { DragDropProvider, PointerSensor, useDroppable } from '@dnd-kit/react'
import type { DragDropManager } from '@dnd-kit/react'
import type { DragEndEvent } from '@dnd-kit/react'
import type { PersonalWaypoint } from '../../../../domain/waypoints/personal/personal-waypoint'
import { Button, IconButton } from '../../../../ui/button'
import { PERSONAL_WAYPOINT_CATEGORY_MAX_LENGTH } from '../../../../domain/waypoints/personal/personal-waypoint'
import { SearchField } from '../../../../ui/search-field'
import { MenuItem } from '../../../../ui/menu-item'
import { CheckIcon, CloseIcon, EditIcon, EllipsisVerticalIcon, MapIcon, PlusIcon } from '../../../../ui/icons'
import { filterPersonalWaypoints } from '../data/filter-personal-waypoints'
import { categoryMergeConfirmation } from '../../../../domain/waypoints/personal/personal-waypoint-category-rename'
import {
  isFocusReachable,
  moveGroupedWaypointFromDrag,
  reorderWithinCategory,
  resolveInsertionIndexFromPointer,
  visibleRowMidpoints,
} from './personal-waypoint-group-drag'
import {
  PersonalWaypointListRow,
  PersonalWaypointSortableListRow,
} from './personal-waypoint-list-row'

const reorderInstructionsId = 'personal-waypoint-reorder-instructions'
const expandedCategoriesStorageKey = 'navus:personal-waypoints:expanded-categories:v1'

const categoryHeadingId = (category: string): string => `waypoint-category-heading-${encodeURIComponent(category)}`

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
  /** Set when reordering inside a category group; absent for the legacy flat list. */
  readonly category?: string
  readonly orderIds: readonly string[]
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
  /** Renames or merges a category. Returns false when the write was refused. */
  readonly onRenameCategory?: (from: string, to: string) => boolean
  /** Records the merged category's map visibility and reports whether it is shown. */
  readonly onMergeCategoryVisibility?: (from: string, to: string) => boolean
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
  onRenameCategory,
  onMergeCategoryVisibility,
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
  const pendingMoveRestoreRef = useRef<{ readonly scrollTop: number; readonly waypointId?: string; readonly category?: string } | null>(null)
  useLayoutEffect(() => {
    if (pendingMoveRestoreRef.current === null) return
    const pending = pendingMoveRestoreRef.current
    pendingMoveRestoreRef.current = null
    const panel = document.getElementById('more-panel-scroll')
    if (panel) panel.scrollTop = pending.scrollTop
    // The moved handle is mounted even when its category is collapsed, but focus() on a control
    // inside a hidden list silently does nothing. Fall back to the destination heading, then search.
    const movedHandle = pending.waypointId ? handleRefs.current.get(pending.waypointId) ?? null : null
    if (isFocusReachable(movedHandle)) {
      movedHandle.focus({ preventScroll: true })
      return
    }
    const heading = pending.category ? document.getElementById(categoryHeadingId(pending.category)) : null
    if (heading) {
      heading.focus({ preventScroll: true })
      return
    }
    searchInputRef.current?.focus({ preventScroll: true })
  })
  const moveToCategory = (waypointId: string, nextCategory: string): boolean => {
    const panel = document.getElementById('more-panel-scroll')
    const succeeded = onMoveToCategory?.(waypointId, nextCategory) ?? false
    if (succeeded) pendingMoveRestoreRef.current = { scrollTop: panel?.scrollTop ?? 0, waypointId, category: nextCategory }
    return succeeded
  }
  const handleRefs = useRef(new Map<string, HTMLButtonElement>())
  const pendingFocusRef = useRef<{ readonly waypointId: string; readonly action: 'reorder' | 'remove' } | null>(null)
  const categoryMenuRootRef = useRef<HTMLDivElement>(null)
  const categoryMenuTriggerRefs = useRef(new Map<string, HTMLButtonElement>())
  const categoryMenuItemRef = useRef<HTMLButtonElement>(null)
  // Inline heading rename. `merge` holds a requested name that already exists, so the user must
  // confirm a lossless merge instead of the rename silently combining two categories.
  const [renameState, setRenameState] = useState<{ readonly category: string; readonly value: string } | null>(null)
  const [mergeRequest, setMergeRequest] = useState<{ readonly from: string; readonly to: string } | null>(null)
  const renameInputRef = useRef<HTMLInputElement>(null)
  const mergeDialogRef = useRef<HTMLDialogElement>(null)
  const mergeCancelRef = useRef<HTMLButtonElement>(null)
  const [renameAnnouncement, setRenameAnnouncement] = useState('')
  const headingFocusRef = useRef<string | null>(null)
  const categoryView = category !== undefined
  const activeCategory = categoryView ? category : ''
  const hasSearchFilter = searchQuery.trim().length > 0
  const visibleWaypoints = useMemo(() => filterPersonalWaypoints(
    waypoints,
    searchQuery,
    activeCategory || null,
  ), [activeCategory, searchQuery, waypoints])
  const keyboardPreviewWaypoints = keyboardReorder === null
    ? visibleWaypoints
    : keyboardReorder.category === undefined
      ? arrayMove([...visibleWaypoints], keyboardReorder.startIndex, keyboardReorder.currentIndex)
      : reorderWithinCategory(visibleWaypoints, keyboardReorder.waypointId, keyboardReorder.category, keyboardReorder.currentIndex)
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

  const focusHeading = (categoryName: string): void => {
    headingFocusRef.current = categoryName
  }

  // The heading may be remounted under a new id after a rename, so focus it after the next commit.
  useLayoutEffect(() => {
    const pendingHeading = headingFocusRef.current
    if (!pendingHeading) return
    headingFocusRef.current = null
    const heading = document.getElementById(categoryHeadingId(pendingHeading))
    if (heading) {
      heading.focus({ preventScroll: true })
      return
    }
    requestAnimationFrame(() => document.getElementById(categoryHeadingId(pendingHeading))?.focus({ preventScroll: true }))
  })

  const startRename = (categoryName: string): void => {
    setOpenCategoryMenu(null)
    setRenameState({ category: categoryName, value: categoryName })
  }

  const cancelRename = (): void => {
    const editingCategory = renameState?.category
    setRenameState(null)
    if (editingCategory) focusHeading(editingCategory)
  }

  // A rename to a name that already exists cannot be applied silently: it would change data the
  // user did not ask to merge. Ask first, and keep the original name until they confirm.
  const commitRename = (): boolean => {
    if (!renameState || !onRenameCategory) return false
    const from = renameState.category
    const to = renameState.value.trim()
    if (!to) {
      setRenameAnnouncement('Enter a category name before saving.')
      renameInputRef.current?.focus()
      return false
    }
    if (to === from) {
      setRenameState(null)
      focusHeading(from)
      return true
    }
    const destinationExists = waypoints.some(({ category: name }) => name === to)
    if (destinationExists) {
      setRenameState(null)
      setMergeRequest({ from, to })
      return true
    }
    if (!onRenameCategory(from, to)) {
      setRenameAnnouncement('The category could not be renamed. Saved data was not changed.')
      renameInputRef.current?.focus()
      return false
    }
    setRenameState(null)
    setRenameAnnouncement(`Category renamed to ${to}.`)
    focusHeading(to)
    return true
  }

  // Closing a modal dialog restores focus to whatever was focused before showModal, which would
  // undo the heading focus we set in the same commit. Close it ourselves before moving focus.
  const closeMergeDialog = (): void => {
    const dialog = mergeDialogRef.current
    if (!dialog?.open) return
    if (typeof dialog.close === 'function') dialog.close()
    else dialog.removeAttribute('open')
  }

  const confirmMerge = (): void => {
    const request = mergeRequest
    closeMergeDialog()
    setMergeRequest(null)
    if (!request || !onRenameCategory) return
    if (!onRenameCategory(request.from, request.to)) {
      setRenameAnnouncement('The categories could not be merged. Saved data was not changed.')
      focusHeading(request.from)
      return
    }
    const visibleAfter = onMergeCategoryVisibility?.(request.from, request.to) ?? true
    setRenameAnnouncement(`${categoryMergeConfirmation(visibleAfter)}. Merged ${request.from} into ${request.to}.`)
    focusHeading(request.to)
  }

  const cancelMerge = (): void => {
    const request = mergeRequest
    closeMergeDialog()
    setMergeRequest(null)
    if (request) focusHeading(request.from)
  }

  // Keyed on the category, not on each keystroke, so typing does not keep reselecting the field.
  const renameCategory = renameState?.category
  useLayoutEffect(() => {
    if (!renameCategory) return
    // Preselect so typing replaces the current name instead of appending to it.
    renameInputRef.current?.focus({ preventScroll: true })
    renameInputRef.current?.select()
  }, [renameCategory])

  useEffect(() => {
    const dialog = mergeDialogRef.current
    if (!dialog) return
    if (mergeRequest && !dialog.open) {
      // jsdom does not implement showModal; a real browser always does.
      if (typeof dialog.showModal === 'function') dialog.showModal()
      else dialog.setAttribute('open', '')
      mergeCancelRef.current?.focus({ preventScroll: true })
    } else if (!mergeRequest && dialog.open) {
      if (typeof dialog.close === 'function') dialog.close()
      else dialog.removeAttribute('open')
    }
  }, [mergeRequest])

  const handleReorderKeyDown = (
    waypointId: string,
    event: KeyboardEvent<HTMLButtonElement>,
  ): void => {
    if (!canReorder) return
    const isSpaceKey = event.key === ' ' || event.key === 'Space' || event.code === 'Space'
    const waypoint = waypoints.find(({ id }) => id === waypointId)
    if (!waypoint) return

    if (keyboardReorder) {
      if (keyboardReorder.waypointId !== waypointId) return
      const { orderIds, startIndex } = keyboardReorder
      const total = orderIds.length
      const position = (positionIndex: number): string => keyboardReorder.category === undefined
        ? `${positionIndex + 1} of ${total}`
        : `${positionIndex + 1} of ${total} in ${keyboardReorder.category}`

      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        event.preventDefault()
        const direction = event.key === 'ArrowUp' ? -1 : 1
        const currentIndex = Math.max(0, Math.min(total - 1, keyboardReorder.currentIndex + direction))
        if (currentIndex === keyboardReorder.currentIndex) {
          onEditAnnouncement?.(`${waypoint.name} is at position ${position(currentIndex)}.`)
          return
        }
        setKeyboardReorder({ ...keyboardReorder, currentIndex })
        onEditAnnouncement?.(`${waypoint.name}, position ${position(currentIndex)}.`)
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
        const category = keyboardReorder.category
        setKeyboardReorder(null)
        if (targetIndex === startIndex) {
          onEditAnnouncement?.(`${waypoint.name} remains at position ${position(targetIndex)}.`)
          return
        }

        // Grouped mode reorders inside the place's own category; the flat list reorders every place.
        const saved = category === undefined
          ? onMove(waypointId, targetIndex)
          : onMoveToPosition?.(waypointId, category, targetIndex) ?? false
        if (!saved) {
          onEditAnnouncement?.(`Could not save the new position for ${waypoint.name}.`)
          pendingFocusRef.current = { waypointId, action: 'reorder' }
          return
        }

        pendingFocusRef.current = { waypointId, action: 'reorder' }
        onEditAnnouncement?.(`${waypoint.name} moved to position ${position(targetIndex)}.`)
      }
      return
    }

    if (!isSpaceKey && event.key !== 'Enter') return
    event.preventDefault()
    // The legacy flat list reorders across every place; the grouped view stays inside its category.
    const orderIds = categoryView || !canDragGrouped
      ? waypoints.map(({ id }) => id)
      : waypoints.filter((item) => item.category === waypoint.category).map(({ id }) => id)
    const startIndex = Math.max(0, orderIds.indexOf(waypointId))
    setKeyboardReorder({
      waypointId,
      category: canDragGrouped && !categoryView ? waypoint.category : undefined,
      orderIds,
      startIndex,
      currentIndex: startIndex,
    })
    pendingFocusRef.current = { waypointId, action: 'reorder' }
    const scope = canDragGrouped && !categoryView ? ` of ${orderIds.length} in ${waypoint.category}` : ` of ${orderIds.length}`
    onEditAnnouncement?.(`Picked up ${waypoint.name}, position ${startIndex + 1}${scope}. Use the arrow keys to move it. Press Enter or Space to save, or Escape to cancel.`)
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
        if (saved && moveResult.category !== undefined) {
          pendingMoveRestoreRef.current = { ...pendingMoveRestoreRef.current!, category: moveResult.category }
        }
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
        {categoryView || (keyboardReorder !== null && keyboardReorder.category === undefined) ? listRows : <>
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
                {renameState?.category === name ? <div className="personal-waypoint-category-rename">
                  <input
                    ref={renameInputRef}
                    className="personal-waypoint-category-rename-input"
                    aria-label={`Rename ${name} category`}
                    value={renameState.value}
                    maxLength={PERSONAL_WAYPOINT_CATEGORY_MAX_LENGTH}
                    onChange={(event) => setRenameState({ category: name, value: event.target.value })}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') { event.preventDefault(); commitRename() }
                      else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); cancelRename() }
                    }}
                  />
                  <IconButton label="Save category name" icon={<CheckIcon />} variant="plain" onClick={commitRename} />
                  <IconButton label="Cancel category rename" icon={<CloseIcon />} variant="plain" onClick={cancelRename} />
                </div> : <button id={categoryHeadingId(name)} className="personal-waypoint-category-heading" type="button" aria-disabled={hasSearchFilter || undefined} aria-expanded={expanded} aria-controls={`waypoint-category-list-${encodeURIComponent(name)}`} onClick={() => setCategoryExpanded(name, !expanded)}>
                  <span>{name}</span><span className="personal-waypoint-category-count">{items.length}</span>
                  <span aria-hidden="true">{expanded ? '⌄' : '›'}</span>
                </button>}
                <div className="personal-waypoint-category-menu-root" data-owns-escape={openCategoryMenu === name ? 'true' : undefined} ref={openCategoryMenu === name ? categoryMenuRootRef : undefined} onKeyDown={(event) => {
                  if (event.key !== 'Escape') return
                  event.preventDefault()
                  event.stopPropagation()
                  setOpenCategoryMenu(null)
                  categoryMenuTriggerRefs.current.get(name)?.focus()
                }}>
                  <IconButton label={`${name} options`} icon={<EllipsisVerticalIcon />} variant="plain" ref={(element) => { if (element) categoryMenuTriggerRefs.current.set(name, element) }} expanded={openCategoryMenu === name} controls={`waypoint-category-menu-${encodeURIComponent(name)}`} onClick={() => setOpenCategoryMenu(openCategoryMenu === name ? null : name)} />
                  {openCategoryMenu === name && <div id={`waypoint-category-menu-${encodeURIComponent(name)}`} className="personal-waypoint-category-menu" role="group" aria-label={`${name} actions`}>
                    {onRenameCategory && <MenuItem ref={categoryMenuItemRef} label="Rename category" icon={<EditIcon />} onClick={() => startRename(name)} />}
                    {onAddCategory && <MenuItem ref={onRenameCategory ? undefined : categoryMenuItemRef} label="Add waypoint here" icon={<PlusIcon />} disabled={!canAddWaypoint} onClick={() => { setOpenCategoryMenu(null); onAddCategory(name) }} />}
                    {onSetCategoryVisibleImmediately && <MenuItem ref={onAddCategory || onRenameCategory ? undefined : categoryMenuItemRef} label={hidden ? 'Show pins on map' : 'Hide pins on map'} icon={<MapIcon />} onClick={() => {
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
                  waypoint, editing: editMode, index: waypoints.findIndex(({ id }) => id === waypoint.id), handleDescriptionId: reorderInstructionsId,
                  handleDisabled: !canReorder || Boolean(keyboardReorder && keyboardReorder.waypointId !== waypoint.id),
                  keyboardReordering: keyboardReorder?.waypointId === waypoint.id,
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
    {/* Rendered only when there is something to say, so the panel keeps one live region otherwise. */}
    {renameAnnouncement && <p className="visually-hidden" role="status" aria-live="polite">{renameAnnouncement}</p>}
    <dialog
      ref={mergeDialogRef}
      className="personal-waypoint-merge-dialog"
      aria-labelledby="personal-waypoint-merge-heading"
      data-owns-escape="true"
      onCancel={(event) => { event.preventDefault(); cancelMerge() }}
    >
      <h2 id="personal-waypoint-merge-heading">Merge into {mergeRequest?.to}?</h2>
      <p>{`Move all places from ${mergeRequest?.from ?? ''} into ${mergeRequest?.to ?? ''}. ${mergeRequest?.to ?? ''}'s places stay first; ${mergeRequest?.from ?? ''}'s places are appended.`}</p>
      <p className="personal-waypoint-merge-visibility">
        <MapIcon />
        <span>{categoryMergeConfirmation(
          mergeRequest
            ? !hiddenCategories.includes(mergeRequest.from) || !hiddenCategories.includes(mergeRequest.to)
            : true,
        )}</span>
      </p>
      <div className="personal-waypoint-actions">
        <Button label="Cancel" variant="secondary" onClick={cancelMerge} ref={mergeCancelRef} />
        <Button label="Merge categories" variant="primary" onClick={confirmMerge} />
      </div>
    </dialog>
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
