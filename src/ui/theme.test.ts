// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import { applyTheme } from './theme'

afterEach(() => {
  delete document.documentElement.dataset.theme
})

describe('theme', () => {
  it('applies the selected theme to the document root', () => {
    applyTheme('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')

    applyTheme('light')
    expect(document.documentElement.dataset.theme).toBe('light')
  })
})
