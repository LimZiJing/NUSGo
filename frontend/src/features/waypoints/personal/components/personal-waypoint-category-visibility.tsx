import { useMemo, useState } from 'react'
import type { Ref } from 'react'
import type { PersonalWaypointCategoryOption } from '../../../../domain/waypoints/personal/personal-waypoint-category-visibility'
import { Button } from '../../../../ui/button'
import { ChevronDownIcon } from '../../../../ui/icons'
import { SearchField } from '../../../../ui/search-field'

export function PersonalWaypointCategoryVisibility({
  categories,
  hiddenCategories,
  draftHiddenCategories,
  pickerOpen,
  onTogglePicker,
  onSetCategoryVisible,
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
  // One alphabetical list, in the same order whether or not a category is shown. Splitting it into
  // "Selected" and "All categories" made ticking a box move that row out from under the pointer,
  // which is the one thing a checkbox should never do.
  const visibleCategories = categories.filter(
    ({ category }) => category.toLocaleLowerCase().includes(query),
  )
  const hasPendingChanges = categories.some(({ category }) => draftHidden.has(category) !== committedHidden.has(category))
  // How many categories this draft would change, which is what the person is about to apply.
  const pendingChangeCount = categories.filter(
    ({ category }) => draftHidden.has(category) !== committedHidden.has(category),
  ).length

  const renderCategory = ({ category, waypointCount }: PersonalWaypointCategoryOption) => {
    const placeLabel = waypointCount === 1 ? 'place' : 'places'
    const visible = !draftHidden.has(category)
    // Membership, so a checkbox rather than an icon button. The row used to end in a ✕ when
    // hidden, which in this screen already means "delete this waypoint"; a checkbox says
    // "included or not" without borrowing the vocabulary of destruction. The whole row is the
    // label, so the tap target is the row and the box stays purely visual.
    return <label
      className={`personal-waypoint-category-option${visible ? '' : ' personal-waypoint-category-option-hidden'}`}
      key={category}
    >
      <input
        type="checkbox"
        className="personal-waypoint-category-check"
        // The row is the label, so this is what a screen reader announces for the whole row.
        aria-label={`Show ${category} on the map`}
        checked={visible}
        onChange={(event) => onSetCategoryVisible(category, event.target.checked)}
      />
      <span className="personal-waypoint-category-name">{category}</span>
      <small>{waypointCount} {placeLabel}</small>
    </label>
  }

  return <section className="personal-waypoint-visibility" aria-label="Map categories">
    <h2 className="personal-waypoint-visibility-heading">
      <button
        id="personal-waypoint-visibility-heading"
        className="personal-waypoint-visibility-trigger"
        ref={triggerRef}
        type="button"
        aria-expanded={pickerOpen}
        aria-controls="personal-waypoint-category-picker"
        onClick={onTogglePicker}
      >
        <span className="personal-waypoint-visibility-summary">
          <span className="personal-waypoint-visibility-label">Categories</span>
          {/* Only what fits. "Changes pending" used to be appended here and was clipped mid-word
              at phone width; the pending count now sits on Done, which states it exactly. */}
          <span className="personal-waypoint-visibility-selection" aria-live="polite">
            {selectedCategories.length} of {categories.length} shown
          </span>
        </span>
        <ChevronDownIcon aria-hidden="true" />
      </button>
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
        {visibleCategories.map(renderCategory)}
        {visibleCategories.length === 0 && (
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
          {/* The count says what Done will actually apply. It used to show how many categories were
              shown, which never changes with the draft and so described the wrong thing entirely. */}
          <Button
            label={hasPendingChanges ? `Done (${pendingChangeCount})` : 'Done'}
            variant="primary"
            onClick={onDone}
          />
        </div>
      </div>
    </div>
  </section>
}
