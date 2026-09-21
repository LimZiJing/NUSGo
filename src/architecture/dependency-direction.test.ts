import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const sourceRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const sourceFilePattern = /\.(?:ts|tsx)$/
const importPattern = /\b(?:import|export)\s+(type\s+)?(?:[\s\S]*?\sfrom\s*)?['"]([^'"]+)['"]/g
const dynamicImportPattern = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g
const browserGlobalPattern = /\b(?:window|document|navigator|localStorage|sessionStorage|HTMLElement|Element|ResizeObserver|MutationObserver|fetch|URL|Blob|WebSocket|FormData|XMLHttpRequest|File|FileReader|Event|EventTarget)\b/g

type SourceFile = {
  path: string
  source: string
}

type SourceImport = {
  specifier: string
  typeOnly: boolean
}

function sourceFiles(relativeDirectory: string): SourceFile[] {
  const directory = join(sourceRoot, relativeDirectory)
  const entries = readdirSync(directory, { withFileTypes: true })

  return entries.flatMap((entry) => {
    const relativePath = join(relativeDirectory, entry.name)
    if (entry.isDirectory()) return sourceFiles(relativePath)
    if (!sourceFilePattern.test(entry.name)) return []

    return [{
      path: normalizePath(relativePath),
      source: readFileSync(join(sourceRoot, relativePath), 'utf8'),
    }]
  })
}

function normalizePath(path: string): string {
  return path.replaceAll('\\', '/')
}

function removeCommentsAndStrings(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
    .replace(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`/g, '')
}

function importsFor(source: string): SourceImport[] {
  const imports = [...source.matchAll(importPattern)].map((match) => ({
    specifier: match[2],
    typeOnly: Boolean(match[1]),
  }))
  const dynamicImports = [...source.matchAll(dynamicImportPattern)].map((match) => ({
    specifier: match[1],
    typeOnly: false,
  }))

  return [...imports, ...dynamicImports]
}

function resolveSourceImport(importerPath: string, specifier: string): string | null {
  if (!specifier.startsWith('.')) return null

  const unresolvedPath = join(sourceRoot, dirname(importerPath), specifier)
  const candidates = [
    unresolvedPath,
    `${unresolvedPath}.ts`,
    `${unresolvedPath}.tsx`,
    join(unresolvedPath, 'index.ts'),
    join(unresolvedPath, 'index.tsx'),
  ]
  const resolvedPath = candidates.find((candidate) => existsSync(candidate) && statSync(candidate).isFile())

  return resolvedPath ? normalizePath(relative(sourceRoot, resolvedPath)) : null
}

function sourceLayer(relativePath: string): string | null {
  return relativePath.split('/')[0] ?? null
}

function featureName(relativePath: string): string | null {
  return relativePath.startsWith('features/') ? relativePath.split('/')[1] ?? null : null
}

function isReactImport(specifier: string): boolean {
  return specifier === 'react' || specifier.startsWith('react/') ||
    specifier === 'react-dom' || specifier.startsWith('react-dom/')
}

function isMapLibreImport(specifier: string): boolean {
  return specifier === 'maplibre-gl' || specifier.startsWith('maplibre-gl/')
}

function violationsFor(
  files: SourceFile[],
  predicate: (file: SourceFile, sourceImport: SourceImport, resolvedPath: string | null) => boolean,
): string[] {
  return files.flatMap((file) => importsFor(file.source)
    .map((sourceImport) => ({
      sourceImport,
      resolvedPath: resolveSourceImport(file.path, sourceImport.specifier),
    }))
    .filter(({ sourceImport, resolvedPath }) => predicate(file, sourceImport, resolvedPath))
    .map(({ sourceImport }) => `${file.path} -> ${sourceImport.specifier}`))
}

describe('application dependency direction', () => {
  it('keeps domain modules free from framework, browser, and higher-layer dependencies', () => {
    const domainFiles = sourceFiles('domain')
    const forbiddenImports = violationsFor(domainFiles, (_file, sourceImport, resolvedPath) => (
      isReactImport(sourceImport.specifier) ||
      isMapLibreImport(sourceImport.specifier) ||
      sourceLayer(resolvedPath ?? '') === 'app' ||
      sourceLayer(resolvedPath ?? '') === 'features' ||
      sourceLayer(resolvedPath ?? '') === 'infrastructure' ||
      sourceLayer(resolvedPath ?? '') === 'ui'
    ))
    const browserReferences = domainFiles
      .filter((file) => !/\.test\.(?:ts|tsx)$/.test(file.path))
      .flatMap((file) => (
        [...removeCommentsAndStrings(file.source).matchAll(browserGlobalPattern)]
          .map((match) => `${file.path} -> ${match[0]}`)
      ))

    expect([...forbiddenImports, ...browserReferences]).toEqual([])
  })

  it('keeps feature modules independent from app contracts, infrastructure, and other feature internals', () => {
    const forbiddenImports = violationsFor(sourceFiles('features'), (file, sourceImport, resolvedPath) => {
      const importedLayer = sourceLayer(resolvedPath ?? '')
      return isMapLibreImport(sourceImport.specifier) ||
        importedLayer === 'app' ||
        importedLayer === 'infrastructure' ||
        (importedLayer === 'features' && featureName(file.path) !== featureName(resolvedPath ?? ''))
    })

    expect(forbiddenImports).toEqual([])
  })

  it('keeps infrastructure modules independent from feature implementations', () => {
    const forbiddenImports = violationsFor(sourceFiles('infrastructure'), (_file, sourceImport, resolvedPath) => {
      const importedLayer = sourceLayer(resolvedPath ?? '')
      if (importedLayer === 'features') return true
      if (importedLayer !== 'app') return false

      return !sourceImport.typeOnly || !resolvedPath?.startsWith('app/contracts/')
    })

    expect(forbiddenImports).toEqual([])
  })

  it('keeps UI modules independent from application and infrastructure implementations', () => {
    const forbiddenImports = violationsFor(sourceFiles('ui'), (_file, sourceImport, resolvedPath) => {
      const importedLayer = sourceLayer(resolvedPath ?? '')
      return isMapLibreImport(sourceImport.specifier) ||
        importedLayer === 'app' ||
        importedLayer === 'infrastructure'
    })

    expect(forbiddenImports).toEqual([])
  })
})
