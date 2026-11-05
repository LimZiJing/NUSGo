import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'

const repoRoot = resolve(import.meta.dirname, '../../..')
const script = resolve(repoRoot, 'frontend/scripts/performance/summarize-sheet-evidence.mjs')

it('rejects duplicate input report paths before reading reports', () => {
  const result = spawnSync(process.execPath, [script, 'same-report.json', 'same-report.json'], {
    cwd: repoRoot,
    encoding: 'utf8',
  })

  expect(result.status).not.toBe(0)
  expect(result.stderr).toContain('Input report paths must be unique')
})
