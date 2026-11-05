import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { expect, it } from 'vitest'
import { assertPageInputs, fingerprintPageInputs } from './page-inputs.mjs'

const inputNames = ['frontend/index.html', 'browser-metrics.mjs', 'fixtures.mjs', 'page-inputs.mjs', 'prepare-page.mjs', 'scenarios.mjs']

it.runIf(process.env.NUSGO_GUARDED_PERFORMANCE_COLLECTION === '1')('matches the page-generation fingerprint pinned for guarded collection', async () => {
  const expected = JSON.parse(await readFile(new URL('./recorded-comparison.json', import.meta.url), 'utf8'))
  const actual = await fingerprintPageInputs()
  expect(() => assertPageInputs(actual, expected.pageGeneration)).not.toThrow()
})

it.each(inputNames)('rejects collection when %s differs from the recorded workload', async (name) => {
  const directory = await mkdtemp(join(tmpdir(), 'nusgo-page-inputs-'))
  try {
    const url = pathToFileURL(directory + '/')
    for (const input of inputNames) {
      const source = input === 'frontend/index.html' ? new URL('../../index.html', import.meta.url) : new URL(input, import.meta.url)
      const target = join(directory, input)
      await mkdir(dirname(target), { recursive: true })
      await writeFile(target, await readFile(source))
    }
    const recorded = await fingerprintPageInputs()
    const pageEntry = new URL('frontend/index.html', url)
    expect(await fingerprintPageInputs(url, pageEntry)).toEqual(recorded)
    const target = join(directory, name)
    await writeFile(target, '// different measurement workload\n')
    const changed = await fingerprintPageInputs(url, pageEntry)
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
