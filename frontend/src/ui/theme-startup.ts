import { applyTheme, getSystemTheme, readThemePreference } from './theme'

const preference = readThemePreference()
applyTheme(preference === 'system' ? getSystemTheme() : preference)
