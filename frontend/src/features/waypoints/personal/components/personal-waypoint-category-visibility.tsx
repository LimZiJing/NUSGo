import { useMemo, useState } from 'react'
import type { Ref } from 'react'
import type { PersonalWaypointCategoryOption } from '../../../../domain/waypoints/personal/personal-waypoint-category-visibility'
import { Button } from '../../../../ui/button'
import { ChevronDownIcon, ChevronRightIcon } from '../../../../ui/icons'
import { SearchField } from '../../../../ui/search-field'

export function PersonalWaypointCategoryVisibility({
  categories,
  hiddenCategories,
  draftHiddenCategories,
  pickerOpen,
  onTogglePicker,
  onSetCategoryVisible,
  onOpenCategory,
  triggerRef,
  onClear,
  onCancel,
  onDone,
}: {
  readonly categories: readonly PersonalWaypointCategoryOption[]
  readonly hiddenCategories: readonly string[]
  readonly draftHiddenCategories: readonly string[]
  readonly pickerOpen: boolean
  readonly onTogglePicker: () => void
  readonly onSetCategoryVisible: (category: string, visible: boolean) => void
  readonly onOpenCategory: (category: string) => void
  readonly triggerRef?: Ref<HTMLButtonElement>
  readonly onClear: () => void
  readonly onCancel: () => void
  readonly onDone: () => void
}) {
  const [searchQuery, setSearchQuery] = useState('')
  const draftHidden = useMemo(() => new Set(draftHiddenCategories), [draftHiddenCategories])
  const committedHidden = useMemo(() => new Set(hiddenCategories), [hiddenCategories])
  const selectedCategories = categories.filter(({ category }) => !draftHidden.has(category))
  const unselectedCategories = categories.filter(({ category }) => draftHidden.has(category))
  const query = searchQuery.trim().toLocaleLowerCase()
  const filterCategories = (options: readonly PersonalWaypointCategoryOption[]) => options.filter(
    ({ category }) => category.toLocaleLowerCase().includes(query),
  )
  const visibleSelectedCategories = filterCategories(selectedCategories)
  const visibleUnselectedCategories = filterCategories(unselectedCategories)
  const hasPendingChanges = categories.some(({ category }) => draftHidden.has(category) !== committedHidden.has(category))

  const renderCategory = ({ category, waypointCount }: PersonalWaypointCategoryOption) => {
    const placeLabel = waypointCount === 1 ? 'place' : 'places'
    const visible = !draftHidden.has(category)
    return <div className="personal-waypoint-category-option" key={category}>
      <Button
        className="personal-waypoint-category-link"
        type="button"
        ariaLabel={`Open ${category}, ${waypointCount} ${placeLabel}`}
        onClick={() => onOpenCategory(category)}
      >
        <span className="personal-waypoint-category-dot" aria-hidden="true" />
        <span className="personal-waypoint-category-name">{category}</span>
        <small>{waypointCount} {placeLabel}</small>
        <ChevronRightIcon aria-hidden="true" />
      </Button>
      <label className="personal-waypoint-category-toggle">
        <input
          type="checkbox"
          checked={visible}
          aria-label={`Show ${category} markers`}
          onChange={(event) => onSetCategoryVisible(category, event.target.checked)}
        />
      </label>
    </div>
  }

  return <section className="personal-waypoint-visibility" aria-label="Map categories">
    <h2 className="personal-waypoint-visibility-heading">
      <Button
        id="personal-waypoint-visibility-heading"
        className="personal-waypoint-visibility-trigger"
        ref={triggerRef}
        type="button"
        expanded={pickerOpen}
        controls="personal-waypoint-category-picker"
        onClick={onTogglePicker}
      >
        <span className="personal-waypoint-visibility-summary">
          <span className="personal-waypoint-visibility-label">Categories</span>
          <span className="personal-waypoint-visibility-selection" aria-live="polite">
            {selectedCategories.length} of {categories.length} shown
            {hasPendingChanges && <span className="personal-waypoint-visibility-pending"> · Changes pending</span>}
          </span>
        </span>
        <ChevronDownIcon aria-hidden="true" />
      </Button>
    </h2>
    <div className="personal-waypoint-category-picker" id="personal-waypoint-category-picker" hidden={!pickerOpen}>
      <div className="personal-waypoint-category-search">
        <SearchField
          aria-label="Search categories"
          placeholder="Search categories..."
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
        />
      </div>
      <div className="personal-waypoint-category-options" role="group" aria-label="Category places and map visibility">
        {visibleSelectedCategories.length > 0 && <section className="personal-waypoint-category-group" aria-labelledby="personal-waypoint-selected-categories-heading">
          <h3 id="personal-waypoint-selected-categories-heading">Selected</h3>
          {visibleSelectedCategories.map(renderCategory)}
        </section>}
        {visibleUnselectedCategories.length > 0 && <section className="personal-waypoint-category-group" aria-labelledby="personal-waypoint-all-categories-heading">
          <h3 id="personal-waypoint-all-categories-heading">All categories</h3>
          {visibleUnselectedCategories.map(renderCategory)}
        </section>}
        {visibleSelectedCategories.length === 0 && visibleUnselectedCategories.length === 0 && (
          <p className="personal-waypoint-category-empty" role="status">No categories match your search.</p>
        )}
      </div>
      <div className="personal-waypoint-visibility-actions">
        <div className="personal-waypoint-visibility-actions-start">
          <Button
            label="Clear"
            variant="ghost"
            onClick={onClear}
            disabled={selectedCategories.length === 0}
          />
          {unselectedCategories.length > 0 && <Button
            label="Show all"
            variant="ghost"
            onClick={() => categories.forEach(({ category }) => onSetCategoryVisible(category, true))}
          />}
        </div>
        <div className="personal-waypoint-visibility-actions-end">
          <Button label="Cancel" onClick={onCancel} />
          <Button label={`Done (${selectedCategories.length})`} variant="primary" onClick={onDone} />
        </div>
      </div>
    </div>
  </section>
}
