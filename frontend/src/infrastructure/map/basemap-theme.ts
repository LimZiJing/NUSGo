import type { Map } from 'maplibre-gl'
import { getDocumentTheme } from './overlay-theme'

export type BasemapTheme = 'light' | 'dark'

type ColorRole = 'surface' | 'line' | 'text' | 'halo'

const COLOR_PROPERTY_ROLES: Readonly<Record<string, ColorRole>> = {
  'background-color': 'surface',
  'fill-color': 'surface',
  'fill-outline-color': 'line',
  'fill-extrusion-color': 'surface',
  'line-color': 'line',
  'text-color': 'text',
  'text-halo-color': 'halo',
}

// Natural Earth raster tiles only show at low zoom; dim them rather than recolour them.
const DARK_RASTER_PAINT = {
  'raster-brightness-max': 0.3,
  'raster-saturation': -0.3,
} as const

type Rgba = readonly [number, number, number, number]

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function parseChannel(token: string): number {
  const value = Number.parseFloat(token)
  return token.endsWith('%') ? value * 2.55 : value
}

function parseAlpha(token: string | undefined): number {
  if (token === undefined) return 1
  const value = Number.parseFloat(token)
  return token.endsWith('%') ? value / 100 : value
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const hue = ((h % 360) + 360) % 360
  const chroma = (1 - Math.abs(2 * l - 1)) * s
  const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1))
  const m = l - chroma / 2
  const [r, g, b] = hue < 60 ? [chroma, x, 0]
    : hue < 120 ? [x, chroma, 0]
      : hue < 180 ? [0, chroma, x]
        : hue < 240 ? [0, x, chroma]
          : hue < 300 ? [x, 0, chroma]
            : [chroma, 0, x]
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255]
}

/** Parses the #hex, rgb()/rgba() and hsl()/hsla() forms the OpenFreeMap styles use. */
function parseColor(value: string): Rgba | null {
  const text = value.trim().toLowerCase()
  const hex = /^#([0-9a-f]{3,8})$/.exec(text)
  if (hex) {
    const digits = hex[1]
    if (![3, 4, 6, 8].includes(digits.length)) return null
    const full = digits.length <= 4
      ? [...digits].map((digit) => digit + digit).join('')
      : digits
    const channel = (index: number) => Number.parseInt(full.slice(index * 2, index * 2 + 2), 16)
    return [channel(0), channel(1), channel(2), full.length === 8 ? channel(3) / 255 : 1]
  }

  const functional = /^(rgba?|hsla?)\(([^)]*)\)$/.exec(text)
  if (!functional) return null
  const tokens = functional[2].split(/[\s,/]+/).filter(Boolean)
  if (tokens.length < 3 || tokens.length > 4) return null
  const alpha = parseAlpha(tokens[3])
  if (functional[1].startsWith('rgb')) {
    return [parseChannel(tokens[0]), parseChannel(tokens[1]), parseChannel(tokens[2]), alpha]
  }
  const [r, g, b] = hslToRgb(
    Number.parseFloat(tokens[0]),
    clamp(Number.parseFloat(tokens[1]) / 100, 0, 1),
    clamp(Number.parseFloat(tokens[2]) / 100, 0, 1),
  )
  return [r, g, b, alpha]
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const red = r / 255
  const green = g / 255
  const blue = b / 255
  const max = Math.max(red, green, blue)
  const min = Math.min(red, green, blue)
  const lightness = (max + min) / 2
  const delta = max - min
  if (delta === 0) return [0, 0, lightness]
  const saturation = delta / (1 - Math.abs(2 * lightness - 1))
  const hue = max === red ? ((green - blue) / delta) % 6
    : max === green ? (blue - red) / delta + 2
      : (red - green) / delta + 4
  return [hue * 60, saturation, lightness]
}

/**
 * Light colours become dark and dark colours become light, with each role
 * compressed into a range that keeps the basemap quiet behind route overlays.
 */
