export const SETTINGS_SECTION_TITLES = {
  appearance: 'Appearance',
  notifications: 'Notifications',
  favourites: 'Favourites',
  about: 'About',
  waypoints: 'Waypoints',
} as const

export type SettingsSectionId = keyof typeof SETTINGS_SECTION_TITLES

export function getSettingsSectionTitle(sectionId: SettingsSectionId): string {
  return SETTINGS_SECTION_TITLES[sectionId]
}
