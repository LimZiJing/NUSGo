import { Button } from '../../../../ui/button'
import { CheckIcon, CloseIcon } from '../../../../ui/icons'

/**
 * The edit-mode command bar. It replaces Add waypoint while editing, so the screen has exactly one
 * pair of decisive actions and no competing primary button.
 *
 * Confirm writes the staged list in one go; Cancel discards it. Neither is reachable from the
 * overflow menu, so finishing or abandoning an edit is always a visible choice.
 */
export function PersonalWaypointEditActions({
  onConfirm,
  onCancel,
}: {
  readonly onConfirm: () => void
  readonly onCancel: () => void
}) {
  return <div className="personal-waypoint-edit-actions">
    <Button
      className="personal-waypoint-edit-action"
      label="Cancel"
      icon={<CloseIcon />}
      variant="secondary"
      onClick={onCancel}
    />
    <Button
      className="personal-waypoint-edit-action"
      label="Confirm"
      icon={<CheckIcon />}
      variant="primary"
      onClick={onConfirm}
    />
  </div>
}
