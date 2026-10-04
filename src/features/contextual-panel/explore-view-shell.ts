import type { ContextualPanelState } from './state'

export function getExploreShellClassName(
  state: ContextualPanelState,
  minimized: boolean,
): string {
  const venueSearchView = state.mode === 'neutral' || state.mode === 'venue-search'
  return `contextual-panel contextual-panel-${state.mode}${venueSearchView ? ' contextual-panel-venue-search' : ''}${minimized ? ' contextual-panel-minimized' : ''}`
}
