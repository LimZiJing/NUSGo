// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ShuttleArrivalSnapshot } from '../../domain/transit/arrivals'
import {
  type MobileStopArrivalLoader,
  type MobileStopArrivalStopRequest,
  useMobileStopArrivals,
} from './use-mobile-stop-arrivals'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const stops: readonly MobileStopArrivalStopRequest[] = [
  { stopId: 'STOP-A', stopName: 'Stop A' },
]

const snapshot: ShuttleArrivalSnapshot = {
  observedAt: '2026-09-30T00:00:00.000Z',
  expiresAt: '2026-09-30T00:01:00.000Z',
  stops: { 'STOP-A': {} },
}

function Probe({
  client,
  active,
}: {
  readonly client: MobileStopArrivalLoader
  readonly active: boolean
}) {
  const state = useMobileStopArrivals(client, active, stops)
  return <output data-testid="status">{state.status}</output>
}

describe('useMobileStopArrivals', () => {
  it('loads immediately and refreshes active Stops at the 30-second interval', async () => {
    vi.useFakeTimers()
    const client: MobileStopArrivalLoader = vi.fn(async () => snapshot)

    render(<Probe client={client} active />)
    await act(async () => undefined)
    expect(client).toHaveBeenCalledOnce()
    expect(screen.getByTestId('status').textContent).toBe('ready')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000)
    })

    expect(client).toHaveBeenCalledTimes(2)
  })

  it('does not request while inactive and aborts an active request during cleanup', async () => {
    let resolveRequest: (value: ShuttleArrivalSnapshot) => void = () => undefined
    let requestSignal: AbortSignal | undefined
    const client: MobileStopArrivalLoader = vi.fn((_requestedStops, signal) => {
        requestSignal = signal
        return new Promise<ShuttleArrivalSnapshot>((resolve) => {
          resolveRequest = resolve
        })
      })

    const { rerender } = render(<Probe client={client} active={false} />)
    expect(client).not.toHaveBeenCalled()

    rerender(<Probe client={client} active />)
    await waitFor(() => expect(client).toHaveBeenCalledOnce())
    expect(requestSignal?.aborted).toBe(false)

    rerender(<Probe client={client} active={false} />)
    expect(requestSignal?.aborted).toBe(true)
    resolveRequest(snapshot)
  })

  it('publishes an error state when the arrivals interface fails', async () => {
    const client: MobileStopArrivalLoader = vi.fn(async () => {
        throw new Error('provider unavailable')
      })

    render(<Probe client={client} active />)
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('error'))
  })
})
