import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import {
  loadJourneyBenchmarkManifest,
  validateJourneyBenchmarkManifest,
} from './manifest'

async function readRawManifest(): Promise<unknown> {
  return JSON.parse(await readFile(new URL('./cases.json', import.meta.url), 'utf8')) as unknown
}

describe('Journey benchmark manifest', () => {
  it('loads 50 named cases across the approved groups and scenarios', async () => {
    const manifest = await loadJourneyBenchmarkManifest()
    const counts = (key: 'group' | 'scenario') => Object.groupBy(manifest.cases, (item) => item[key])

    expect(manifest.cases).toHaveLength(50)
    expect(Object.keys(counts('group'))).toEqual(expect.arrayContaining(['normal', 'fallback', 'timing']))
    expect(counts('group').normal).toHaveLength(40)
    expect(counts('group').fallback).toHaveLength(5)
    expect(counts('group').timing).toHaveLength(5)
    expect(counts('scenario')['route-pair']).toHaveLength(20)
    expect(counts('scenario')['one-shuttle']).toHaveLength(10)
    expect(counts('scenario')['selection-tie']).toHaveLength(10)
    expect(manifest.cases.every(({ id, label }) => id.trim() && label.trim())).toBe(true)
  })

  it('requires a unique, exact-size manifest', async () => {
    const input = await readRawManifest() as { cases: unknown[] }
    expect(() => validateJourneyBenchmarkManifest({ ...input, cases: input.cases.slice(1) }))
      .toThrow('exactly 50 cases')
  })

  it('rejects cases that reference an unknown timing profile', async () => {
    const input = await readRawManifest() as { cases: Array<Record<string, unknown>> }
    const cases = input.cases.map((benchmarkCase, index) => index === 0
      ? { ...benchmarkCase, timingProfile: 'missing-profile' }
      : benchmarkCase)

    expect(() => validateJourneyBenchmarkManifest({ ...input, cases }))
      .toThrow('references unknown timing profile')
  })

  it('allows exact route assertions only when the case declares shuttle modes', async () => {
    const input = await readRawManifest() as { cases: Array<Record<string, unknown>> }
    const cases = input.cases.map((benchmarkCase, index) => index === 0
      ? { ...benchmarkCase, expected: { outcome: 'journey', routeIds: ['A1'] } }
      : benchmarkCase)

    expect(() => validateJourneyBenchmarkManifest({ ...input, cases }))
      .toThrow('routeIds requires a shuttle mode expectation')
  })
})
