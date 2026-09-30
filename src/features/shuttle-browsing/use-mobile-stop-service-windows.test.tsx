// @vitest-environment jsdom

import { act, cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  useMobileStopServiceWindows,
  type MobileStopServiceWindowsLoader,
} from './use-mobile-stop-service-windows'

function Probe({
  client,
  routeIds,
}: {
  readonly client: MobileStopServiceWindowsLoader
  readonly routeIds: readonly string[]
}) {
  useMobileStopServiceWindows(client, true, routeIds)
  return null
}

afterEach(() => cleanup())

describe('useMobileStopServiceWindows', () => {
  it('does not reload when the same route request is recreated', async () => {
    const client = vi.fn<MobileStopServiceWindowsLoader>(async () => ({}))
    const { rerender } = render(<Probe client={client} routeIds={['A1']} />)
    await act(async () => undefined)

    rerender(<Probe client={client} routeIds={['A1']} />)
    await act(async () => undefined)

    expect(client).toHaveBeenCalledOnce()
  })

  it('does not reload when the same route requests are reordered', async () => {
    const client = vi.fn<MobileStopServiceWindowsLoader>(async () => ({}))
    const { rerender } = render(<Probe client={client} routeIds={['A1', 'D2']} />)
    await act(async () => undefined)

    rerender(<Probe client={client} routeIds={['D2', 'A1']} />)
    await act(async () => undefined)

    expect(client).toHaveBeenCalledOnce()
  })
})
