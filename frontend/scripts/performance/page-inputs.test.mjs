import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { expect, it } from 'vitest'
import { assertPageInputs, fingerprintPageInputs } from './page-inputs.mjs'

const inputNames = ['browser-metrics.mjs', 'fixtures.mjs', 'page-inputs.mjs', 'prepare-page.mjs', 'scenarios.mjs']

it('matches the page-generation fingerprint pinned for guarded collection', async () => {
  const expected = JSON.parse(await readFile(new URL('./recorded-comparison.json', import.meta.url), 'utf8'))
  const actual = await fingerprintPageInputs()
  expect(() => assertPageInputs(actual, expected.pageGeneration)).not.toThrow()
})

it.each(inputNames)('rejects collection when %s differs from the recorded workload', async (name) => {
  const directory = await mkdtemp(join(tmpdir(), 'nusgo-page-inputs-'))
  try {
    const url = pathToFileURL(directory + '/')
    for (const input of inputNames) {
      await writeFile(join(directory, input), await readFile(new URL(input, import.meta.url)))
    }
    const recorded = await fingerprintPageInputs()
    expect(await fingerprintPageInputs(url)).toEqual(recorded)
    await writeFile(join(directory, name), '// different measurement workload\n')
    const changed = await fingerprintPageInputs(url)
    expect(() => assertPageInputs(changed, recorded.sha256)).toThrow('Page-generation fingerprint mismatch')
    expect(() => assertPageInputs(recorded, changed.sha256)).toThrow('Page-generation fingerprint mismatch')
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

it('rejects a prepared page or historical report without page-generation provenance', async () => {
  const recorded = await fingerprintPageInputs()
  expect(() => assertPageInputs(undefined, recorded.sha256)).toThrow('Page-generation fingerprint mismatch')
  expect(() => assertPageInputs(recorded, undefined)).toThrow('Page-generation fingerprint mismatch')
})
