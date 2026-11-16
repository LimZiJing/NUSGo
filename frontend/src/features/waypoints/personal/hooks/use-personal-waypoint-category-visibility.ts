import { useCallback, useState } from 'react'
import type { PersonalWaypointCategoryVisibilityStore } from '../../../../domain/waypoints/personal/personal-waypoint-category-visibility-store'
import { mergeCategoryVisibility } from '../../../../domain/waypoints/personal/personal-waypoint-category-rename'

function getReadStatus(kind: 'invalid' | 'unavailable'): string {
  return kind === 'invalid'
    ? 'Saved map category settings could not be read. All categories are shown.'
    : 'Map category settings are unavailable. All categories are shown.'
}

export function usePersonalWaypointCategoryVisibility(store: PersonalWaypointCategoryVisibilityStore) {
  const [initialRead] = useState(() => store.read())
  const [hiddenCategories, setHiddenCategories] = useState<readonly string[]>(
    initialRead.kind === 'ready' ? initialRead.hiddenCategories : [],
  )
  const [draftHiddenCategories, setDraftHiddenCategories] = useState<readonly string[]>(hiddenCategories)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [status, setStatus] = useState<string | null>(
    initialRead.kind === 'ready' ? null : getReadStatus(initialRead.kind),
  )

  const setCategoryVisible = useCallback((category: string, visible: boolean) => {
    setDraftHiddenCategories((current) => visible
      ? current.filter((hiddenCategory) => hiddenCategory !== category)
      : current.includes(category) ? current : [...current, category])
  }, [])

  const clearCategoryVisibilityChanges = useCallback((categories: readonly string[]) => {
    setDraftHiddenCategories([...categories])
  }, [])

  const cancelCategoryVisibilityChanges = useCallback(() => {
    setDraftHiddenCategories([...hiddenCategories])
    setPickerOpen(false)
  }, [hiddenCategories])

  const saveCategoryVisibilityChanges = useCallback(() => {
    const nextHiddenCategories = [...draftHiddenCategories]
    setHiddenCategories(nextHiddenCategories)
    setDraftHiddenCategories(nextHiddenCategories)
    setPickerOpen(false)

    const result = store.write(nextHiddenCategories)
    setStatus(result.kind === 'saved'
      ? null
      : 'Map category settings could not be saved. The change applies until this page is reloaded.')
  }, [draftHiddenCategories, store])

  /**
   * Whether a merged category would be shown on the map. Read-only on purpose: the merge itself is
   * staged with the rest of the collection edit, so answering this must not write. It predicts from
   * the stored preferences, which is what the write at Confirm starts from.
   */
  const predictCategoryMergeVisibility = useCallback((from: string, to: string): boolean | null => {
    const latest = store.read()
    if (latest.kind !== 'ready') {
      setStatus(getReadStatus(latest.kind))
      return null
    }
    return mergeCategoryVisibility(latest.hiddenCategories, from, to).visibleAfter
  }, [store])

  /**
   * Folds a category rename into the stored preferences in one write, at the moment the collection
   * edit is confirmed. Until then a rename is only staged, so writing here would hide or show a
   * name the collection does not have yet, and would keep doing so if the person then cancelled.
   *
   * Renames are applied in order because a later one can touch a name an earlier one produced.
   */
  const applyCategoryRenames = useCallback((
    renames: readonly { readonly from: string; readonly to: string }[],
  ): boolean => {
    if (renames.length === 0) return true
    const latest = store.read()
    if (latest.kind !== 'ready') {
      setStatus(getReadStatus(latest.kind))
      return false
    }
    let nextHidden = latest.hiddenCategories
    for (const { from, to } of renames) {
      nextHidden = mergeCategoryVisibility(nextHidden, from, to).hiddenCategories
    }

    setHiddenCategories(nextHidden)
    setDraftHiddenCategories((current) => {
      let next = current
      for (const { from, to } of renames) next = mergeCategoryVisibility(next, from, to).hiddenCategories
      return next
    })
    const result = store.write(nextHidden)
    if (result.kind !== 'saved') {
      setStatus('Map category settings could not be saved. The change applies until this page is reloaded.')
      return false
    }
    setStatus(null)
    return true
  }, [store])


  const togglePicker = useCallback(() => setPickerOpen((open) => !open), [])
  const openPicker = useCallback(() => setPickerOpen(true), [])

  return {
    hiddenCategories,
    draftHiddenCategories,
    pickerOpen,
    setCategoryVisible,
    clearCategoryVisibilityChanges,
    cancelCategoryVisibilityChanges,
    saveCategoryVisibilityChanges,
    togglePicker,
    predictCategoryMergeVisibility,
    applyCategoryRenames,
    openPicker,
    status,
  }
}
