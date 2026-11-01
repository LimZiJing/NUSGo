// @vitest-environment jsdom

import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ApiShuttleVehiclesResponse } from '@nusgo/shared'
import {
  type ShuttleVehicleLoader,
  useShuttleVehicles,
} from './use-shuttle-vehicles'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const firstSnapshot: ApiShuttleVehiclesResponse = {
  observedAt: '2026-11-02T00:00:00.000Z',
  expiresAt: '2026-11-02T00:01:30.000Z',
  vehicles: [{
    routeId: 'D2',
    plate: 'PD726D',
    lat: 1.291666,
    lng: 103.783352,
    headingDegrees: 310,
    speed: 15,
    load: 'medium',
    observedAt: '2026-11-02T00:00:00.000Z',
    expiresAt: '2026-11-02T00:01:30.000Z',
  }],
}

const latestSnapshot: ApiShuttleVehiclesResponse = {
  observedAt: '2026-11-02T00:00:30.000Z',
  expiresAt: '2026-11-02T00:02:00.000Z',
  vehicles: [{
    ...firstSnapshot.vehicles[0],
    routeId: 'A1',
    plate: 'PDNEW',
    observedAt: '2026-11-02T00:00:30.000Z',
    expiresAt: '2026-11-02T00:02:00.000Z',
  }],
}

function Probe({
  loader,
  routeIds = ['D2'],
}: {
  readonly loader: ShuttleVehicleLoader
  readonly routeIds?: readonly string[]
}) {
  const state = useShuttleVehicles(loader, true, routeIds)
  return <output data-testid="vehicle-state">{state.status}:{state.snapshot?.vehicles[0]?.plate ?? 'none'}</output>
}

function setVisibility(state: DocumentVisibilityState): void {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: state })
}

describe('useShuttleVehicles', () => {
  it('pauses polling while hidden and refreshes when the page becomes visible', async () => {
    vi.useFakeTimers()
    const visibilityDescriptor = Object.getOwnPropertyDescriptor(document, 'visibilityState')
    setVisibility('hidden')
    const loader = vi.fn<ShuttleVehicleLoader>(async () => firstSnapshot)

    try {
      render(<Probe loader={loader} />)
      await act(async () => undefined)
      expect(loader).not.toHaveBeenCalled()

      setVisibility('visible')
      await act(async () => {
        document.dispatchEvent(new Event('visibilitychange'))
      })
      expect(loader).toHaveBeenCalledOnce()

      setVisibility('hidden')
      await act(async () => {
        document.dispatchEvent(new Event('visibilitychange'))
        await vi.advanceTimersByTimeAsync(60_000)
      })
      expect(loader).toHaveBeenCalledOnce()
    } finally {
      if (visibilityDescriptor) Object.defineProperty(document, 'visibilityState', visibilityDescriptor)
      else Reflect.deleteProperty(document, 'visibilityState')
    }
  })

  it('aborts a superseded request and ignores its late response', async () => {
    vi.useFakeTimers()
    let resolveFirst: (value: ApiShuttleVehiclesResponse) => void = () => undefined
    let resolveLatest: (value: ApiShuttleVehiclesResponse) => void = () => undefined
    const firstSignal: { current: AbortSignal | null } = { current: null }
    const loader = vi.fn<ShuttleVehicleLoader>()
      .mockImplementationOnce((_routeIds, signal) => {
        firstSignal.current = signal
        return new Promise((resolve) => { resolveFirst = resolve })
      })
      .mockImplementationOnce(() => new Promise((resolve) => { resolveLatest = resolve }))
    const visibilityDescriptor = Object.getOwnPropertyDescriptor(document, 'visibilityState')
    setVisibility('visible')

    try {
      render(<Probe loader={loader} />)
      await act(async () => undefined)
      expect(loader).toHaveBeenCalledOnce()

      setVisibility('hidden')
      await act(async () => {
        document.dispatchEvent(new Event('visibilitychange'))
      })
      expect(firstSignal.current?.aborted).toBe(true)

      setVisibility('visible')
      await act(async () => {
        document.dispatchEvent(new Event('visibilitychange'))
      })
      expect(loader).toHaveBeenCalledTimes(2)

      await act(async () => { resolveLatest(latestSnapshot) })
      expect(screen.getByTestId('vehicle-state').textContent).toBe('ready:PDNEW')

      await act(async () => { resolveFirst(firstSnapshot) })
      expect(screen.getByTestId('vehicle-state').textContent).toBe('ready:PDNEW')
    } finally {
      if (visibilityDescriptor) Object.defineProperty(document, 'visibilityState', visibilityDescriptor)
      else Reflect.deleteProperty(document, 'visibilityState')
    }
  })
})
