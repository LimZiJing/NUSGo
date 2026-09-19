import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const sourceRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

function sourceFiles(relativeDirectory: string): string[] {
  const directory = join(sourceRoot, relativeDirectory)
  const entries = readdirSync(directory, { withFileTypes: true })

  return entries.flatMap((entry) => {
    const relativePath = join(relativeDirectory, entry.name)
    if (entry.isDirectory()) return sourceFiles(relativePath)
    return entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')
      ? [relativePath]
      : []
  })
}

function importsFor(relativePath: string): string[] {
  const source = readFileSync(join(sourceRoot, relativePath), 'utf8')
  const imports: string[] = []
  const importPattern = /\b(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g

  for (const match of source.matchAll(importPattern)) {
    imports.push(match[1])
  }

  return imports
}

function isInfrastructureImport(specifier: string): boolean {
  return (
    specifier === 'maplibre-gl' ||
    specifier.startsWith('maplibre-gl/') ||
    specifier.includes('/infrastructure/') ||
    specifier.endsWith('/infrastructure')
  )
}

function isFeatureImport(specifier: string): boolean {
  return specifier.includes('/features/') || specifier.endsWith('/features')
}

describe('application dependency direction', () => {
  it('keeps domain modules free from React, MapLibre, and infrastructure imports', () => {
    const forbiddenImports = sourceFiles('domain').flatMap((file) =>
      importsFor(file)
        .filter((specifier) =>
          specifier === 'react' ||
          specifier.startsWith('react-') ||
          isInfrastructureImport(specifier),
        )
        .map((specifier) => file + ' -> ' + specifier),
    )

    expect(forbiddenImports).toEqual([])
  })

  it('keeps feature modules independent from concrete infrastructure adapters', () => {
    const forbiddenImports = sourceFiles('features').flatMap((file) =>
      importsFor(file)
        .filter(isInfrastructureImport)
        .map((specifier) => file + ' -> ' + specifier),
    )

    expect(forbiddenImports).toEqual([])
  })

  it('keeps infrastructure modules independent from feature implementations', () => {
    const forbiddenImports = sourceFiles('infrastructure').flatMap((file) =>
      importsFor(file)
        .filter(isFeatureImport)
        .map((specifier) => file + ' -> ' + specifier),
    )

    expect(forbiddenImports).toEqual([])
  })

  it('walks only source modules when checking ownership boundaries', () => {
    expect(sourceFiles('domain').every((file) => statSync(join(sourceRoot, file)).isFile())).toBe(true)
  })
})
