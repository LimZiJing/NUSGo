// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { getDocumentTheme, getOverlayPalette } from './overlay-theme'
import { toDarkColor } from './basemap-theme'

afterEach(() => {
  delete document.documentElement.dataset.theme
  document.documentElement.removeAttribute('style')
})

describe('overlay theme', () => {
  it('uses the basemap tone configured by the active stylesheet', () => {
    document.documentElement.style.setProperty('--map-basemap-tone', 'dark')
    expect(getDocumentTheme()).toBe('dark')
    document.documentElement.style.setProperty('--map-basemap-tone', 'light')
    expect(getDocumentTheme()).toBe('light')
  })

  it('gives dark stop labels light text on a dark halo', () => {
    document.documentElement.style.setProperty('--map-basemap-tone', 'light')
    const light = getOverlayPalette()
    document.documentElement.style.setProperty('--map-basemap-tone', 'dark')
    const dark = getOverlayPalette()
    expect(light.stopText).toBe('#0f172a')
    expect(dark.stopText).not.toBe(light.stopText)
    expect(dark.stopHalo).not.toBe(light.stopHalo)
    expect(dark.routeBase).not.toBe(light.routeBase)
  })

  it('reads overlay colours configured by the active theme stylesheet', () => {
    document.documentElement.style.setProperty('--map-basemap-tone', 'dark')
    document.documentElement.style.setProperty('--map-route-base', '#c0bfad')
    document.documentElement.style.setProperty('--map-stop-halo', '#293431')
    document.documentElement.style.setProperty('--map-stop-text', '#f2efe5')
    const palette = getOverlayPalette()
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
