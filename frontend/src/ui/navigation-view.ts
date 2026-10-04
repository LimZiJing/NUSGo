export const NAVIGATION_VIEWS = [
  { id: 'explore', label: 'Explore', panelId: 'explore-panel' },
  { id: 'stops', label: 'Stops', panelId: 'stops-panel' },
  { id: 'plan', label: 'Plan', panelId: 'plan-panel' },
] as const

export type NavigationView = (typeof NAVIGATION_VIEWS)[number]['id']
