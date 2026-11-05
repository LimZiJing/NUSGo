import { spawnSync } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { assertPageInputs, fingerprintPageInputs } from './page-inputs.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')

it('prepares fixtures from the selected measured build', async () => {
  const dist = await mkdtemp(join(tmpdir(), 'nusgo-performance-dist-'))
  try {
    await mkdir(join(dist, 'data'), { recursive: true })
    await writeFile(join(dist, 'index.html'), '<!doctype html><html><head></head><body></body></html>')
    await writeFile(join(dist, 'data/shuttle-network.json'), JSON.stringify({ stops: [{ id: 'MEASURED_BUILD_STOP' }] }))

    const result = spawnSync(process.execPath, [join(repoRoot, 'frontend/scripts/performance/prepare-page.mjs')], {
      cwd: repoRoot,
      env: { ...process.env, PERF_DIST: dist },
      encoding: 'utf8',
    })
    if (result.status !== 0) throw new Error(result.stderr || String(result.error))

    const page = await readFile(join(dist, 'performance.html'), 'utf8')
    expect(page).toContain('MEASURED_BUILD_STOP')
    const recordedInputs = JSON.parse(page.match(/window\.nusgoPerformanceInputs=(.*?);/)[1])
    expect(recordedInputs).toEqual(await fingerprintPageInputs())
    expect(() => assertPageInputs(recordedInputs, recordedInputs.sha256)).not.toThrow()
  } finally {
    await rm(dist, { recursive: true, force: true })
  }
})
