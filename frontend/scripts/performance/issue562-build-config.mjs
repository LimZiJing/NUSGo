import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { mergeConfig } from 'vite'
import baseConfig from '../../vite.config.ts'

const baseRevision = process.env.PERF_BASE_REV ?? 'f21964595968dde261973f7e2cb965ce0ba600b7'
const frontendRoot = resolve(process.cwd().endsWith('/frontend') || process.cwd().endsWith('\\frontend')
  ? process.cwd()
  : resolve(process.cwd(), 'frontend'))
const repoRoot = resolve(frontendRoot, '..')
const baseFiles = new Map([
  ['src/app/app.tsx', 'frontend/src/app/app.tsx'],
  ['src/app/composition/app-views.tsx', 'frontend/src/app/composition/app-views.tsx'],
  ['src/app/composition/mobile-sheet-summary.ts', 'frontend/src/app/composition/mobile-sheet-summary.ts'],
])
const profiling = process.env.PERF_REACT_PROFILE === '1'
const baselinePlugin = {
  name: 'performance-562-base-views',
  enforce: 'pre',
  load(id) {
    if (process.env.PERF_VARIANT !== 'base') return null
    const normalizedId = resolve(id.split('?')[0])
    for (const [localPath, gitPath] of baseFiles) {
      if (normalizedId === resolve(frontendRoot, localPath)) {
        return execFileSync('git', ['-C', repoRoot, 'show', baseRevision + ':' + gitPath], { encoding: 'utf8' })
      }
    }
    return null
  },
}
const profilerPlugin = {
  name: 'performance-562-root-profiler',
  enforce: 'pre',
  transform(code, id) {
    if (!id.replaceAll('\\', '/').endsWith('/src/main.tsx')) return null
    if (!code.includes('<App />') || !code.includes('lazy, StrictMode, Suspense')) {
      throw new Error('Update the diagnostic Profiler transform for the current application entry')
    }
    return code
      .replace('lazy, StrictMode, Suspense', 'lazy, StrictMode, Suspense, Profiler')
      .replace('<App />', '<Profiler id="App" onRender={(id, phase, actualDuration, baseDuration, startTime, commitTime) => { (window.__nusgoReactCommits ??= []).push({ id, phase, actualDuration, baseDuration, startTime, commitTime }) }}><App /></Profiler>')
  },
}

export default (environment) => mergeConfig(baseConfig(environment), {
  build: profiling
    ? { outDir: resolve(frontendRoot, '../.cache/performance-profile-562') }
    : {},
  resolve: profiling
    ? { alias: [{ find: 'react-dom/client', replacement: 'react-dom/profiling' }] }
    : {},
  plugins: [baselinePlugin, ...(profiling ? [profilerPlugin] : [])],
})
