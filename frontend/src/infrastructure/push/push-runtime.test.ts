// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PushSubscriptionClient } from './push-subscription-client'
import {
  PUSH_SUBSCRIPTION_PREFERENCE_STORAGE_KEY,
  PushSubscriptionError,
  disablePush,
  enablePush,
  getPushEnvironment,
  readPushPreference,
  savePushPreference,
} from './push-runtime'

interface FakeSubscription {
  endpoint: string
  options: { applicationServerKey: ArrayBuffer | null }
  toJSON: () => { endpoint: string; keys: { p256dh: string; auth: string } }
  unsubscribe: () => Promise<boolean>
}

function fakeSubscription(
  endpoint = 'https://push.example.test/sub/1',
  publicKey: string | null = 'BPublicKey',
): FakeSubscription {
  return {
    endpoint,
    options: { applicationServerKey: publicKey === null ? null : Uint8Array.from(window.atob(publicKey), (c) => c.charCodeAt(0)).buffer },
    toJSON: () => ({ endpoint, keys: { p256dh: 'p256dh-key', auth: 'auth-key' } }),
    unsubscribe: vi.fn(async () => true),
  }
}

function stubServiceWorker(subscription: FakeSubscription | null, subscribe = vi.fn()) {
  const registration = {
    pushManager: {
      getSubscription: vi.fn(async () => subscription),
      subscribe,
    },
  }
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { getRegistration: vi.fn(async () => registration) },
  })
  return registration
}

function stubPushApi(present: boolean): void {
  if (present) Object.defineProperty(window, 'PushManager', { configurable: true, value: function PushManager() {} })
  else Reflect.deleteProperty(window as unknown as Record<string, unknown>, 'PushManager')
}

function stubNotification(permission: NotificationPermission, request = vi.fn()) {
  Object.defineProperty(window, 'Notification', {
    configurable: true,
    value: Object.assign(function Notification() {}, {
      permission,
      requestPermission: request,
    }),
  })
}

function client(overrides: Partial<PushSubscriptionClient> = {}): PushSubscriptionClient {
  return {
    getPublicKey: vi.fn(async () => 'BPublicKey'),
    register: vi.fn(async () => undefined),
    unregister: vi.fn(async () => undefined),
    ...overrides,
  }
}

beforeEach(() => {
  window.localStorage.clear()
  stubPushApi(true)
  stubNotification('default')
})

afterEach(() => {
  vi.restoreAllMocks()
  Reflect.deleteProperty(navigator as unknown as Record<string, unknown>, 'serviceWorker')
  Reflect.deleteProperty(window as unknown as Record<string, unknown>, 'Notification')
})

describe('getPushEnvironment', () => {
  it('reports an available browser with its current permission', () => {
    stubServiceWorker(null)
    stubNotification('granted')
    expect(getPushEnvironment()).toEqual({ availability: 'available', permission: 'granted' })
  })

  it('asks iOS browser tabs to add the app to the Home Screen first', () => {
    stubPushApi(false)
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
    )

    expect(getPushEnvironment().availability).toBe('needs-home-screen')
  })

  it('reports an unsupported browser when no Push API exists off iOS', () => {
    stubPushApi(false)
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (X11; Linux x86_64) Firefox/128.0')

    expect(getPushEnvironment().availability).toBe('unsupported')
  })
})

describe('push preference storage', () => {
  it('survives a reload by reading the same endpoint and topic back', () => {
    savePushPreference({ topic: 'service-updates', endpoint: 'https://push.example.test/sub/1' })

    expect(readPushPreference()).toEqual({
      topic: 'service-updates',
      endpoint: 'https://push.example.test/sub/1',
    })
  })

  it('ignores unreadable and unexpected stored values', () => {
    window.localStorage.setItem(PUSH_SUBSCRIPTION_PREFERENCE_STORAGE_KEY, 'not json')
    expect(readPushPreference()).toBeNull()

    window.localStorage.setItem(PUSH_SUBSCRIPTION_PREFERENCE_STORAGE_KEY, JSON.stringify({ topic: 'other', endpoint: 'x' }))
    expect(readPushPreference()).toBeNull()
  })

  it('clears the stored preference when turned off', () => {
    savePushPreference({ topic: 'service-updates', endpoint: 'https://push.example.test/sub/1' })
    savePushPreference(null)

    expect(window.localStorage.getItem(PUSH_SUBSCRIPTION_PREFERENCE_STORAGE_KEY)).toBeNull()
  })
})

