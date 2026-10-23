export type Theme = 'light' | 'dark'
export type ThemePreference = 'system' | Theme

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
