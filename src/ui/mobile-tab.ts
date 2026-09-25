export const MOBILE_TABS = [
  { id: 'explore', label: 'Explore', panelId: 'mobile-explore-panel' },
  { id: 'stops', label: 'Stops', panelId: 'mobile-stops-panel' },
  { id: 'plan', label: 'Plan', panelId: 'mobile-plan-panel' },
] as const

export type MobileTab = (typeof MOBILE_TABS)[number]['id']
