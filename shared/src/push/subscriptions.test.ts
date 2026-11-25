import { describe, expect, it } from 'vitest'
import {
  normalizePushEndpoint,
  normalizePushRemovalEndpoint,
  parsePushSubscriptionRegistration,
} from './subscriptions.ts'

const keys = { p256dh: 'BCV2Y0YnotzQ', auth: 'k8Z0dP2vG2s' }

function register(endpoint: unknown) {
  return parsePushSubscriptionRegistration({ endpoint, keys, topic: 'service-updates' })
}

describe('push endpoint registration allowlist', () => {
  it.each([
    'https://fcm.googleapis.com/fcm/send/abc123:def-456',
    'https://updates.push.services.mozilla.com/wpush/v2/abc',
    'https://web.push.apple.com/QG1234',
  ])('accepts a supported push service host: %s', (endpoint) => {
    expect(normalizePushEndpoint(endpoint)).toBe(endpoint)
  })

  it('rejects a lookalike host that merely contains a supported name', () => {
    for (const endpoint of [
      'https://fcm.googleapis.com.attacker.test/fcm/send/abc',
      'https://evil-fcm.googleapis.com/fcm/send/abc',
      'https://fcm.googleapis.com.evil.test/fcm/send/abc',
      'https://push.example.com/send/abc',
      'https://notifications.mozilla.org/wpush/abc',
    ]) {
      expect(normalizePushEndpoint(endpoint)).toBeNull()
    }
  })

  it('rejects a custom port even on a supported host', () => {
    for (const endpoint of [
      'https://fcm.googleapis.com:8443/fcm/send/abc',
      'https://updates.push.services.mozilla.com:4430/wpush/abc',
    ]) {
      expect(normalizePushEndpoint(endpoint)).toBeNull()
    }
  })

  it('rejects local, loopback and private-network endpoints', () => {
    for (const endpoint of [
      'https://localhost/fcm/send/abc',
      'https://localhost:8443/fcm/send/abc',
      'https://127.0.0.1/fcm/send/abc',
      'https://127.0.0.1:8002/x',
      'https://[::1]/fcm/send/abc',
      'https://10.0.0.5/fcm/send/abc',
      'https://192.168.1.10/fcm/send/abc',
      'https://push.internal/fcm/send/abc',
      'https://metadata.google.internal/computeMetadata/v1/x',
    ]) {
      expect(normalizePushEndpoint(endpoint)).toBeNull()
    }
  })

  it('rejects credentials, plain HTTP and non-URL input', () => {
    for (const endpoint of [
      'http://fcm.googleapis.com/fcm/send/abc',
      'https://user:pass@fcm.googleapis.com/fcm/send/abc',
      'https://user@fcm.googleapis.com/fcm/send/abc',
      'javascript:alert(1)',
      '//fcm.googleapis.com/fcm/send/abc',
      '',
      '   ',
      null,
      42,
    ]) {
      expect(register(endpoint)).toBeNull()
    }
  })

  it('keeps the parsed registration for a supported host', () => {
    expect(register('https://fcm.googleapis.com/fcm/send/abc')).toEqual({
      endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
      keys,
      topic: 'service-updates',
    })
  })
})

describe('push endpoint removal', () => {
  it('allows removing a previously accepted public HTTPS endpoint', () => {
    expect(normalizePushRemovalEndpoint('https://push.example.com/send/legacy')).toBe(
      'https://push.example.com/send/legacy',
    )
  })

  it('still rejects local, credential-bearing and non-HTTPS removal endpoints', () => {
    for (const endpoint of [
      'http://push.example.com/send/abc',
      'https://user:pass@push.example.com/send/abc',
      'https://localhost/send/abc',
      'https://127.0.0.1:8002/x',
      'javascript:alert(1)',
    ]) {
      expect(normalizePushRemovalEndpoint(endpoint)).toBeNull()
    }
  })
})
