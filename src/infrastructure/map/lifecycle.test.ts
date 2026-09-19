import { describe, expect, it, vi } from 'vitest'
import { waitForMapStyleLoaded } from './lifecycle'

vi.mock('maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url', () => ({
  default: 'worker.js',
}))

vi.mock('maplibre-gl', () => ({
  Map: class {},
  NavigationControl: class {},
  setWorkerUrl: vi.fn(),
}))

describe('map lifecycle style readiness', () => {
  it('removes load and abort listeners when a pending style load is aborted', async () => {
    let loadHandler: (() => void) | undefined
    const map = {
      isStyleLoaded: vi.fn(() => false),
      once: vi.fn((_event: string, handler: () => void) => {
        loadHandler = handler
        return map
      }),
      off: vi.fn(() => map),
    }
    const controller = new AbortController()
    const removeEventListener = vi.spyOn(controller.signal, 'removeEventListener')
    const pending = waitForMapStyleLoaded(map as never, controller.signal)

    controller.abort()

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    expect(map.off).toHaveBeenCalledWith('load', loadHandler)
    expect(removeEventListener).toHaveBeenCalledWith('abort', expect.any(Function))
  })
})
