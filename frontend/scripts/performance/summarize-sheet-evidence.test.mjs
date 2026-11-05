import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'

const repoRoot = resolve(import.meta.dirname, '../../..')
const script = resolve(repoRoot, 'frontend/scripts/performance/summarize-sheet-evidence.mjs')

it.each([
  ['same-report.json', 'same-report.json'],
  ['report.json', './report.json'],
])('rejects duplicate input report paths %s and %s before reading reports', (first, second) => {
  const result = spawnSync(process.execPath, [script, first, second], {
    cwd: repoRoot,
    encoding: 'utf8',
  })

  expect(result.status).not.toBe(0)
  expect(result.stderr).toContain('Input report paths must be unique')
})
