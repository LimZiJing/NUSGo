import type { ReactNode } from 'react'
import { useDroppable } from '@dnd-kit/react'
import { DisclosureHeader } from '../../../../ui/disclosure-header'
import { personalWaypointCountLabel } from '../data/group-personal-waypoints'
import type { PersonalWaypoint } from '../../../../domain/waypoints/personal/personal-waypoint'

interface PersonalWaypointCategoryGroupProps {
  readonly category: string
  readonly waypoints: readonly PersonalWaypoint[]
  readonly expanded: boolean
  readonly listId: string
  readonly headingId: string
  /** True while a dragged place is hovering this group, which highlights it as the drop target. */
  readonly highlighted: boolean
  readonly expandDisabled: boolean
  readonly onToggle: () => void
  readonly onRename?: (next: string) => void
  readonly children: ReactNode
}

/**
 * One category card. It is a single drop target rather than a set of row targets, so a dragged
 * place can be dropped anywhere inside the card — including into a category that currently has no
 * places, whose card stays visible during editing for exactly this reason.
 *
 * Dragging over a collapsed card highlights it; the list expands it after a short dwell so rows
 * become reachable without the person having to let go and open it by hand.
 */
export function PersonalWaypointCategoryGroup({
  category,
  waypoints,
  expanded,
  listId,
  headingId,
  highlighted,
  expandDisabled,
  onToggle,
  onRename,
  children,
}: PersonalWaypointCategoryGroupProps) {
  // The droppable id carries the category, so the drag handler can read the destination directly
  // instead of inferring it from whichever row happened to be under the pointer.
  const { ref, isDropTarget } = useDroppable({ id: `waypoint-category-drop-${category}`, data: { category } })

  return <section
    ref={ref}
    className="personal-waypoint-category-group"
    data-drop-target={highlighted || isDropTarget ? 'true' : 'false'}
  >
    <DisclosureHeader
      id={headingId}
      label={category}
      detail={personalWaypointCountLabel(waypoints.length)}
      expanded={expanded}
      controls={listId}
      expandDisabled={expandDisabled}
      onToggle={onToggle}
      onRename={onRename}
    />
    <div id={listId} hidden={!expanded}>{children}</div>
  </section>
}
