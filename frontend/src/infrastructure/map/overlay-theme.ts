export type OverlayTheme = 'light' | 'dark'

export interface OverlayPalette {
  /** Route lines when no route is focused. */
  readonly routeBase: string
  readonly routeCasing: string
  readonly stopText: string
  readonly stopTextMuted: string
  readonly stopHalo: string
  readonly stopHaloFaded: string
}

const LIGHT_PALETTE: OverlayPalette = {
  routeBase: '#64748b',
  routeCasing: '#ffffff',
  stopText: '#0f172a',
  stopTextMuted: '#64748b',
  stopHalo: '#ffffff',
  stopHaloFaded: 'rgba(255, 255, 255, 0.2)',
}

const DARK_PALETTE: OverlayPalette = {
  routeBase: '#a8a29e',
  routeCasing: '#0b1220',
  stopText: '#e2e8f0',
  stopTextMuted: '#94a3b8',
  stopHalo: '#0b1220',
  stopHaloFaded: 'rgba(11, 18, 32, 0.2)',
}

const MAP_PALETTE_PROPERTIES: Readonly<Record<keyof OverlayPalette, string>> = {
  routeBase: '--map-route-base',
  routeCasing: '--map-route-casing',
  stopText: '--map-stop-text',
  stopTextMuted: '--map-stop-text-muted',
  stopHalo: '--map-stop-halo',
  stopHaloFaded: '--map-stop-halo-faded',
}

function getDocumentStyles(): CSSStyleDeclaration | undefined {
  if (typeof document === 'undefined' || typeof window === 'undefined') return undefined
  return window.getComputedStyle(document.documentElement)
}

/** Theme styles select the basemap tone without making map code depend on theme names. */
export function getDocumentTheme(): OverlayTheme {
  const tone = getDocumentStyles()?.getPropertyValue('--map-basemap-tone').trim()
  if (tone === 'dark') return 'dark'
  if (tone === 'light') return 'light'

  // Retain the dark-mode fallback for tests or incomplete documents without theme styles.
  return typeof document !== 'undefined' && document.documentElement?.dataset.theme === 'dark'
    ? 'dark'
    : 'light'
}

export function getOverlayPalette(): OverlayPalette {
  const fallback = getDocumentTheme() === 'dark' ? DARK_PALETTE : LIGHT_PALETTE
  const styles = getDocumentStyles()

  if (!styles) return fallback

  const readColour = (property: keyof OverlayPalette): string =>
    styles.getPropertyValue(MAP_PALETTE_PROPERTIES[property]).trim() || fallback[property]

  return {
    routeBase: readColour('routeBase'),
    routeCasing: readColour('routeCasing'),
    stopText: readColour('stopText'),
    stopTextMuted: readColour('stopTextMuted'),
    stopHalo: readColour('stopHalo'),
    stopHaloFaded: readColour('stopHaloFaded'),
  }
}
