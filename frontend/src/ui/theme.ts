export type Theme = 'light' | 'dark' | 'nus' | 'matcha' | 'sakura'
export type ThemePreference = 'system' | Theme

export const THEME_PREFERENCE_STORAGE_KEY = 'navus:theme-preference:v1'

export function readThemePreference(): ThemePreference {
  try {
    const preference = window.localStorage.getItem(THEME_PREFERENCE_STORAGE_KEY)
    return isThemePreference(preference) ? preference : 'system'
  } catch {
    return 'system'
  }
}

export function saveThemePreference(preference: ThemePreference): void {
  try {
    window.localStorage.setItem(THEME_PREFERENCE_STORAGE_KEY, preference)
  } catch {
    // Theme changes still apply for this session when browser storage is unavailable.
  }
}

function isThemePreference(value: string | null): value is ThemePreference {
  return value === 'system' ||
    value === 'light' ||
    value === 'dark' ||
    value === 'nus' ||
    value === 'matcha' ||
    value === 'sakura'
}

export function getSystemTheme(): Theme {
  return typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme
}

export function subscribeToSystemThemeChanges(listener: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return () => undefined
  }

  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
  if (typeof mediaQuery.addEventListener === 'function') {
    mediaQuery.addEventListener('change', listener)
    return () => mediaQuery.removeEventListener('change', listener)
  }

  mediaQuery.addListener?.(listener)
  return () => mediaQuery.removeListener?.(listener)
}
