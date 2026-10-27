import { useEffect, useMemo, useRef, useState } from 'react'
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
}

export function PersonalWaypointList({
  waypoints,
  canEdit,
  editing,
  onRemove,
  onMove,
  onClearAll,
}: PersonalWaypointListProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('')
  const [editAnnouncement, setEditAnnouncement] = useState('')
  const previousEditing = useRef(editing)
  const categories = useMemo(() => getPersonalWaypointCategories(waypoints), [waypoints])
  const activeCategory = categories.includes(selectedCategory) ? selectedCategory : ''
  const visibleWaypoints = useMemo(() => filterPersonalWaypoints(
    waypoints,
    searchQuery,
    activeCategory || null,
  ), [activeCategory, searchQuery, waypoints])
  const editMode = canEdit && editing && waypoints.length > 0

  useEffect(() => {
    if (previousEditing.current === editing) return
    previousEditing.current = editing
    setEditAnnouncement(editing
      ? 'Edit list mode. Use the move controls to reorder waypoints, or remove a waypoint.'
      : 'Done editing the waypoint list.')
  }, [editing])

  const clearAll = (): void => {
    if (window.confirm('Clear all personal waypoints?')) onClearAll()
  }

  const moveWaypoint = (index: number, direction: -1 | 1): void => {
    const waypoint = visibleWaypoints[index]
    const neighbor = visibleWaypoints[index + direction]
    if (!waypoint || !neighbor) return
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

      {editAnnouncement && <p className="personal-waypoint-edit-status" role="status">{editAnnouncement}</p>}

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
                leading={<>
                  {editMode && <span className="personal-waypoint-grip" aria-hidden="true"><GripVerticalIcon /></span>}
                  <span className="personal-waypoint-pin"><MapPinIcon /></span>
                </>}
                title={waypoint.name}
                subtitle={waypoint.category}
                trailing={editMode ? (
                  <div className="personal-waypoint-row-actions">
                    <IconButton
                      className="personal-waypoint-order-up"
                      label={`Move ${label} up`}
                      icon={<ChevronDownIcon />}
                      disabled={index === 0}
                      onClick={() => moveWaypoint(index, -1)}
                    />
                    <IconButton
                      label={`Move ${label} down`}
                      icon={<ChevronDownIcon />}
                      disabled={index === visibleWaypoints.length - 1}
                      onClick={() => moveWaypoint(index, 1)}
                    />
                    <IconButton
                      className="personal-waypoint-remove"
                      label={`Remove ${label}`}
                      icon={<CloseIcon />}
                      onClick={() => onRemove(waypoint.id)}
                    />
                  </div>
                ) : undefined}
              />
            )
          })}
        </ul>
      ) : waypoints.length > 0 ? (
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
      ) : <p className="personal-waypoint-list-empty">No saved waypoints yet.</p>}
    </div>
    {editMode && (
      <div className="personal-waypoint-list-edit-actions">
        <Button label="Clear all" onClick={clearAll} />
      </div>
    )}
  </section>
}
