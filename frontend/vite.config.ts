/// <reference types="vitest/config" />
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { relative, resolve, sep } from 'node:path'
import { LOCAL_DATA_VERSION, parseDataVersion } from '../shared/src/index.ts'
import { resolveViteBuildSettings } from './vite-build-settings.ts'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'

// https://vite.dev/config/
function collectPublicFiles(root: string, directory = root): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name)
    return entry.isDirectory()
      ? collectPublicFiles(root, path)
      : [relative(root, path).split(sep).join('/')]
  })
}

function createPwaServiceWorkerPlugin(basePath: string, publicDirectory: string): Plugin {
  const serviceWorkerPath = resolve(process.cwd(), 'src/pwa/service-worker.js')

  return {
    name: 'nusgo-pwa-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const publicFiles = collectPublicFiles(publicDirectory).sort()
      const outputFiles = Object.keys(bundle)
        .filter((fileName) => fileName !== 'sw.js' && !fileName.endsWith('.map'))
        .sort()
      const template = readFileSync(serviceWorkerPath, 'utf8')
      const versionHash = createHash('sha256')
      versionHash.update(basePath).update('\0').update(template).update('\0')

      for (const fileName of outputFiles) {
        const output = bundle[fileName]
        versionHash.update(fileName).update('\0')
        versionHash.update(output.type === 'asset' ? output.source : output.code)
      }
      for (const fileName of publicFiles) {
        versionHash.update(fileName).update('\0')
        versionHash.update(readFileSync(resolve(publicDirectory, fileName)))
      }

      const cacheVersion = versionHash.digest('hex').slice(0, 16)
      const precacheUrls = [...new Set([
        basePath,
        ...outputFiles.map((fileName) => `${basePath}${fileName}`),
        ...publicFiles.map((fileName) => `${basePath}${fileName}`),
      ])]
      const source = template
        .replace('__NUSGO_PWA_CACHE_NAME__', JSON.stringify(`nusgo-pwa-${cacheVersion}`))
        .replace('__NUSGO_PWA_PRECACHE_URLS__', JSON.stringify(precacheUrls))

      this.emitFile({ type: 'asset', fileName: 'sw.js', source })
    },
  }
}

export default defineConfig(({ mode }) => {
  const envDir = resolve(process.cwd(), '..')
  const env = loadEnv(mode, envDir, ['VITE_', 'NUSGO_VITE_'])
  const allowedHost = env.NUSGO_VITE_ALLOWED_HOST?.trim()
  const buildSettings = resolveViteBuildSettings(mode, env.VITE_API_ORIGIN, env.VITE_BASE_PATH)
  const dataVersion = parseDataVersion(
    env.VITE_DATA_VERSION?.trim() || process.env.GITHUB_SHA || LOCAL_DATA_VERSION,
    'VITE_DATA_VERSION',
  )

  return {
    envDir,
    base: buildSettings.base,
    // Keep loopback rehearsal assets out of dist, which the Pages workflow publishes.
    build: {
      outDir: buildSettings.outDir,
    },
    define: {
      __NUSGO_API_ORIGIN__: JSON.stringify(buildSettings.apiOrigin),
      __NUSGO_DATA_VERSION__: JSON.stringify(dataVersion),
    },
    plugins: [
      react(),
      createPwaServiceWorkerPlugin(buildSettings.base, resolve(process.cwd(), 'public')),
    ],
    test: {
      // App integration tests render the full shell; the 5 s default is too tight
      // when several suites share the machine.
      testTimeout: 15_000,
    },
    server: {
      host: '0.0.0.0',
      ...(allowedHost ? { allowedHosts: [allowedHost] } : {}),
      // Development forwards API calls to Express; it does not implement API routes.
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:3001',
        },
      },
    },
  }
})