describe('enablePush', () => {
  it('requests permission only when called, then subscribes and registers', async () => {
    const request = vi.fn(async () => 'granted' as const)
    stubNotification('default', request)
    const subscription = fakeSubscription()
    stubServiceWorker(null, vi.fn(async () => subscription))
    const pushClient = client()

    const result = await enablePush(pushClient)

    expect(request).toHaveBeenCalledOnce()
    expect(pushClient.register).toHaveBeenCalledWith({
      endpoint: 'https://push.example.test/sub/1',
      keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
      topic: 'service-updates',
    })
    expect(result).toEqual({
      preference: { topic: 'service-updates', endpoint: 'https://push.example.test/sub/1' },
      permission: 'granted',
    })
    expect(readPushPreference()).toEqual(result.preference)
  })

  it('keeps the previous preference when permission is refused', async () => {
    stubNotification('default', vi.fn(async () => 'denied' as const))
    const previous = { topic: 'service-updates' as const, endpoint: 'https://push.example.test/old' }
    const pushClient = client()

    const result = await enablePush(pushClient, previous)

    expect(result).toEqual({ preference: previous, permission: 'denied' })
    expect(pushClient.register).not.toHaveBeenCalled()
  })

  it('fails clearly when the server has no VAPID key', async () => {
    stubNotification('default', vi.fn(async () => 'granted' as const))
    stubServiceWorker(fakeSubscription())

    await expect(enablePush(client({ getPublicKey: vi.fn(async () => null) })))
      .rejects.toThrow(PushSubscriptionError)
  })

  it('reuses the existing subscription instead of subscribing twice', async () => {
    stubNotification('default', vi.fn(async () => 'granted' as const))
    const subscribe = vi.fn()
    stubServiceWorker(fakeSubscription('https://push.example.test/existing'), subscribe)
    const pushClient = client()

    await enablePush(pushClient)

    expect(subscribe).not.toHaveBeenCalled()
    expect(pushClient.register).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: 'https://push.example.test/existing' }),
    )
  })
})

describe('subscription key rotation', () => {
  it('replaces an old-key subscription when registration is retried after key rotation', async () => {
    stubNotification('default', vi.fn(async () => 'granted' as const))
    const old = fakeSubscription('https://push.example.test/old')
    const replacement = fakeSubscription('https://push.example.test/new', 'QPublicKey')
    const order: string[] = []
    old.unsubscribe = vi.fn(async () => { order.push('unsubscribe'); return true })
    const subscribe = vi.fn<(options: PushSubscriptionOptionsInit) => Promise<FakeSubscription>>(
      async () => { order.push('subscribe'); return replacement },
    )
    stubServiceWorker(old, subscribe)
    const pushClient = client({
      getPublicKey: vi.fn().mockResolvedValueOnce('BPublicKey').mockResolvedValue('QPublicKey'),
      register: vi.fn().mockRejectedValueOnce(new Error('network')).mockImplementation(async () => { order.push('register') }),
      unregister: vi.fn(async () => { order.push('unregister') }),
    })

    await expect(enablePush(pushClient)).rejects.toThrow('network')
    expect(readPushPreference()).toBeNull()
    expect(old.unsubscribe).not.toHaveBeenCalled()
    await enablePush(pushClient)

    expect(pushClient.unregister).toHaveBeenCalledWith(old.endpoint)
    expect(order).toEqual(['unregister', 'unsubscribe', 'subscribe', 'register'])
    const requestedKey = subscribe.mock.calls[0][0].applicationServerKey as Uint8Array
    expect(Array.from(requestedKey))
      .toEqual(Array.from(window.atob('QPublicKey'), (c) => c.charCodeAt(0)))
    expect(readPushPreference()?.endpoint).toBe(replacement.endpoint)
  })

  it('replaces an existing subscription whose application server key is unavailable', async () => {
    stubNotification('default', vi.fn(async () => 'granted' as const))
    const old = fakeSubscription('https://push.example.test/old', null)
    const replacement = fakeSubscription()
    const subscribe = vi.fn(async () => replacement)
    stubServiceWorker(old, subscribe)

    await enablePush(client())

    expect(old.unsubscribe).toHaveBeenCalledOnce()
    expect(subscribe).toHaveBeenCalledOnce()
    expect(readPushPreference()?.endpoint).toBe(replacement.endpoint)
  })

  it('does not replace the browser subscription if removing the old registration fails', async () => {
    stubNotification('default', vi.fn(async () => 'granted' as const))
    const old = fakeSubscription('https://push.example.test/old', 'QPublicKey')
    const subscribe = vi.fn()
    stubServiceWorker(old, subscribe)
    savePushPreference({ topic: 'service-updates', endpoint: old.endpoint })

    await expect(enablePush(client({ unregister: vi.fn(async () => { throw new Error('network') }) })))
      .rejects.toThrow('network')

    expect(old.unsubscribe).not.toHaveBeenCalled()
    expect(subscribe).not.toHaveBeenCalled()
    expect(readPushPreference()?.endpoint).toBe(old.endpoint)
  })

  it('does not register an old-key subscription when browser cancellation fails', async () => {
    stubNotification('default', vi.fn(async () => 'granted' as const))
    const old = fakeSubscription('https://push.example.test/old', 'QPublicKey')
    old.unsubscribe = vi.fn(async () => false)
    const subscribe = vi.fn()
    stubServiceWorker(old, subscribe)
    const pushClient = client()

    await expect(enablePush(pushClient)).rejects.toThrow(PushSubscriptionError)

    expect(subscribe).not.toHaveBeenCalled()
    expect(pushClient.register).not.toHaveBeenCalled()
    expect(readPushPreference()).toBeNull()
  })
})

