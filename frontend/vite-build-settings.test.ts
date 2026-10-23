import { describe, expect, it } from 'vitest'
import { resolveViteBuildSettings } from './vite-build-settings.ts'

describe('resolveViteBuildSettings', () => {
  it('requires a public HTTPS API origin for the hosted production build', () => {
    expect(() => resolveViteBuildSettings('production', '')).toThrow(/explicitly set/)
    expect(() => resolveViteBuildSettings('production', 'http://127.0.0.1:3001')).toThrow(/HTTPS/)
    expect(resolveViteBuildSettings('production', 'https://api.example.edu.sg')).toEqual({
      apiOrigin: 'https://api.example.edu.sg',
      base: '/NUSGo/',
      outDir: 'dist',
    })
    expect(resolveViteBuildSettings('production', 'https://api.example.edu.sg', '/renamed-repo/')).toEqual({
      apiOrigin: 'https://api.example.edu.sg',
      base: '/renamed-repo/',
      outDir: 'dist',
    })
    expect(resolveViteBuildSettings('production', 'https://api.example.edu.sg', '/')).toEqual({
      apiOrigin: 'https://api.example.edu.sg',
      base: '/',
      outDir: 'dist',
    })
    expect(() => resolveViteBuildSettings('production', 'https://api.example.edu.sg', '/invalid')).toThrow(
      /VITE_BASE_PATH/,
    )
  })

  it('keeps the local rehearsal on loopback and in its own output directory', () => {
    expect(() => resolveViteBuildSettings('local-rehearsal', '')).toThrow(/explicitly set/)
    expect(() => resolveViteBuildSettings('local-rehearsal', 'https://api.example.edu.sg')).toThrow(/loopback/)
    expect(resolveViteBuildSettings('local-rehearsal', 'http://127.0.0.1:3001')).toEqual({
      apiOrigin: 'http://127.0.0.1:3001',
      base: '/',
      outDir: 'dist-local-rehearsal',
    })
  })

  it('keeps the Vite development proxy as the empty-origin development fallback', () => {
    expect(resolveViteBuildSettings('development', '')).toEqual({
      apiOrigin: '',
      base: '/',
      outDir: 'dist',
    })
  })
})
