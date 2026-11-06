export type OverlayTheme = 'light' | 'dark' | 'rainroom'

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

const RAINROOM_PALETTE: OverlayPalette = {
  routeBase: '#c0bfad',
  routeCasing: '#273431',
  stopText: '#f2efe5',
  stopTextMuted: '#c4c4b7',
  stopHalo: '#293431',
  stopHaloFaded: 'rgba(41, 52, 49, 0.3)',
}

/** Dark and Rainroom use the dark map treatment; other themes use the light map. */
export function getDocumentTheme(): OverlayTheme {
  // Node tests run without a DOM, or with a partial one.
  const theme = typeof document !== 'undefined' ? document.documentElement?.dataset.theme : undefined
  return theme === 'rainroom' ? 'rainroom' : theme === 'dark' ? 'dark' : 'light'
}

export function getOverlayPalette(theme: OverlayTheme = getDocumentTheme()): OverlayPalette {
  return theme === 'rainroom' ? RAINROOM_PALETTE : theme === 'dark' ? DARK_PALETTE : LIGHT_PALETTE
}