describe('disablePush', () => {
  it('removes the server registration before cancelling the browser subscription', async () => {
    const subscription = fakeSubscription()
    stubServiceWorker(subscription)
    savePushPreference({ topic: 'service-updates', endpoint: subscription.endpoint })
    const order: string[] = []
    const pushClient = client({
      unregister: vi.fn(async () => { order.push('server') }),
    })
    subscription.unsubscribe = vi.fn(async () => {
      order.push('browser')
      return true
    })

    await expect(disablePush(pushClient)).resolves.toBeNull()

    expect(pushClient.unregister).toHaveBeenCalledWith(subscription.endpoint)
    expect(order).toEqual(['server', 'browser'])
    expect(readPushPreference()).toBeNull()
  })

  it('removes both saved and current endpoints before clearing the preference', async () => {
    const subscription = fakeSubscription('https://push.example.test/new')
    stubServiceWorker(subscription)
    const saved = { topic: 'service-updates' as const, endpoint: 'https://push.example.test/old' }
    savePushPreference(saved)
    const order: string[] = []
    const pushClient = client({ unregister: vi.fn(async (endpoint) => {
      expect(readPushPreference()).toEqual(saved)
      order.push(endpoint)
    }) })
    subscription.unsubscribe = vi.fn(async () => { order.push('browser'); return true })

    await disablePush(pushClient)

    expect(order).toEqual([saved.endpoint, subscription.endpoint, 'browser'])
    expect(readPushPreference()).toBeNull()
  })

  it.each(['https://push.example.test/old', 'https://push.example.test/new'])(
    'retains saved state for retry when removal of %s fails', async (failedEndpoint) => {
      const subscription = fakeSubscription('https://push.example.test/new')
      stubServiceWorker(subscription)
      const saved = { topic: 'service-updates' as const, endpoint: 'https://push.example.test/old' }
      savePushPreference(saved)
      const pushClient = client({ unregister: vi.fn(async (endpoint) => {
        if (endpoint === failedEndpoint) throw new Error('network')
      }) })

      await expect(disablePush(pushClient)).rejects.toThrow('network')

      expect(readPushPreference()).toEqual(saved)
      expect(subscription.unsubscribe).not.toHaveBeenCalled()
    },
  )

  it('keeps the preference when the server call fails so the toggle stays honest', async () => {
    const subscription = fakeSubscription()
    stubServiceWorker(subscription)
    savePushPreference({ topic: 'service-updates', endpoint: subscription.endpoint })
    const pushClient = client({ unregister: vi.fn(async () => { throw new Error('network') }) })

    await expect(disablePush(pushClient)).rejects.toThrow('network')
    expect(readPushPreference()).not.toBeNull()
    expect(subscription.unsubscribe).not.toHaveBeenCalled()
  })
})
