import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseApiOrigin } from '@navus/shared'
import { loadBackendConfig } from './config.ts'

const commit = 'a'.repeat(40)

describe('parseApiOrigin', () => {
  it('allows HTTP for local development and requires HTTPS for production', () => {
    assert.equal(parseApiOrigin('http://localhost:3001'), 'http://localhost:3001')
    assert.equal(parseApiOrigin('https://api.example.edu.sg', 'VITE_API_ORIGIN', {
      requireHttps: true,
    }), 'https://api.example.edu.sg')
    assert.throws(() => parseApiOrigin('http://api.example.edu.sg', 'VITE_API_ORIGIN', {
      requireHttps: true,
    }), /must use HTTPS in production/)
  })
})

describe('loadBackendConfig', () => {
  it('uses loopback and exact local origins by default', () => {
    const config = loadBackendConfig({}, 'C:/navus/backend')

    assert.equal(config.host, '127.0.0.1')
    assert.equal(config.port, 3001)
    assert.equal(config.dataVersion, 'development')
    assert.deepEqual(config.corsOrigins, [
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      'https://limzijing.github.io',
    ])
  })

  it('accepts production settings with a commit and HTTPS allowlist', () => {
    const config = loadBackendConfig({
      NODE_ENV: 'production',
      HOST: '127.0.0.1',
      PORT: '3001',
      API_CORS_ORIGINS: 'https://limzijing.github.io,https://navus.example.edu.sg',
      NAVUS_DATA_VERSION: commit,
    })

    assert.equal(config.environment, 'production')
    assert.equal(config.dataVersion, commit)
    assert.deepEqual(config.corsOrigins, [
      'https://limzijing.github.io',
      'https://navus.example.edu.sg',
    ])
  })

  it('rejects invalid ports, origins, exposed production hosts, and missing revisions', () => {
    assert.throws(() => loadBackendConfig({ PORT: '70000' }), /PORT/)
    assert.throws(() => loadBackendConfig({ API_CORS_ORIGINS: 'https://example.com/path' }), /origin/)
    assert.throws(() => loadBackendConfig({
      NODE_ENV: 'production',
      HOST: '0.0.0.0',
      API_CORS_ORIGINS: 'https://limzijing.github.io',
      NAVUS_DATA_VERSION: commit,
    }), /loopback/)
    assert.throws(() => loadBackendConfig({
      NODE_ENV: 'production',
      API_CORS_ORIGINS: 'https://limzijing.github.io',
      NAVUS_DATA_VERSION: 'development',
    }), /source commit/)
    assert.throws(() => loadBackendConfig({
      NODE_ENV: 'production',
      API_CORS_ORIGINS: 'http://localhost:5173,https://limzijing.github.io',
      NAVUS_DATA_VERSION: commit,
    }), /HTTPS/)
  })
})
