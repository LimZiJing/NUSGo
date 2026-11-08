import { readdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const stylesDirectory = dirname(fileURLToPath(import.meta.url))
const themeFileNames = readdirSync(resolve(stylesDirectory, 'themes'), { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith('.css'))
  .map((entry) => entry.name)
  .sort()
const themeNames = themeFileNames.map((fileName) => fileName.replace(/\.css$/, ''))

function readStyleFile(name: string): string {
  return readFileSync(resolve(stylesDirectory, name), 'utf8')
}

function readCustomPropertyNames(styles: string): string[] {
  return [...styles.matchAll(/^\s*(--[\w-]+)\s*:/gm)]
    .map(([, name]) => name)
    .sort()
}

function readCustomPropertyValue(styles: string, name: string): string {
  const match = styles.match(new RegExp(`^\\s*${name}\\s*:\\s*([^;]+);`, 'm'))

  if (!match) {
    throw new Error(`Missing theme token: ${name}`)
  }

  return match[1].trim()
}

function parseHexColor(value: string): [number, number, number] {
  const match = value.match(/^#([\da-f]{3}|[\da-f]{6})$/i)

  if (!match) {
    throw new Error(`Expected a hex color, received: ${value}`)
  }

  const hex = match[1].length === 3
    ? [...match[1]].map((part) => `${part}${part}`).join('')
    : match[1]

  return [0, 1, 2].map((index) => Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16) / 255) as [number, number, number]
}

function toHexColor(channels: readonly number[]): string {
  return `#${channels.map((channel) => Math.round(channel * 255).toString(16).padStart(2, '0')).join('')}`
}

/* Resolves simple token references and `color-mix(in srgb, var(--a) N%, var(--b))` values used
   by the themes. Mixing happens in sRGB, matching the CSS the browser evaluates. */
function resolveColour(styles: string, token: string): string {
  const value = readCustomPropertyValue(styles, token)
  const reference = value.match(/^var\((--[\w-]+)\)$/)

  if (reference) {
    return resolveColour(styles, reference[1])
  }

  const mix = value.match(/^color-mix\(in srgb,\s*var\((--[\w-]+)\)\s+([\d.]+)%,\s*var\((--[\w-]+)\)\)$/)

  if (!mix) {
    return value
  }

  const [, foregroundToken, percentage, backgroundToken] = mix
  const weight = Number(percentage) / 100
  const foreground = parseHexColor(resolveColour(styles, foregroundToken))
  const background = parseHexColor(resolveColour(styles, backgroundToken))

  return toHexColor(foreground.map((channel, index) => channel * weight + background[index] * (1 - weight)))
}

function relativeLuminance(value: string): number {
  return parseHexColor(value)
    .map((channel) => channel <= 0.03928
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4)
    .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0)
}

function contrastRatio(foreground: string, background: string): number {
  const foregroundLuminance = relativeLuminance(foreground)
  const backgroundLuminance = relativeLuminance(background)
  const lighter = Math.max(foregroundLuminance, backgroundLuminance)
  const darker = Math.min(foregroundLuminance, backgroundLuminance)

  return (lighter + 0.05) / (darker + 0.05)
}

describe('semantic theme tokens', () => {
  it.each(themeFileNames)('includes the shared surface tokens needed by sheets in %s', (fileName) => {
    const tokens = readCustomPropertyNames(readStyleFile(`themes/${fileName}`))

    expect(tokens).toEqual(expect.arrayContaining([
      '--surface',
      '--surface-raised',
      '--surface-card',
      '--text-primary',
      '--border-default',
      '--accent',
      '--status-success',
      '--status-warning',
      '--status-error',
      '--load-level-low',
      '--load-level-medium',
      '--load-level-high',
      '--load-level-unknown',
      '--focus-ring',
      '--shadow-sm',
    ]))
  })

  it.each(themeNames)('inherits the theme surface on mobile panels in the %s theme', (themeName) => {
    const styles = readStyleFile(`themes/${themeName}.css`)
    const mobileSurfaceOverride = styles.match(new RegExp(
      `:root\\[data-theme=['"]${themeName}['"]\\]\\s+\\.navigation-panel\\s*\\{[^}]*--surface\\s*:`,
    ))

    expect(mobileSurfaceOverride).toBeNull()
  })

  it('loads every theme from the shared style entrypoint', () => {
    const indexStyles = readStyleFile('index.css')
    const importedThemeFiles = [...indexStyles.matchAll(/@import ['"]\.\/themes\/([^'"]+\.css)['"];?/g)]
      .map(([, fileName]) => fileName)
      .sort()

    expect(importedThemeFiles).toEqual(themeFileNames)

    for (const themeName of themeNames) {
      const themeStyles = readStyleFile(`themes/${themeName}.css`)

      expect(themeStyles).toMatch(new RegExp(`:root\\[data-theme=['"]${themeName}['"]\\]`))
    }
  })

  it.each(themeFileNames.map((fileName) => [fileName.replace(/\.css$/, ''), `themes/${fileName}`] as const))(
    'keeps key theme text pairs readable in the %s theme', (_themeName, fileName) => {
    const styles = readStyleFile(fileName)
    const pairs = [
      ['--text-primary', '--surface'],
      ['--text-secondary', '--surface'],
      ['--text-muted', '--surface'],
      ['--accent-contrast', '--accent'],
      ['--text-inverse', '--status-error-strong'],
      ['--status-success', '--status-success-surface'],
      ['--status-warning', '--status-warning-surface'],
      ['--status-error', '--status-error-surface'],
      ['--status-info', '--status-info-surface'],
    ] as const

    for (const [foregroundToken, backgroundToken] of pairs) {
      const ratio = contrastRatio(resolveColour(styles, foregroundToken), resolveColour(styles, backgroundToken))

      expect(ratio, `${foregroundToken} on ${backgroundToken}`).toBeGreaterThanOrEqual(4.5)
    }
    },
  )
})

describe('control token contrast', () => {
  it.each(themeNames)('keeps the soft tonal control colours accessible in the %s theme', (themeName) => {
    const styles = readStyleFile(`themes/${themeName}.css`)
    const ratioOf = (foreground: string, background: string) => contrastRatio(
      resolveColour(styles, foreground),
      resolveColour(styles, background),
    )

    const checks = [
      // Non-text boundary of secondary controls and chips (WCAG 1.4.11).
      ['--control-border', '--surface', 3],
      // The same boundary where controls sit on a card rather than the page,
      // e.g. the theme select in Settings → Appearance.
      ['--control-border', '--surface-card', 3],
      // Secondary label and unselected chip label on the neutral control fill.
      ['--text-primary', '--surface-control', 4.5],
      // Primary button and selected chip label on the accent fill.
      ['--text-inverse', '--accent', 4.5],
      // Primary fill boundary against the page surface.
      ['--accent', '--surface', 3],
      // Ghost button label on the page surface.
      ['--accent', '--surface', 4.5],
    ] as const

    for (const [foreground, background, minimum] of checks) {
      expect(ratioOf(foreground, background), `${themeName}: ${foreground} on ${background}`)
        .toBeGreaterThanOrEqual(minimum)
    }
  })

  it.each(themeNames)('defines --control-border in the %s theme', (themeName) => {
    expect(readCustomPropertyNames(readStyleFile(`themes/${themeName}.css`))).toContain('--control-border')
  })

  it.each(themeNames)('keeps load-level colours readable on arrival surfaces in the %s theme', (themeName) => {
    const styles = readStyleFile(`themes/${themeName}.css`)
    const loadLevelTokens = [
      '--load-level-low',
      '--load-level-medium',
      '--load-level-high',
      '--load-level-unknown',
    ] as const
    const arrivalSurfaces = ['--surface', '--surface-raised', '--surface-card'] as const

    for (const foreground of loadLevelTokens) {
      for (const background of arrivalSurfaces) {
        const ratio = contrastRatio(resolveColour(styles, foreground), resolveColour(styles, background))

        expect(ratio, `${themeName}: ${foreground} on ${background}`).toBeGreaterThanOrEqual(4.5)
      }
    }
  })

  it.each(themeNames)('keeps favourite icons visible on every surface in the %s theme', (themeName) => {
    const styles = readStyleFile(`themes/${themeName}.css`)
    // --text-favorite paints star icons only, so WCAG 1.4.11's 3:1 for non-text graphics
    // applies. --surface-card is the stops list card and --accent-soft the settings tile.
    const favouriteSurfaces = ['--surface', '--surface-raised', '--surface-card', '--accent-soft'] as const

    for (const background of favouriteSurfaces) {
      const ratio = contrastRatio(resolveColour(styles, '--text-favorite'), resolveColour(styles, background))

      expect(ratio, `${themeName}: --text-favorite on ${background}`).toBeGreaterThanOrEqual(3)
    }
  })

  it.each(themeNames)('keeps success-strong text readable on card surfaces in the %s theme', (themeName) => {
    const styles = readStyleFile(`themes/${themeName}.css`)
    // --status-success-strong paints the recommended journey heading on a card;
    // --text-success-strong is its text-named twin.
    const successTokens = ['--text-success-strong', '--status-success-strong'] as const
    const successSurfaces = ['--surface', '--surface-raised', '--surface-card'] as const

    for (const foreground of successTokens) {
      for (const background of successSurfaces) {
        const ratio = contrastRatio(resolveColour(styles, foreground), resolveColour(styles, background))

        expect(ratio, `${themeName}: ${foreground} on ${background}`).toBeGreaterThanOrEqual(4.5)
      }
    }
  })

  describe('departure row divider', () => {
    const dividerOnCard = (themeName: string) => {
      const styles = readStyleFile(`themes/${themeName}.css`)

      return contrastRatio(resolveColour(styles, '--border-divider'), resolveColour(styles, '--surface-card'))
    }

    it.each(themeNames)('never weakens the divider against --border-subtle in the %s theme', (themeName) => {
      const styles = readStyleFile(`themes/${themeName}.css`)
      const previous = contrastRatio(resolveColour(styles, '--border-subtle'), resolveColour(styles, '--surface-card'))

      // The divider may only ever be as visible as, or more visible than, the token it replaced.
      expect(dividerOnCard(themeName), `${themeName}: --border-divider on --surface-card`)
        .toBeGreaterThanOrEqual(previous)
    })

    it.each(['light', 'nus', 'matcha', 'sakura'] as const)(
      'keeps the %s theme divider on its palette --border-default step',
      (themeName) => {
        const styles = readStyleFile(`themes/${themeName}.css`)

        // Only dark needs a heavier divider than the details panel already used.
        expect(resolveColour(styles, '--border-divider'), `${themeName}: --border-divider`)
          .toBe(resolveColour(styles, '--border-default'))
      },
    )

    it('uses the --border-subtle step in dark mode', () => {
      const styles = readStyleFile('themes/dark.css')

      expect(resolveColour(styles, '--border-divider'))
        .toBe(resolveColour(styles, '--border-subtle'))
    })

    it('keeps the dark divider quieter than the row text it separates', () => {
      const styles = readStyleFile('themes/dark.css')
      const card = resolveColour(styles, '--surface-card')
      const divider = contrastRatio(resolveColour(styles, '--border-divider'), card)
      const rowText = contrastRatio(resolveColour(styles, '--text-strong'), card)

      // A separator must not compete with the departure times it sits between.
      expect(divider, 'dark: divider vs --text-strong').toBeLessThan(rowText)
    })
  })


  it.each(themes)('defines accessible hover and selected control colours in the %s theme', (themeName) => {
    const styles = readStyleFile('themes/' + themeName + '.css')
    const tokens = readCustomPropertyNames(styles)

    expect(tokens).toEqual(expect.arrayContaining(['--accent-selected', '--surface-control-hover']))
    expect(readCustomPropertyValue(styles, '--accent-selected'))
      .toBe('color-mix(in srgb, var(--accent) 26%, var(--surface-control))')
    expect(readCustomPropertyValue(styles, '--surface-control-hover'))
      .toBe('color-mix(in srgb, var(--text-primary) 11%, var(--surface-control))')

    const ratioOf = (foreground: string, background: string) => contrastRatio(
      resolveColour(styles, foreground),
      resolveColour(styles, background),
    )

    expect(ratioOf('--text-primary', '--accent-selected')).toBeGreaterThanOrEqual(4.5)
    expect(ratioOf('--accent-hover', '--accent-selected')).toBeGreaterThanOrEqual(3)
    expect(ratioOf('--text-primary', '--surface-control-hover')).toBeGreaterThanOrEqual(4.5)
    expect(ratioOf('--accent-selected', '--surface-control')).toBeGreaterThanOrEqual(1.25)
    expect(ratioOf('--surface-control-hover', '--surface-control')).toBeGreaterThanOrEqual(1.1)
  })

  it('uses semantic control colors instead of brightness filters', () => {
    for (const file of ['base.css', 'controls/button.css', 'controls/chip.css', 'map.css']) {
      expect(readStyleFile(file), file).not.toMatch(/brightness\s*\(/)
    }
  })

  it('keeps selected map overlay controls above their base icon-button styles', () => {
    const styles = readStyleFile('map.css')

    expect(styles).toContain(".button.icon-button.map-overlay-button[aria-pressed='true']")
    expect(styles).toContain(".button.icon-button.map-overlay-button[aria-expanded='true']")
    expect(styles).toContain('background: var(--accent-selected)')
    expect(styles).not.toMatch(/\.button\.icon-button\.map-overlay-button:active:not\(:disabled\)\s*{[^}]*transform:\s*none;/s)
  })

  it('keeps plain and nested SVGs on their feature-owned colors', () => {
    const styles = readStyleFile('controls/button.css')

    expect(styles).toMatch(/\.button\[aria-pressed='true'\]:not\(\[data-variant='plain'\]\)\s+svg\s*{[^}]*color:\s*var\(--accent-hover\);/s)
    expect(styles).not.toContain(".button[aria-expanded='true'] {")
    expect(styles).not.toContain(".button[aria-expanded='true']:not([data-variant='plain']) svg {")
    expect(readStyleFile('../../../features/waypoints/personal/personal-waypoints.css'))
      .toMatch(/\.button\.personal-waypoint-appearance-trigger\[aria-expanded='true'\]\s+\.personal-waypoint-marker-preview-icon\s*{[^}]*color:\s*var\(--map-waypoint-marker-ink\);/s)
  })

  it('uses a named journey stop ring token with route color at the marker', () => {
    const styles = readStyleFile('../../../features/plan/styles/plan-content.css')
    const tokens = readStyleFile('tokens.css')

    expect(tokens).toMatch(/--ring-journey-stop:\s*0 0 0 1px currentColor;/)
    expect(styles).toMatch(/\.journey-stop-marker\s*{[^}]*color:\s*var\(--journey-route-color,\s*var\(--status-info\)\);[^}]*box-shadow:\s*var\(--ring-journey-stop\);/s)
  })
})
