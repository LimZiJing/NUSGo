/// <reference types="vitest/config" />
import { resolve } from 'node:path'
import { LOCAL_DATA_VERSION, parseDataVersion } from '../shared/src/index.ts'
import { resolveViteBuildSettings } from './vite-build-settings.ts'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const envDir = resolve(process.cwd(), '..')
  const env = loadEnv(mode, envDir, ['VITE_', 'NAVUS_VITE_'])
  const allowedHost = env.NAVUS_VITE_ALLOWED_HOST?.trim()
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
      __NAVUS_API_ORIGIN__: JSON.stringify(buildSettings.apiOrigin),
      __NAVUS_DATA_VERSION__: JSON.stringify(dataVersion),
    },
    plugins: [react()],
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
