import type { PersonalWaypointCategoryOption } from '../../../../domain/waypoints/personal/personal-waypoint-category-visibility'
import { Button } from '../../../../ui/button'

export function PersonalWaypointCategoryVisibility({
  categories,
  hiddenCategories,
  onSetCategoryVisible,
  onShowAll,
}: {
  readonly categories: readonly PersonalWaypointCategoryOption[]
  readonly hiddenCategories: readonly string[]
  readonly onSetCategoryVisible: (category: string, visible: boolean) => void
  readonly onShowAll: () => void
}) {
  return <section className="personal-waypoint-visibility" aria-labelledby="personal-waypoint-visibility-heading">
    <div className="personal-waypoint-visibility-heading">
      <div>
        <h2 id="personal-waypoint-visibility-heading">Map categories</h2>
      </div>
    </div>
    <div className="personal-waypoint-category-options" role="group" aria-label="Personal Waypoint map categories">
      {categories.map(({ category, waypointCount }) => {
        const visible = !hiddenCategories.includes(category)
        const places = waypointCount === 1 ? 'place' : 'places'
        return <label className="personal-waypoint-category-option" key={category}>
          <span className="personal-waypoint-category-label">
            <span>{category}</span>
            <small>{waypointCount} {places}</small>
          </span>
          <input
            type="checkbox"
            checked={visible}
            aria-label={`Show ${category} markers`}
            onChange={(event) => onSetCategoryVisible(category, event.target.checked)}
          />
        </label>
      })}
    </div>
    <Button
      label="Show all categories"
      variant="ghost"
      size="sm"
      onClick={onShowAll}
      disabled={hiddenCategories.length === 0}
    />
  </section>
}
