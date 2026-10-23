// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { readBrowserLocationPermission } from './browser-permissions'

const originalPermissions = Object.getOwnPropertyDescriptor(navigator, 'permissions')

afterEach(() => {
  if (originalPermissions) {
    Object.defineProperty(navigator, 'permissions', originalPermissions)
  } else {
    Reflect.deleteProperty(navigator, 'permissions')
  }
})

describe('browser location permission', () => {
  it.each(['granted', 'denied', 'prompt'] as const)(
    'reports a %s permission state without requesting location',
    async (state) => {
      const query = vi.fn().mockResolvedValue({ state })
      Object.defineProperty(navigator, 'permissions', {
        configurable: true,
        value: { query },
      })

      await expect(readBrowserLocationPermission()).resolves.toBe(state)
      expect(query).toHaveBeenCalledExactlyOnceWith({ name: 'geolocation' })
    },
  )

  it('reports unavailable when the permission API is absent or rejects the query', async () => {
    Object.defineProperty(navigator, 'permissions', {
      configurable: true,
      value: undefined,
    })
    await expect(readBrowserLocationPermission()).resolves.toBe('unavailable')

    Object.defineProperty(navigator, 'permissions', {
      configurable: true,
      value: { query: vi.fn().mockRejectedValue(new Error('unsupported')) },
    })
    await expect(readBrowserLocationPermission()).resolves.toBe('unavailable')
  })
})
