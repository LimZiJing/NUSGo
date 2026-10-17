import { describe, expect, it, vi } from 'vitest'
import { createShuttleServiceHoursClient } from './client'

describe('createShuttleServiceHoursClient', () => {
  it('requests route IDs through the root-relative API path by default', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
      routes: {
        D2: [{ routeId: 'D2', firstTime: '07:15', lastTime: '23:00', dayType: 'Mon-Fri', dates: [] }],
      },
    }), { status: 200 }))
    const result = await createShuttleServiceHoursClient({ fetcher }).getServiceWindows(['D2', 'D2'], new AbortController().signal)

    expect(fetcher).toHaveBeenCalledWith(
      '/api/shuttle-service-windows?routes=D2',
      { signal: expect.any(AbortSignal) },
    )
    expect(result.D2?.[0]?.firstTime).toBe('07:15')
  })

  it('requests service windows from the configured API origin', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ routes: {} }), { status: 200 }))
    const client = createShuttleServiceHoursClient({
      apiOrigin: 'https://api.example.test',
      fetcher,
    })

    await client.getServiceWindows(['D2'], new AbortController().signal)

    expect(fetcher.mock.calls[0]?.[0]).toBe('https://api.example.test/api/shuttle-service-windows?routes=D2')
  })
})
