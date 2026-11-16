import { useCallback } from 'react'
import type { KeyboardEvent, MouseEvent, Ref } from 'react'
import type { PersonalWaypoint } from '../../../../domain/waypoints/personal/personal-waypoint'
import { useSortable } from '@dnd-kit/react/sortable'
import { SortableKeyboardPlugin } from '@dnd-kit/dom/sortable'
import { IconButton } from '../../../../ui/button'
import { SavedListRow } from '../../../../ui/saved-list-row'
import { CloseIcon, GripVerticalIcon } from '../../../../ui/icons'
import { PersonalWaypointMarkerGlyph } from './personal-waypoint-marker-glyph'
import { personalWaypointMarkerColorClass } from './personal-waypoint-marker-color'

interface PersonalWaypointListRowProps {
  readonly waypoint: PersonalWaypoint
  /** Shows the reorder grip and remove action; only Edit list turns this on. */
  readonly editing: boolean
  readonly handleDisabled: boolean
  readonly onRemove: (waypointId: string) => void
  readonly onOpenDetails: (waypoint: PersonalWaypoint, trigger: HTMLElement) => void
  readonly onHandleRef?: (waypointId: string, element: HTMLButtonElement | null) => void
  readonly rowRef?: Ref<HTMLLIElement>
  readonly handleRef?: (element: HTMLButtonElement | null) => void
  readonly isDragging?: boolean
  readonly keyboardReordering?: boolean
  readonly onHandleKeyDown?: (waypointId: string, event: KeyboardEvent<HTMLButtonElement>) => void
  readonly handleDescriptionId: string
}

/**
 * One saved place. In normal browsing the row has exactly one job — open this place's details —
 * so it carries no menu and no per-row action icons. Edit list adds the drag grip and Remove,
 * which are ordering/editing affordances rather than place actions.
 */
export function PersonalWaypointListRow({
  waypoint,
  editing,
  handleDisabled,
  onRemove,
  onOpenDetails,
  onHandleRef,
  rowRef,
  handleRef,
  isDragging = false,
  keyboardReordering = false,
  onHandleKeyDown,
  handleDescriptionId,
}: PersonalWaypointListRowProps) {
  const label = waypoint.name
  const setHandleRef = useCallback((element: HTMLButtonElement | null): void => {
    handleRef?.(element)
    onHandleRef?.(waypoint.id, element)
  }, [handleRef, onHandleRef, waypoint.id])

  const openDetails = (event: MouseEvent<HTMLButtonElement>): void => {
    onOpenDetails(waypoint, event.currentTarget)
  }

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
          variant="plain"
          onClick={() => undefined}
          onKeyDown={(event) => onHandleKeyDown?.(waypoint.id, event)}
          ariaDescribedBy={handleDescriptionId}
          ariaKeyShortcuts="Space Enter ArrowUp ArrowDown Escape"
          dataKeyboardReordering={keyboardReordering}
          disabled={handleDisabled}
          ref={setHandleRef}
        />}
        <span className={`personal-waypoint-pin ${personalWaypointMarkerColorClass(waypoint.markerColor)}`} data-marker-icon={waypoint.markerIcon} aria-hidden="true">
          <PersonalWaypointMarkerGlyph markerIcon={waypoint.markerIcon} size={15} />
        </span>
      </>}
      title={waypoint.name}
      // No subtitle: in a grouped collection the category is already the heading above this row.
      onSelect={openDetails}
      selectLabel={`Open ${label} details`}
      trailing={editing ? (
        <IconButton
          className="personal-waypoint-remove"
          label={`Remove ${label}`}
          icon={<CloseIcon />}
          variant="plain"
          onClick={() => onRemove(waypoint.id)}
        />
      ) : undefined}
    />
  )
}

export function PersonalWaypointSortableListRow({
  waypoint,
  index,
  group,
  ...props
}: PersonalWaypointListRowProps & {
  /** Position within this category, not within the whole collection. */
  readonly index: number
  /** The category these rows are grouped under; each category is its own sortable list. */
  readonly group: string
}) {
  // A sortable is scoped to one list: `index` is its position within the group and `group` names
  // that list. Passing the flat collection index instead described every category as a slice of one
  // long list, so a row dropped into another category was simultaneously at two positions.
  //
  // The optimistic-sorting plugin is left out. It reorders by moving the live DOM element into the
  // destination list as the pointer passes over it, and here the destination is a different `<ul>`
  // owned by a different React element. React then also renders the row in its new category, and the
  // moved node it no longer owns is what later makes removal fail and leaves a duplicate row behind.
  // Rendering is already driven by our own state, so the row is left where React put it.
  const { ref, handleRef, isDragging } = useSortable({
    id: waypoint.id,
    index,
    group,
    plugins: [SortableKeyboardPlugin],
    data: { category: waypoint.category.trim() },
  })

  return (
    <PersonalWaypointListRow
      {...props}
      waypoint={waypoint}
      rowRef={ref}
      handleRef={handleRef}
      isDragging={isDragging}
    />
  )
}
