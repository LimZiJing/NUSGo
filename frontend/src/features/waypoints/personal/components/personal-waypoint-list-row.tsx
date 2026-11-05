import { useCallback } from 'react'
import type { KeyboardEvent, Ref } from 'react'
import type { PersonalWaypoint } from '../../../../domain/waypoints/personal/personal-waypoint'
import { useSortable } from '@dnd-kit/react/sortable'
import { IconButton, Button } from '../../../../ui/button'
import { SavedListRow } from '../../../../ui/saved-list-row'
import { CloseIcon, GripVerticalIcon, MapPinIcon } from '../../../../ui/icons'

interface PersonalWaypointListRowProps {
  readonly waypoint: PersonalWaypoint
  readonly editing: boolean
  readonly handleDisabled: boolean
  readonly onRemove: (waypointId: string) => void
  readonly onFocusWaypoint?: (waypoint: PersonalWaypoint) => void
  readonly onDirections?: (waypoint: PersonalWaypoint) => void
  readonly onHandleRef?: (waypointId: string, element: HTMLButtonElement | null) => void
  readonly rowRef?: Ref<HTMLLIElement>
  readonly handleRef?: (element: HTMLButtonElement | null) => void
  readonly isDragging?: boolean
  readonly index: number
  readonly keyboardReordering?: boolean
  readonly onHandleKeyDown?: (waypointId: string, index: number, event: KeyboardEvent<HTMLButtonElement>) => void
  readonly handleDescriptionId: string
}

export function PersonalWaypointListRow({
  waypoint,
  editing,
  handleDisabled,
  onRemove,
  onFocusWaypoint,
  onDirections,
  onHandleRef,
  rowRef,
  handleRef,
  isDragging = false,
  index,
  keyboardReordering = false,
  onHandleKeyDown,
  handleDescriptionId,
}: PersonalWaypointListRowProps) {
  const label = `${waypoint.name}, ${waypoint.category}`
  const setHandleRef = useCallback((element: HTMLButtonElement | null): void => {
    handleRef?.(element)
    onHandleRef?.(waypoint.id, element)
  }, [handleRef, onHandleRef, waypoint.id])

  return (
    <SavedListRow
      rowRef={rowRef}
      className={`personal-waypoint-row${isDragging ? ' personal-waypoint-row-dragging' : ''}`}
      density="compact"
      leading={<>
        {editing && <IconButton
          className="personal-waypoint-grip"
          label={`Reorder ${label}`}
          icon={<GripVerticalIcon />}
          onClick={() => undefined}
          onKeyDown={(event) => onHandleKeyDown?.(waypoint.id, index, event)}
          ariaDescribedBy={handleDescriptionId}
          ariaKeyShortcuts="Space Enter ArrowUp ArrowDown Escape"
          dataKeyboardReordering={keyboardReordering}
          disabled={handleDisabled}
          ref={setHandleRef}
        />}
        <span className="personal-waypoint-pin"><MapPinIcon /></span>
      </>}
      title={waypoint.name}
      subtitle={waypoint.category}
      onSelect={onFocusWaypoint ? () => onFocusWaypoint(waypoint) : undefined}
      selectLabel={`Show ${label} on map`}
      trailing={editing ? (
        <div className="personal-waypoint-row-actions">
          <IconButton
            className="personal-waypoint-remove"
            label={`Remove ${label}`}
            icon={<CloseIcon />}
            onClick={() => onRemove(waypoint.id)}
          />
        </div>
      ) : onDirections ? (
        <div className="personal-waypoint-row-actions">
          <Button
            className="personal-waypoint-directions"
            label="Directions"
            ariaLabel={`Directions to ${label}`}
            variant="ghost"
            onClick={() => onDirections(waypoint)}
          />
        </div>
      ) : undefined}
    />
  )
}

export function PersonalWaypointSortableListRow({
  waypoint,
  index,
  ...props
}: PersonalWaypointListRowProps) {
  const { ref, handleRef, isDragging } = useSortable({ id: waypoint.id, index })

  return (
    <PersonalWaypointListRow
      {...props}
      waypoint={waypoint}
      index={index}
      rowRef={ref}
      handleRef={handleRef}
      isDragging={isDragging}
    />
  )
}
