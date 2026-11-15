import { EditIcon, TrashIcon } from '../../../../ui/icons'
import { MenuItem } from '../../../../ui/menu-item'
import { OverflowMenu } from '../../../../ui/overflow-menu'

/**
 * The collection's own commands. They live in the one overflow menu this screen is allowed, rather
 * than as header buttons competing with the page title.
 *
 * While editing, this menu offers no way to finish: Confirm and Cancel are visible commands on the
 * screen itself. Clear all keeps its place, because it is a collection command rather than a way to
 * end the edit.
 */
export function PersonalWaypointListActions({
  editing,
  hasSearchFilter,
  onToggleEditing,
  onClearAll,
}: {
  readonly editing: boolean
  readonly hasSearchFilter: boolean
  readonly onToggleEditing: () => void
  readonly onClearAll: () => void
}) {
  return <OverflowMenu label="Waypoint list options" menuLabel="Waypoint list commands">
    {!editing && <MenuItem
      label="Edit list"
      icon={<EditIcon />}
      onClick={onToggleEditing}
    />}
    <MenuItem
      label="Clear all"
      icon={<TrashIcon />}
      disabled={hasSearchFilter}
      onClick={() => {
        if (hasSearchFilter) return
        if (window.confirm('Clear all personal waypoints, including places hidden by filters?')) onClearAll()
      }}
    />
  </OverflowMenu>
}
