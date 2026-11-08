// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PushSubscriptionClient } from './push-subscription-client'
import {
  ALIGHT_REMINDER_PREFERENCE_STORAGE_KEY,
  PUSH_SUBSCRIPTION_PREFERENCE_STORAGE_KEY,
  PushSubscriptionError,
  createPushNotificationService,
  disablePush,
  disableReminder,
  enablePush,
  enableReminder,
  getPushEnvironment,
  readPushPreference,
  readReminderPreference,
  savePushPreference,
  saveReminderPreference,
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
    registerReminder: vi.fn(async () => null),
    unregisterReminder: vi.fn(async () => undefined),
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

  it('leaves the shared browser subscription in place while a reminder still uses it', async () => {
    // Both topics share one endpoint, so turning service updates off must not cancel the
    // subscription an alight reminder was registered against.
    const subscription = fakeSubscription()
    stubServiceWorker(subscription)
    savePushPreference({ topic: 'service-updates', endpoint: subscription.endpoint })
    saveReminderPreference({
      stopId: 'COM3',
      routeId: 'D1',
      endpoint: subscription.endpoint,
      leadTimeSeconds: 120,
      expiresAt: '2026-11-06T12:00:00.000Z',
    })
    const pushClient = client()

    await expect(disablePush(pushClient)).resolves.toBeNull()

    expect(pushClient.unregister).toHaveBeenCalledWith(subscription.endpoint)
    expect(subscription.unsubscribe).not.toHaveBeenCalled()
    expect(readPushPreference()).toBeNull()
    // The reminder survives, so the rider keeps the watch they asked for.
    expect(readReminderPreference()).not.toBeNull()
  })
})

describe('alight reminder preference storage', () => {
  it('survives a reload by reading the same stop, route, lead time and expiry back', () => {
    saveReminderPreference({
      stopId: 'COM3',
      routeId: 'D1',
      endpoint: 'https://push.example.test/sub/1',
      leadTimeSeconds: 60,
      expiresAt: '2026-11-06T12:00:00.000Z',
    })

    expect(readReminderPreference()).toEqual({
      stopId: 'COM3',
      routeId: 'D1',
      endpoint: 'https://push.example.test/sub/1',
      leadTimeSeconds: 60,
      expiresAt: '2026-11-06T12:00:00.000Z',
    })
  })

  // A record saved before lead times existed must still restore, using the default lead time and
  // an honest unknown expiry, rather than pretending the rider has no reminder at all.
  it('restores a record saved without a lead time or expiry', () => {
    window.localStorage.setItem(ALIGHT_REMINDER_PREFERENCE_STORAGE_KEY, JSON.stringify({
      stopId: 'COM3',
      routeId: 'D1',
      endpoint: 'https://push.example.test/sub/1',
    }))

    expect(readReminderPreference()).toEqual({
      stopId: 'COM3',
      routeId: 'D1',
      endpoint: 'https://push.example.test/sub/1',
      leadTimeSeconds: 120,
      expiresAt: null,
    })
  })

  it('falls back to the default lead time when a stored value is not an offered choice', () => {
    window.localStorage.setItem(ALIGHT_REMINDER_PREFERENCE_STORAGE_KEY, JSON.stringify({
      stopId: 'COM3',
      routeId: 'D1',
      endpoint: 'https://push.example.test/sub/1',
      leadTimeSeconds: 90,
      expiresAt: 'soon',
    }))

    expect(readReminderPreference()).toEqual({
      stopId: 'COM3',
      routeId: 'D1',
      endpoint: 'https://push.example.test/sub/1',
      leadTimeSeconds: 120,
      expiresAt: null,
    })
  })

  it.each([
    ['not json', 'not json'],
    ['a missing route', JSON.stringify({ stopId: 'COM3', endpoint: 'https://push.example.test/sub/1' })],
    ['a blank stop', JSON.stringify({ stopId: '', routeId: 'D1', endpoint: 'https://push.example.test/sub/1' })],
  ])('discards %s rather than claiming a watch the server cannot hold', (_label, stored) => {
    window.localStorage.setItem(ALIGHT_REMINDER_PREFERENCE_STORAGE_KEY, stored)

    expect(readReminderPreference()).toBeNull()
  })

  it('is kept apart from the service-update preference', () => {
    savePushPreference({ topic: 'service-updates', endpoint: 'https://push.example.test/sub/1' })
    saveReminderPreference({
      stopId: 'COM3',
      routeId: 'D1',
      endpoint: 'https://push.example.test/sub/1',
      leadTimeSeconds: 120,
      expiresAt: null,
    })

    saveReminderPreference(null)

    expect(readReminderPreference()).toBeNull()
    expect(readPushPreference()).not.toBeNull()
  })
})

