import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { PersonalWaypoint } from '../../../../domain/waypoints/personal/personal-waypoint'
import { Button, IconButton } from '../../../../ui/button'
import { SavedListRow } from '../../../../ui/saved-list-row'
import { SavedListHeader } from '../../../../ui/saved-list-header'
import {
  ChevronDownIcon,
  CloseIcon,
  GripVerticalIcon,
  MapPinIcon,
} from '../../../../ui/icons'
import { SearchField } from '../../../../ui/search-field'
import { Select } from '../../../../ui/select'
import {
  filterPersonalWaypoints,
  getPersonalWaypointCategories,
} from '../data/filter-personal-waypoints'

interface PersonalWaypointListProps {
  readonly waypoints: readonly PersonalWaypoint[]
  readonly canEdit: boolean
  readonly editing: boolean
  readonly onRemove: (waypointId: string) => void
  readonly onMove: (waypointId: string, neighborId: string) => void
  readonly onClearAll: () => void
  readonly onSelect?: (waypointId: string, trigger: HTMLButtonElement) => void
  readonly onEditAnnouncement?: (message: string) => void
}

export function PersonalWaypointList({
  waypoints,
  canEdit,
  editing,
  onRemove,
  onMove,
  onClearAll,
  onSelect,
  onEditAnnouncement,
}: PersonalWaypointListProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('')
  const previousEditing = useRef(editing)
  const listHeadingRef = useRef<HTMLHeadingElement>(null)
  const actionRowsRef = useRef(new Map<string, HTMLDivElement>())
  const pendingFocusRef = useRef<{
    readonly waypointId: string
    readonly action: 'move-up' | 'move-down' | 'remove'
  } | null>(null)
  const categories = useMemo(() => getPersonalWaypointCategories(waypoints), [waypoints])
  const activeCategory = categories.includes(selectedCategory) ? selectedCategory : ''
  const hasActiveFilter = searchQuery.trim().length > 0 || activeCategory !== ''
  const visibleWaypoints = useMemo(() => filterPersonalWaypoints(
    waypoints,
    searchQuery,
    activeCategory || null,
  ), [activeCategory, searchQuery, waypoints])
  const editMode = canEdit && editing && waypoints.length > 0

  useEffect(() => {
    if (previousEditing.current === editing) return
    previousEditing.current = editing
    onEditAnnouncement?.(editing
      ? 'Edit list mode. Use the move controls to reorder waypoints, or remove a waypoint.'
      : 'Done editing the waypoint list.')
  }, [editing, onEditAnnouncement])

  useLayoutEffect(() => {
    const pendingFocus = pendingFocusRef.current
    if (!pendingFocus) return
    pendingFocusRef.current = null

    if (pendingFocus.action === 'remove') {
      listHeadingRef.current?.focus()
      return
    }

    const actionRow = actionRowsRef.current.get(pendingFocus.waypointId)
    const selector = pendingFocus.action === 'move-up'
      ? '.personal-waypoint-order-up'
      : '.personal-waypoint-order-down'
    const preferredTarget = actionRow?.querySelector<HTMLButtonElement>(selector)
    const focusTarget = preferredTarget && !preferredTarget.disabled
      ? preferredTarget
      : actionRow?.querySelector<HTMLButtonElement>('button:not(:disabled)')
    const fallbackTarget = focusTarget ?? listHeadingRef.current
    fallbackTarget?.focus()
  })

  const clearAll = (): void => {
    if (hasActiveFilter) return
    if (!window.confirm('Clear all personal waypoints, including places hidden by filters?')) return
    pendingFocusRef.current = { waypointId: waypoints[0]?.id ?? '', action: 'remove' }
    onClearAll()
  }

  const moveWaypoint = (index: number, direction: -1 | 1): void => {
    const waypoint = visibleWaypoints[index]
    const neighbor = visibleWaypoints[index + direction]
    if (hasActiveFilter || !waypoint || !neighbor) return
    pendingFocusRef.current = {
      waypointId: waypoint.id,
      action: direction === -1 ? 'move-up' : 'move-down',
    }
    onMove(waypoint.id, neighbor.id)
  }

  const categoryOptions = [
    { value: '', label: 'All categories' },
    ...categories.map((category) => ({ value: category, label: category })),
  ]

  return <section className="personal-waypoint-list" aria-labelledby="personal-waypoint-list-heading">
    <div className="personal-waypoint-list-search">
      <SearchField
        aria-label="Search saved places"
        placeholder="Search saved places"
        value={searchQuery}
        onChange={(event) => setSearchQuery(event.target.value)}
      />
    </div>
    <div className="personal-waypoint-list-card">
      <SavedListHeader
        headingId="personal-waypoint-list-heading"
        headingRef={listHeadingRef}
        title="Saved places"
        count={waypoints.length}
        trailing={(
          <Select
            className="personal-waypoint-category-filter"
            label="Category"
            hideLabel
            value={activeCategory}
            options={categoryOptions}
            onChange={setSelectedCategory}
          />
        )}
      />

      {editMode && hasActiveFilter && (
        <p className="personal-waypoint-list-filter-note">
          Clear search and category filters to reorder or clear all saved places.
        </p>
      )}

      {visibleWaypoints.length > 0 ? (
        <ul
          className="personal-waypoint-list-rows"
          data-editing={editMode ? 'true' : 'false'}
          tabIndex={0}
          aria-label="Saved Personal Waypoints"
        >
          {visibleWaypoints.map((waypoint, index) => {
            const label = `${waypoint.name}, ${waypoint.category}`
            return (
              <SavedListRow
                key={waypoint.id}
                className="personal-waypoint-row"
                density="compact"
                leading={<>
                  {editMode && <span className="personal-waypoint-grip" aria-hidden="true"><GripVerticalIcon /></span>}
                  <span className="personal-waypoint-pin"><MapPinIcon /></span>
                </>}
                title={waypoint.name}
                subtitle={waypoint.category}
                onSelect={onSelect
                  ? (event) => onSelect(waypoint.id, event.currentTarget)
                  : undefined}
                selectLabel={`Open ${label} details`}
                trailing={editMode ? (
                  <div
                    className="personal-waypoint-row-actions"
                    ref={(element) => {
                      if (element) actionRowsRef.current.set(waypoint.id, element)
                      else actionRowsRef.current.delete(waypoint.id)
                    }}
                  >
                    <IconButton
                      className="personal-waypoint-order-up"
                      label={`Move ${label} up`}
                      icon={<ChevronDownIcon />}
                      disabled={hasActiveFilter || index === 0}
                      onClick={() => moveWaypoint(index, -1)}
                    />
                    <IconButton
                      className="personal-waypoint-order-down"
                      label={`Move ${label} down`}
                      icon={<ChevronDownIcon />}
                      disabled={hasActiveFilter || index === visibleWaypoints.length - 1}
                      onClick={() => moveWaypoint(index, 1)}
                    />
                    <IconButton
                      className="personal-waypoint-remove"
                      label={`Remove ${label}`}
                      icon={<CloseIcon />}
                      onClick={() => {
                        pendingFocusRef.current = { waypointId: waypoint.id, action: 'remove' }
                        onRemove(waypoint.id)
                      }}
                    />
                  </div>
                ) : undefined}
              />
            )
          })}
        </ul>
      ) : (
        <div className="personal-waypoint-list-empty">
          <p>No waypoints match these filters.</p>
          <Button
            label="Clear filters"
            onClick={() => {
              setSearchQuery('')
              setSelectedCategory('')
            }}
          />
        </div>
      )}
    </div>
    {editMode && (
      <div className="personal-waypoint-list-edit-actions">
        <Button label="Clear all" onClick={clearAll} disabled={hasActiveFilter} />
      </div>
    )}
  </section>
}
