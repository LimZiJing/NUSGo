// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Map } from 'maplibre-gl'
import { applyBasemapTheme, toDarkColor, watchBasemapTheme } from './basemap-theme'

const LIGHT_BACKGROUND = 'hsl(47, 26%, 88%)'

function createFakeMap() {
  const layers = [
    { id: 'background', type: 'background', paint: { 'background-color': LIGHT_BACKGROUND } },
    {
      id: 'road',
      type: 'line',
      source: 'openmaptiles',
      paint: { 'line-color': ['interpolate', ['linear'], ['zoom'], 10, '#ffffff', 14, '#ffcc00'] },
    },
    { id: 'label', type: 'symbol', source: 'openmaptiles', paint: { 'text-color': '#222222' } },
    { id: 'natural', type: 'raster', source: 'ne2_shaded', paint: {} },
    { id: 'route', type: 'line', source: 'navus-route', paint: { 'line-color': '#ff0000' } },
  ]
  const handlers = new globalThis.Map<string, () => void>()
  return {
    layers,
    handlers,
    getStyle: vi.fn(() => ({
      layers,
      sources: {
        openmaptiles: { type: 'vector' },
        ne2_shaded: { type: 'raster' },
        'navus-route': { type: 'geojson' },
      },
    })),
    getLayer: vi.fn((id: string) => layers.find((layer) => layer.id === id)),
    // Like MapLibre, reject properties the layer does not have.
    setPaintProperty: vi.fn((id: string, property: string) => {
      const layer = layers.find((candidate) => candidate.id === id)
      if (layer?.type !== 'raster' && !(layer && property in layer.paint)) {
        throw new TypeError(`${id} has no ${property}`)
      }
    }),
    once: vi.fn((event: string, handler: () => void) => { handlers.set(event, handler) }),
    off: vi.fn(),
  }
}

afterEach(() => {
  delete document.documentElement.dataset.theme
})

describe('toDarkColor', () => {
  it('darkens surfaces and lightens text, preserving alpha', () => {
    expect(toDarkColor('#ffffff', 'surface')).toBe('hsla(215.0, 5.0%, 7.0%, 1)')
    expect(toDarkColor('#000000', 'text')).toMatch(/, 92\.0%, 1\)$/)
    expect(toDarkColor('rgba(255, 255, 255, 0.5)', 'halo')).toMatch(/, 0\.5\)$/)
  })

  it('returns unrecognised values untouched', () => {
    expect(toDarkColor('grass', 'surface')).toBe('grass')
  })
})

describe('applyBasemapTheme', () => {
  it('recolours basemap layers, including zoom expressions, and leaves overlays alone', () => {
    const map = createFakeMap()

    applyBasemapTheme(map as unknown as Map, 'dark')

    const calls = map.setPaintProperty.mock.calls
    expect(calls.some(([id]) => id === 'route')).toBe(false)
    expect(calls.find(([id, prop]) => id === 'background' && prop === 'background-color')?.[2])
      .toMatch(/^hsla\(/)
    const roadColor = calls.find(([id, prop]) => id === 'road' && prop === 'line-color')?.[2]
    expect(roadColor[0]).toBe('interpolate')
    expect(roadColor[4]).toMatch(/^hsla\(/)
    expect(calls).toContainEqual(['natural', 'raster-brightness-max', 0.3])
  })

  it('restores the original colours when switching back to light', () => {
    const map = createFakeMap()

    applyBasemapTheme(map as unknown as Map, 'dark')
    map.setPaintProperty.mockClear()
    applyBasemapTheme(map as unknown as Map, 'light')

    expect(map.setPaintProperty).toHaveBeenCalledWith('background', 'background-color', LIGHT_BACKGROUND)
  })

  it('does nothing for light before any dark theme was applied', () => {
    const map = createFakeMap()

    applyBasemapTheme(map as unknown as Map, 'light')

    expect(map.setPaintProperty).not.toHaveBeenCalled()
  })
})

describe('watchBasemapTheme', () => {
  it('applies the document theme once the style loads and follows later changes', async () => {
    const map = createFakeMap()
    document.documentElement.dataset.theme = 'dark'

    const stop = watchBasemapTheme(map as unknown as Map)
    expect(map.setPaintProperty).not.toHaveBeenCalled()

    map.handlers.get('style.load')?.()
    expect(map.setPaintProperty).toHaveBeenCalled()

    map.setPaintProperty.mockClear()
    document.documentElement.dataset.theme = 'light'
    await Promise.resolve()
    expect(map.setPaintProperty).toHaveBeenCalledWith('background', 'background-color', LIGHT_BACKGROUND)

    stop()
    expect(map.off).toHaveBeenCalledWith('style.load', expect.any(Function))
  })
})
