// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { getDocumentTheme, getOverlayPalette } from './overlay-theme'
import { toDarkColor } from './basemap-theme'

afterEach(() => {
  delete document.documentElement.dataset.theme
})

describe('overlay theme', () => {
  it('uses dark map treatments for Dark and Rainroom', () => {
    document.documentElement.dataset.theme = 'dark'
    expect(getDocumentTheme()).toBe('dark')
    document.documentElement.dataset.theme = 'sakura'
    expect(getDocumentTheme()).toBe('light')
    document.documentElement.dataset.theme = 'rainroom'
    expect(getDocumentTheme()).toBe('rainroom')
  })

  it('gives dark stop labels light text on a dark halo', () => {
    const light = getOverlayPalette('light')
    const dark = getOverlayPalette('dark')
    expect(light.stopText).toBe('#0f172a')
    expect(dark.stopText).not.toBe(light.stopText)
    expect(dark.stopHalo).not.toBe(light.stopHalo)
    expect(dark.routeBase).not.toBe(light.routeBase)
  })

  it('uses warm mist and moss-neutral overlays for Rainroom', () => {
    const palette = getOverlayPalette('rainroom')
    expect(palette.routeBase).toBe('#c0bfad')
    expect(palette.stopHalo).toBe('#293431')
    expect(palette.stopText).toBe('#f2efe5')
  })

  it('mutes yellow roads much harder than blue lines', () => {
    const saturation = (colour: string) => Number.parseFloat(colour.split(',')[1])
    expect(saturation(toDarkColor('hsl(48, 100%, 55%)', 'line')))
      .toBeLessThan(saturation(toDarkColor('hsl(210, 100%, 55%)', 'line')) / 2)
  })
})
