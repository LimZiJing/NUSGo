import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const sharedDir = dirname(fileURLToPath(import.meta.url))
const srcDir = resolve(sharedDir, '../../..')
const tokens = readFileSync(join(sharedDir, 'tokens.css'), 'utf8')

function cssFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return cssFiles(path)
    return name.endsWith('.css') ? [path] : []
  })
}

describe('type scale', () => {
  it('defines the font-size steps with 12px as the smallest', () => {
    const steps = Object.fromEntries(
      [...tokens.matchAll(/--font-size-(xs|sm|md|lg|xl|2xl|3xl):\s*(\d+)px;/g)].map((match) => [match[1], Number(match[2])]),
    )

    expect(steps).toEqual({ xs: 12, sm: 13, md: 14, lg: 16, xl: 18, '2xl': 20, '3xl': 24 })
  })

  it('keeps the font family in one token instead of per-rule stacks', () => {
    const offenders = cssFiles(srcDir)
      .filter((path) => !path.endsWith('tokens.css') && readFileSync(path, 'utf8').includes('system-ui'))
      .map((path) => path.slice(srcDir.length + 1))

    expect(offenders).toEqual([])
  })
})
