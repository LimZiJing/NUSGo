import {
  DEFAULT_MINUTE_FORMAT,
  isMinuteFormat,
  type MinuteFormat,
} from '../domain/trip/minute-format'

export const MINUTE_FORMAT_PREFERENCE_STORAGE_KEY = 'navus:minute-format:v1'

export function readMinuteFormatPreference(): MinuteFormat {
  try {
    const preference = window.localStorage.getItem(MINUTE_FORMAT_PREFERENCE_STORAGE_KEY)
    return isMinuteFormat(preference) ? preference : DEFAULT_MINUTE_FORMAT
  } catch {
    return DEFAULT_MINUTE_FORMAT
  }
}

export function saveMinuteFormatPreference(preference: MinuteFormat): void {
  try {
    window.localStorage.setItem(MINUTE_FORMAT_PREFERENCE_STORAGE_KEY, preference)
  } catch {
    // The selection still applies for this session when browser storage is unavailable.
  }
}
