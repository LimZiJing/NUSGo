import { useCallback, useState } from 'react'
import type { PersonalWaypointCategoryVisibilityStore } from '../../../../domain/waypoints/personal/personal-waypoint-category-visibility-store'

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

  const setCategoryVisibleImmediately = useCallback((category: string, visible: boolean) => {
    const latest = store.read()
    if (latest.kind !== 'ready') {
      setStatus(getReadStatus(latest.kind))
      return false
    }
    const currentHidden = latest.hiddenCategories
    const nextHidden = visible
      ? currentHidden.filter((item) => item !== category)
      : currentHidden.includes(category) ? [...currentHidden] : [...currentHidden, category]
    const result = store.write(nextHidden)
    if (result.kind !== 'saved') {
      setStatus('Map category settings could not be saved. The category visibility was not changed.')
      return false
    }
    setHiddenCategories(nextHidden)
    setDraftHiddenCategories((current) => visible
      ? current.filter((item) => item !== category)
      : current.includes(category) ? current : [...current, category])
    setStatus(null)
    return true
  }, [store])

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

  const togglePicker = useCallback(() => setPickerOpen((open) => !open), [])
  const openPicker = useCallback(() => setPickerOpen(true), [])

  return {
    hiddenCategories,
    draftHiddenCategories,
    pickerOpen,
    setCategoryVisible,
    setCategoryVisibleImmediately,
    clearCategoryVisibilityChanges,
    cancelCategoryVisibilityChanges,
    saveCategoryVisibilityChanges,
    togglePicker,
    openPicker,
    status,
  }
}
