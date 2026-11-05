import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { mergeConfig } from 'vite'
import baseConfig from '../../vite.config.ts'

const baseRevision = process.env.PERF_BASE_REV ?? 'f21964595968dde261973f7e2cb965ce0ba600b7'
const frontendRoot = resolve(process.cwd().endsWith('/frontend') || process.cwd().endsWith('\\frontend')
  ? process.cwd()
  : resolve(process.cwd(), 'frontend'))
const repoRoot = resolve(frontendRoot, '..')
const snapshotModule = resolve(frontendRoot, 'src/app/navigation-session-snapshot.ts')
const perfVariant = process.env.PERF_VARIANT
if (perfVariant !== 'base' && perfVariant !== 'head') {
  throw new Error(`PERF_VARIANT must be "base" or "head", got ${perfVariant ?? '<unset>'}`)
}
let baseSnapshotLoaded = false

export default (environment) => mergeConfig(baseConfig(environment), {
  plugins: [{
    name: 'performance-559-base-snapshot',
    enforce: 'pre',
    load(id) {
      if (perfVariant !== 'base' || resolve(id.split('?')[0]) !== snapshotModule) return null
      baseSnapshotLoaded = true
      return execFileSync('git', ['-C', repoRoot, 'show', baseRevision + ':frontend/src/app/navigation-session-snapshot.ts'], { encoding: 'utf8' })
    },
    buildEnd() {
      if (perfVariant === 'base' && !baseSnapshotLoaded) {
        throw new Error(`Base snapshot module was not loaded: ${snapshotModule}`)
      }
    },
  }],
})