function darkLightness(lightness: number, role: ColorRole): number {
  switch (role) {
    case 'surface': return 0.07 + 0.3 * (1 - lightness)
    case 'halo': return 0.06 + 0.2 * (1 - lightness)
    // Lines keep their hierarchy: pale casings stay darker than the road they frame.
    case 'line': return 0.1 + 0.22 * lightness
    case 'text': return clamp(1 - lightness, 0.62, 0.92)
  }
}

const COOL_NEUTRAL_HUE = 215

/** Moves a hue towards the cool neutral along the shorter arc. */
function pullHueTowardsCool(hue: number, weight: number): number {
  const delta = ((COOL_NEUTRAL_HUE - hue + 540) % 360) - 180
  return (hue + delta * weight + 360) % 360
}

const MAJOR_ROAD_LIGHTNESS = { min: 0.3, max: 0.42 }

function isWarmAndVivid(hue: number, saturation: number): boolean {
  return hue >= 15 && hue <= 70 && saturation > 0.3
}

export function toDarkColor(value: string, role: ColorRole): string {
  const rgba = parseColor(value)
  if (!rgba) return value
  const [hue, saturation, lightness] = rgbToHsl(rgba[0], rgba[1], rgba[2])
  const alpha = Math.round(rgba[3] * 1000) / 1000
  const format = (h: number, s: number, l: number): string => (
    `hsla(${h.toFixed(1)}, ${(clamp(s, 0, 1) * 100).toFixed(1)}%, ${(l * 100).toFixed(1)}%, ${alpha})`
  )

  if (role === 'text') {
    return format(hue, saturation * 0.6, darkLightness(lightness, role))
  }
  if (role === 'line' && isWarmAndVivid(hue, saturation)) {
    // Liberty draws major roads in yellow and orange. Like Google's dark map, show them as a
    // lighter slate so the hierarchy stays without the glare.
    return format(
      COOL_NEUTRAL_HUE,
      0.25,
      clamp(0.14 + 0.4 * lightness, MAJOR_ROAD_LIGHTNESS.min, MAJOR_ROAD_LIGHTNESS.max),
    )
  }

  // Greens, blues and teals (parks, water) keep their colour; warm tones are muted, and weakly
  // coloured values drift to a cool neutral instead of turning muddy brown.
  const natural = hue >= 80 && hue <= 250
  const neutrality = clamp(1 - saturation / 0.6, 0, 1)
  const nextHue = pullHueTowardsCool(hue, neutrality)
  const nextSaturation = saturation * (natural ? 0.8 : 0.4) * (1 - neutrality)
    + (role === 'line' ? 0.18 : 0.05) * neutrality
  return format(nextHue, nextSaturation, darkLightness(lightness, role))
}

const QUIET_SURFACE_LIGHTNESS_CEILING = 0.88
const QUIET_ROAD_LIGHTNESS = { min: 0.86, max: 0.92 }
const QUIET_WARM_HUE = 38

/**
 * Calms Liberty's light palette so route and stop overlays carry the colour: saturation drops,
 * strongly coloured fills lift towards pale, and the yellow and orange roads become warm greys.
 */
export function toQuietColor(value: string, role: ColorRole): string {
  const rgba = parseColor(value)
  if (!rgba) return value
  // Halos keep the label legible against whatever sits behind it.
  if (role === 'halo') return value
  const [hue, saturation, lightness] = rgbToHsl(rgba[0], rgba[1], rgba[2])
  const alpha = Math.round(rgba[3] * 1000) / 1000
  const format = (h: number, s: number, l: number): string => (
    `hsla(${h.toFixed(1)}, ${(clamp(s, 0, 1) * 100).toFixed(1)}%, ${(l * 100).toFixed(1)}%, ${alpha})`
  )

  if (role === 'text') return format(hue, saturation * 0.5, lightness)
  if (role === 'line' && isWarmAndVivid(hue, saturation)) {
    return format(
      QUIET_WARM_HUE,
      0.28,
      clamp(lightness + 0.07, QUIET_ROAD_LIGHTNESS.min, QUIET_ROAD_LIGHTNESS.max),
    )
  }

  const natural = hue >= 80 && hue <= 250
  const nextSaturation = saturation * (natural ? 0.65 : 0.4)
  const nextLightness = role === 'surface' && lightness < QUIET_SURFACE_LIGHTNESS_CEILING
    ? lightness + (QUIET_SURFACE_LIGHTNESS_CEILING - lightness) * 0.25
    : lightness
  return format(hue, nextSaturation, nextLightness)
}

