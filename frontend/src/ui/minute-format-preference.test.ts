// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest'
import {
  MINUTE_FORMAT_PREFERENCE_STORAGE_KEY,
  readMinuteFormatPreference,
  saveMinuteFormatPreference,
} from './minute-format-preference'

describe('minute format preference', () => {
  beforeEach(() => window.localStorage.clear())

  it('defaults to prime minutes when storage is missing or invalid', () => {
    expect(readMinuteFormatPreference()).toBe('prime')

    window.localStorage.setItem(MINUTE_FORMAT_PREFERENCE_STORAGE_KEY, 'unknown')
    expect(readMinuteFormatPreference()).toBe('prime')
  })

  it('restores and saves a valid preference', () => {
    window.localStorage.setItem(MINUTE_FORMAT_PREFERENCE_STORAGE_KEY, 'min')
    expect(readMinuteFormatPreference()).toBe('min')

    saveMinuteFormatPreference('m')
    expect(readMinuteFormatPreference()).toBe('m')
  })
})
