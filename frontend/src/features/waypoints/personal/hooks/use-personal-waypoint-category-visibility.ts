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
  const [status, setStatus] = useState<string | null>(
    initialRead.kind === 'ready' ? null : getReadStatus(initialRead.kind),
  )

  const save = useCallback((nextHiddenCategories: readonly string[]) => {
    setHiddenCategories(nextHiddenCategories)
    const result = store.write(nextHiddenCategories)
    setStatus(result.kind === 'saved'
      ? null
      : 'Map category settings could not be saved. The change applies until this page is reloaded.')
  }, [store])

  const setCategoryVisible = useCallback((category: string, visible: boolean) => {
    const nextHiddenCategories = visible
      ? hiddenCategories.filter((hiddenCategory) => hiddenCategory !== category)
      : hiddenCategories.includes(category) ? hiddenCategories : [...hiddenCategories, category]
    save(nextHiddenCategories)
  }, [hiddenCategories, save])

  const showAllCategories = useCallback(() => save([]), [save])

  return { hiddenCategories, setCategoryVisible, showAllCategories, status }
}
