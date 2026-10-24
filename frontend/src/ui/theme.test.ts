// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  applyTheme,
  readThemePreference,
  saveThemePreference,
  THEME_PREFERENCE_STORAGE_KEY,
} from './theme'

afterEach(() => {
  delete document.documentElement.dataset.theme
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('theme', () => {
  it('applies the selected theme to the document root', () => {
    applyTheme('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')

    applyTheme('light')
    expect(document.documentElement.dataset.theme).toBe('light')
  })

  it.each(['system', 'light', 'dark', 'nus', 'matcha', 'sakura'] as const)(
    'reads and saves the %s preference',
    (preference) => {
      saveThemePreference(preference)

      expect(localStorage.getItem(THEME_PREFERENCE_STORAGE_KEY)).toBe(preference)
      expect(readThemePreference()).toBe(preference)
    },
  )

  it('defaults to System for missing or invalid preferences', () => {
    expect(readThemePreference()).toBe('system')

    localStorage.setItem(THEME_PREFERENCE_STORAGE_KEY, 'unknown')
    expect(readThemePreference()).toBe('system')
  })

  it('defaults to System when browser storage cannot be read', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('Storage is unavailable')
    })

    expect(readThemePreference()).toBe('system')
  })

  it('keeps theme selection usable when browser storage cannot be written', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Storage is unavailable')
    })

    expect(() => saveThemePreference('sakura')).not.toThrow()
  })

  it('applies the saved preference during startup', async () => {
    localStorage.setItem(THEME_PREFERENCE_STORAGE_KEY, 'matcha')
    vi.resetModules()

    await import('./theme-startup')

    expect(document.documentElement.dataset.theme).toBe('matcha')
  })
})
