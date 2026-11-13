import { Button } from '../../../../ui/button'

/**
 * The collection's own commands. They are visible buttons rather than a third overflow menu, so the
 * screen has one menu-free action surface and Edit list / Clear all are discoverable without hunting.
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
  return <div className="personal-waypoint-list-actions">
    <Button
      label={editing ? 'Done' : 'Edit list'}
      variant="ghost"
      onClick={onToggleEditing}
    />
    <Button
      label="Clear all"
      variant="ghost"
      onClick={() => {
        if (hasSearchFilter) return
        if (window.confirm('Clear all personal waypoints, including places hidden by filters?')) onClearAll()
      }}
      disabled={hasSearchFilter}
    />
  </div>
}
