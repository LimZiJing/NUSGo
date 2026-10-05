import type { ExploreViewState } from './state'

export function getExploreShellClassName(
  state: ExploreViewState,
  minimized: boolean,
): string {
  const venueSearchView = state.mode === 'neutral' || state.mode === 'venue-search'
  return `explore-view explore-view-${state.mode}${venueSearchView ? ' explore-view-venue-search' : ''}${minimized ? ' explore-view-minimized' : ''}`
}
