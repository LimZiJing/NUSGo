import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const stylesDirectory = dirname(fileURLToPath(import.meta.url))

function readStyleFile(name: string): string {
  return readFileSync(resolve(stylesDirectory, name), 'utf8')
}

function readCustomPropertyNames(styles: string): string[] {
  return [...styles.matchAll(/^\s*(--[\w-]+)\s*:/gm)]
    .map(([, name]) => name)
    .sort()
}

describe('semantic theme tokens', () => {
  it('defines the same tokens for light and dark themes', () => {
    const lightTokens = readCustomPropertyNames(readStyleFile('themes/light.css'))
    const darkTokens = readCustomPropertyNames(readStyleFile('themes/dark.css'))

    expect(darkTokens).toEqual(lightTokens)
  })

  it('includes the shared token groups needed by UI components', () => {
    const lightTokens = readCustomPropertyNames(readStyleFile('themes/light.css'))

    expect(lightTokens).toEqual(expect.arrayContaining([
      '--surface',
      '--text-primary',
      '--border-default',
      '--accent',
      '--status-success',
      '--status-warning',
      '--status-error',
      '--focus-ring',
      '--shadow-sm',
    ]))
  })

  it('loads both themes from the shared style entrypoint', () => {
    const indexStyles = readStyleFile('index.css')

    expect(indexStyles).toContain('@import \'./themes/light.css\';')
    expect(indexStyles).toContain('@import \'./themes/dark.css\';')
  })
})
