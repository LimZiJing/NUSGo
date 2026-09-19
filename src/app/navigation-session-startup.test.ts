import { describe, expect, it, vi } from 'vitest'
import { createNavigationSessionStartup } from './navigation-session-startup'

function createDeferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

describe('createNavigationSessionStartup', () => {
  it('does not invoke loaders when the caller signal is already aborted', async () => {
    const startup = createNavigationSessionStartup()
    const signal = new AbortController()
    signal.abort()
    const loadVenues = vi.fn(async () => undefined)
    const loadTransit = vi.fn(async () => undefined)
    await startup.start(signal.signal, { loadVenues, loadTransit })

    expect(loadVenues).not.toHaveBeenCalled()
    expect(loadTransit).not.toHaveBeenCalled()
  })

  it('shares one startup promise and propagates caller abort to both loaders', async () => {
    const startup = createNavigationSessionStartup()
    const external = new AbortController()
    const venues = createDeferred<void>()
    const transit = createDeferred<void>()
    const signals: AbortSignal[] = []
    const loadVenues = vi.fn((signal: AbortSignal) => {
      signals.push(signal)
      return venues.promise
    })
    const loadTransit = vi.fn((signal: AbortSignal) => {
      signals.push(signal)
      return transit.promise
    })

    const firstStart = startup.start(external.signal, { loadVenues, loadTransit })
    const secondStart = startup.start(new AbortController().signal, { loadVenues, loadTransit })
    expect(secondStart).toBe(firstStart)
    expect(loadVenues).toHaveBeenCalledOnce()
    expect(loadTransit).toHaveBeenCalledOnce()

    external.abort()
    expect(signals[0]?.aborted).toBe(true)
    expect(signals[1]).toBe(signals[0])

    venues.resolve()
    transit.resolve()
    await firstStart
  })

  it('removes the caller listener after settlement and aborts on disposal', async () => {
    const startup = createNavigationSessionStartup()
    const external = new AbortController()
    const removeExternalListener = vi.spyOn(external.signal, 'removeEventListener')
    const loadVenues = vi.fn(async () => undefined)
    const loadTransit = vi.fn(async () => undefined)

    await startup.start(external.signal, { loadVenues, loadTransit })
    expect(removeExternalListener).toHaveBeenCalledOnce()

    const pendingStartup = createNavigationSessionStartup()
    const pendingExternal = new AbortController()
    const removePendingListener = vi.spyOn(pendingExternal.signal, 'removeEventListener')
    const pendingSignal = new Promise<void>(() => undefined)
    const pendingLoadVenues = vi.fn((signal: AbortSignal) => {
      expect(signal.aborted).toBe(false)
      return pendingSignal
    })
    const pendingLoadTransit = vi.fn(async () => undefined)
    void pendingStartup.start(pendingExternal.signal, {
      loadVenues: pendingLoadVenues,
      loadTransit: pendingLoadTransit,
    })
    pendingStartup.dispose()
    expect(pendingLoadVenues.mock.calls[0]?.[0].aborted).toBe(true)
    expect(removePendingListener).toHaveBeenCalledOnce()
  })
})
