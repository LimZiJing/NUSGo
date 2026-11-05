import { lstat as defaultLstat, rm as defaultRm } from 'node:fs/promises'
import { resolve, sep, basename } from 'node:path'

export async function removeIsolatedBrowserProfile(profile, helperRoot, fs = {}) {
  if (!profile) return
  const resolvedHelper = resolve(helperRoot)
  const resolvedProfile = resolve(profile)
  if (!resolvedProfile.startsWith(`${resolvedHelper}${sep}`) || !basename(resolvedProfile).startsWith('browser-profile-')) {
    throw new Error(`Refusing to remove browser profile outside the measurement directory: ${resolvedProfile}`)
  }
  const lstat = fs.lstat ?? defaultLstat
  const rm = fs.rm ?? defaultRm
  try {
    if (!(await lstat(resolvedProfile)).isSymbolicLink()) {
      await rm(resolvedProfile, { recursive: true, maxRetries: 10, retryDelay: 200 })
    }
  } catch (error) {
    if (!['ENOENT', 'EBUSY', 'EPERM'].includes(error.code)) throw error
  }
}

export async function withServerCleanup(stopBrowserOnly, stopServers) {
  try {
    await stopBrowserOnly()
  } catch (error) {
    console.error(`Browser cleanup failed: ${error}`)
  } finally {
    await stopServers()
  }
}