describe('enableReminder', () => {
  const ACKNOWLEDGEMENT = {
    topic: 'alight-reminders' as const,
    leadTimeSeconds: 60 as const,
    expiresAt: '2026-11-06T12:00:00.000Z',
  }

  it('requests permission only when called, then registers this stop, route and lead time', async () => {
    const request = vi.fn(async () => 'granted' as const)
    stubNotification('default', request)
    stubServiceWorker(fakeSubscription())
    const pushClient = client({ registerReminder: vi.fn(async () => ACKNOWLEDGEMENT) })

    const result = await enableReminder(pushClient, { stopId: 'COM3', routeId: 'D1', leadTimeSeconds: 60 })

    expect(request).toHaveBeenCalledOnce()
    expect(pushClient.registerReminder).toHaveBeenCalledWith({
      endpoint: 'https://push.example.test/sub/1',
      keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
      topic: 'alight-reminders',
      watch: { stopId: 'COM3', routeId: 'D1' },
      leadTimeSeconds: 60,
    })
    expect(result).toEqual({
      preference: {
        stopId: 'COM3',
        routeId: 'D1',
        endpoint: 'https://push.example.test/sub/1',
        // The server's echoed value is what the evaluator uses, so it is what is stored.
        leadTimeSeconds: 60,
        expiresAt: '2026-11-06T12:00:00.000Z',
      },
      permission: 'granted',
    })
    expect(readReminderPreference()).toEqual(result.preference)
  })

  it('keeps the chosen lead time when the server sends no usable acknowledgement', async () => {
    stubNotification('default', vi.fn(async () => 'granted' as const))
    stubServiceWorker(fakeSubscription())
    const pushClient = client()

    const result = await enableReminder(pushClient, { stopId: 'COM3', routeId: 'D1', leadTimeSeconds: 180 })

    expect(result.preference).toEqual({
      stopId: 'COM3',
      routeId: 'D1',
      endpoint: 'https://push.example.test/sub/1',
      leadTimeSeconds: 180,
      expiresAt: null,
    })
  })

  it('reuses the subscription service updates already created', async () => {
    stubNotification('default', vi.fn(async () => 'granted' as const))
    const subscribe = vi.fn()
    stubServiceWorker(fakeSubscription('https://push.example.test/shared'), subscribe)
    const pushClient = client()

    await enableReminder(pushClient, { stopId: 'COM3', routeId: 'D1', leadTimeSeconds: 120 })

    expect(subscribe).not.toHaveBeenCalled()
    expect(pushClient.registerReminder).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: 'https://push.example.test/shared' }),
    )
  })

  it('keeps the previous reminder when permission is refused', async () => {
    stubNotification('default', vi.fn(async () => 'denied' as const))
    const previous = {
      stopId: 'COM3',
      routeId: 'D1',
      endpoint: 'https://push.example.test/sub/1',
      leadTimeSeconds: 120 as const,
      expiresAt: null,
    }
    const pushClient = client()

    const result = await enableReminder(pushClient, { stopId: 'COM3', routeId: 'A1', leadTimeSeconds: 60 }, previous)

    expect(result).toEqual({ preference: previous, permission: 'denied' })
    expect(pushClient.registerReminder).not.toHaveBeenCalled()
  })
})

describe('disableReminder', () => {
  it('forgets the reminder on the server without cancelling the shared subscription', async () => {
    const subscription = fakeSubscription()
    stubServiceWorker(subscription)
    saveReminderPreference({
      stopId: 'COM3',
      routeId: 'D1',
      endpoint: subscription.endpoint,
      leadTimeSeconds: 120,
      expiresAt: null,
    })
    const pushClient = client()

    await expect(disableReminder(pushClient)).resolves.toBeNull()

    expect(pushClient.unregisterReminder).toHaveBeenCalledWith(subscription.endpoint)
    // Service updates use the same endpoint, so turning reminders off must not push them off too.
    expect(subscription.unsubscribe).not.toHaveBeenCalled()
    expect(readReminderPreference()).toBeNull()
  })

  it('keeps the reminder when the server call fails so the control stays honest', async () => {
    const subscription = fakeSubscription()
    stubServiceWorker(subscription)
    saveReminderPreference({
      stopId: 'COM3',
      routeId: 'D1',
      endpoint: subscription.endpoint,
      leadTimeSeconds: 120,
      expiresAt: null,
    })
    const pushClient = client({ unregisterReminder: vi.fn(async () => { throw new Error('network') }) })

    await expect(disableReminder(pushClient)).rejects.toThrow('network')
    expect(readReminderPreference()).not.toBeNull()
  })
})

describe('createPushNotificationService', () => {
  it('exposes reminders through the domain port without leaking the HTTP client', async () => {
    stubNotification('default', vi.fn(async () => 'granted' as const))
    stubServiceWorker(fakeSubscription())
    const pushClient = client({
      registerReminder: vi.fn(async () => ({
        topic: 'alight-reminders' as const,
        leadTimeSeconds: 120 as const,
        expiresAt: '2026-11-06T12:00:00.000Z',
      })),
    })
    const service = createPushNotificationService(pushClient)

    await service.enableReminder({ stopId: 'COM3', routeId: 'D1', leadTimeSeconds: 120 })

    expect(pushClient.registerReminder).toHaveBeenCalledOnce()
    expect(service.readReminder()).toEqual({
      stopId: 'COM3',
      routeId: 'D1',
      endpoint: 'https://push.example.test/sub/1',
      leadTimeSeconds: 120,
      expiresAt: '2026-11-06T12:00:00.000Z',
    })
  })
})