/** Recolours a paint value, including colours nested in zoom interpolation expressions. */
function transformPaintValue(
  value: unknown,
  role: ColorRole,
  recolour: (color: string, role: ColorRole) => string,
): unknown {
  if (typeof value === 'string') return recolour(value, role)
  if (Array.isArray(value)) return value.map((entry) => transformPaintValue(entry, role, recolour))
  return value
}

type PaintPropertyName = Parameters<Map['setPaintProperty']>[1]
type PaintValue = Parameters<Map['setPaintProperty']>[2]

interface OriginalPaint {
  readonly layerId: string
  readonly property: PaintPropertyName
  readonly value: PaintValue
}

const originalPaintByMap = new WeakMap<Map, readonly OriginalPaint[]>()

function isBasemapLayer(map: Map, sourceId: string | undefined): boolean {
  if (sourceId === undefined) return true
  // Route, stop and label overlays use GeoJSON sources and keep their own colours.
  return map.getStyle().sources[sourceId]?.type !== 'geojson'
}

function captureOriginalPaint(map: Map): readonly OriginalPaint[] {
  const captured: OriginalPaint[] = []
  for (const layer of map.getStyle().layers) {
    if (!isBasemapLayer(map, 'source' in layer ? layer.source : undefined)) continue
    const properties = layer.type === 'raster'
      ? Object.keys(DARK_RASTER_PAINT)
      : Object.keys(COLOR_PROPERTY_ROLES)
    for (const property of properties) {
      const value = (layer.paint as Record<string, unknown> | undefined)?.[property]
      // Setting a property a layer type does not have throws, so only touch ones the style sets.
      // Raster brightness and saturation are valid on every raster layer, set or not.
      if (value === undefined && layer.type !== 'raster') continue
      captured.push({
        layerId: layer.id,
        property: property as PaintPropertyName,
        value: value as PaintValue,
      })
    }
  }
  return captured
}

/**
 * Recolours the basemap in place so the route, stop and label layers added on
 * top of it survive a theme change. Dark darkens it; every other theme gets the
 * quiet version of the style's own colours.
 */
export function applyBasemapTheme(map: Map, theme: BasemapTheme): void {
  let originals = originalPaintByMap.get(map)
  if (!originals) {
    originals = captureOriginalPaint(map)
    originalPaintByMap.set(map, originals)
  }

  const recolour = theme === 'dark' ? toDarkColor : toQuietColor
  for (const { layerId, property, value } of originals) {
    if (!map.getLayer(layerId)) continue
    if (property in DARK_RASTER_PAINT) {
      map.setPaintProperty(
        layerId,
        property,
        theme === 'dark'
          ? DARK_RASTER_PAINT[property as keyof typeof DARK_RASTER_PAINT]
          : value,
      )
    } else {
      map.setPaintProperty(
        layerId,
        property,
        transformPaintValue(value, COLOR_PROPERTY_ROLES[property], recolour) as PaintValue,
      )
    }
  }
}

/**
 * Keeps the basemap in step with the document's `data-theme`, applying the
 * current theme as soon as the style loads so dark mode never flashes light.
 */
export function watchBasemapTheme(map: Map, onThemeChange?: () => void): () => void {
  let styleLoaded = false
  const sync = (): void => {
    if (!styleLoaded) return
    applyBasemapTheme(map, getDocumentTheme())
    onThemeChange?.()
  }
  const handleStyleLoad = (): void => {
    styleLoaded = true
    sync()
  }
  const observer = new MutationObserver(sync)
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  })
  map.once('style.load', handleStyleLoad)

  return () => {
    observer.disconnect()
    map.off('style.load', handleStyleLoad)
  }
}
