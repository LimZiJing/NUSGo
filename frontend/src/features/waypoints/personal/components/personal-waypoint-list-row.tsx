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
  readonly onSelect?: (waypointId: string, trigger: HTMLButtonElement) => void
  readonly onEdit?: (waypointId: string) => void
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
  onSelect,
  onEdit,
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
      onSelect={onSelect
        ? (event) => onSelect(waypoint.id, event.currentTarget)
        : undefined}
      selectLabel={`Open ${label} details`}
      trailing={editing ? (
        <div className="personal-waypoint-row-actions">
          <IconButton
            className="personal-waypoint-remove"
            label={`Remove ${label}`}
            icon={<CloseIcon />}
            onClick={() => onRemove(waypoint.id)}
          />
        </div>
      ) : onEdit ? (
        <div className="personal-waypoint-row-actions">
          <Button
            label="Edit"
            ariaLabel={`Edit ${label}`}
            variant="ghost"
            onClick={() => onEdit(waypoint.id)}
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
