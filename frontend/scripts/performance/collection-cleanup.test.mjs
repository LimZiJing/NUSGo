import { expect, it, vi } from 'vitest'
import { removeIsolatedBrowserProfile, withServerCleanup } from './collection-cleanup.mjs'

const helperRoot = 'C:/measurements/performance'
const profile = `${helperRoot}/browser-profile-123`

it.each(['EBUSY', 'EPERM'])('retries and tolerates a final %s while removing the isolated browser profile', async (code) => {
  const rm = vi.fn(async (_path, options) => {
    expect(options).toEqual({ recursive: true, maxRetries: 10, retryDelay: 200 })
    throw Object.assign(new Error(code), { code })
  })
  await expect(removeIsolatedBrowserProfile(profile, helperRoot, {
    lstat: async () => ({ isSymbolicLink: () => false }),
    rm,
  })).resolves.toBeUndefined()
  expect(rm).toHaveBeenCalledTimes(1)
})

it('does not remove a symbolic browser-profile link', async () => {
  const rm = vi.fn()
  await removeIsolatedBrowserProfile(profile, helperRoot, {
    lstat: async () => ({ isSymbolicLink: () => true }),
    rm,
  })
  expect(rm).not.toHaveBeenCalled()
})

it('always stops preview servers when browser cleanup throws and preserves the measurement error', async () => {
  const error = new Error('profile lock')
  const stopServers = vi.fn()
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  try {
    await expect(withServerCleanup(async () => { throw error }, stopServers)).resolves.toBeUndefined()
    expect(stopServers).toHaveBeenCalledOnce()
    expect(log).toHaveBeenCalledWith(`Browser cleanup failed: ${error}`)
  } finally {
    log.mockRestore()
  }
})
