import { resolve } from 'node:path'
import { mergeConfig } from 'vite'
import baseConfig from '../../vite.config.ts'

// Dedicated diagnostic build: profiling overhead must never be compared as production timing.
export default (environment) => mergeConfig(baseConfig(environment), {
  build: { outDir: resolve(process.cwd(), '../.cache/performance-profile') },
  resolve: { alias: [{ find: 'react-dom/client', replacement: 'react-dom/profiling' }] },
  plugins: [{
    name: 'nusgo-performance-profiler',
    enforce: 'pre',
    transform(code, id) {
      if (!id.replaceAll('\\', '/').endsWith('/src/main.tsx')) return
      if (!code.includes('<App />') || !code.includes('lazy, StrictMode, Suspense')) throw new Error('Update profiling entry transform for the current application entry')
      return code.replace('lazy, StrictMode, Suspense', 'lazy, StrictMode, Suspense, Profiler')
        .replace('<App />', `<Profiler id="App" onRender={(id, phase, actualDuration, baseDuration) => { (window.__nusgoReactCommits ??= []).push({ id, phase, actualDuration, baseDuration }) }}><App /></Profiler>`)
    },
  }],
})
